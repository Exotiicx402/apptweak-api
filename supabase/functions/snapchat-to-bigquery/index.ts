import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create Supabase client for logging
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  return createClient(supabaseUrl, supabaseKey);
}

// Log sync operation to database
async function logSync(
  syncDate: string,
  status: 'success' | 'error',
  rowsAffected: number | null,
  durationMs: number,
  errorMessage?: string
) {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('sync_logs').insert({
      source: 'snapchat',
      sync_date: syncDate,
      status,
      rows_affected: rowsAffected,
      duration_ms: durationMs,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error('Failed to log sync:', err);
  }
}

type CachedOAuthToken = { token: string; expiresAtMs: number };
let snapchatTokenCache: CachedOAuthToken | null = null;

// Get yesterday's date in YYYY-MM-DD format
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Helper function to sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============= Timezone helper functions =============
function parseYmd(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${dateStr} (expected YYYY-MM-DD)`);
  return { year: y, month: m, day: d };
}

function addDaysYmd(dateStr: string, days: number): string {
  const { year, month, day } = parseYmd(dateStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function getZonedParts(utcDate: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(utcDate);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const hour = Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(utcDate: Date, timeZone: string): number {
  const p = getZonedParts(utcDate, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcDate.getTime();
}

function getUtcMsForZonedMidnight(dateStr: string, timeZone: string): number {
  const { year, month, day } = parseYmd(dateStr);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

  let utcMs = localMidnightAsUtc;
  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const nextUtcMs = localMidnightAsUtc - offset;
    if (Math.abs(nextUtcMs - utcMs) < 1000) break;
    utcMs = nextUtcMs;
  }

  return utcMs;
}

function resolveAccountDayRangeUtc(dateStr: string, timeZone: string): { startTime: string; endTime: string } {
  const startMs = getUtcMsForZonedMidnight(dateStr, timeZone);
  const nextDate = addDaysYmd(dateStr, 1);
  const endMs = getUtcMsForZonedMidnight(nextDate, timeZone);
  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
  };
}

// Exchange refresh token for access token with retry logic for rate limiting
async function getSnapchatAccessToken(maxRetries = 3): Promise<string> {
  const clientId = Deno.env.get('SNAPCHAT_CLIENT_ID');
  const clientSecret = Deno.env.get('SNAPCHAT_CLIENT_SECRET');
  const refreshToken = Deno.env.get('SNAPCHAT_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Snapchat OAuth credentials');
  }

  if (snapchatTokenCache && Date.now() < snapchatTokenCache.expiresAtMs - 60_000) {
    console.log('Reusing cached Snapchat access token');
    return snapchatTokenCache.token;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Exchanging Snapchat refresh token for access token (attempt ${attempt}/${maxRetries})...`);

    try {
      const response = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited by Snapchat API (429). Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Snapchat token error:', errorText);
        throw new Error(`Failed to get Snapchat access token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const expiresInSec = Number(data.expires_in ?? 3600);
      snapchatTokenCache = {
        token: data.access_token,
        expiresAtMs: Date.now() + expiresInSec * 1000,
      };
      console.log('Successfully obtained Snapchat access token');
      return data.access_token;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`Token request failed. Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
      }
    }
  }

  throw lastError || new Error('Failed to get Snapchat access token after retries');
}

// Get Google access token for BigQuery
async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials');
  }

  console.log('Exchanging Google refresh token for access token...');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google token error:', errorText);
    throw new Error(`Failed to get Google access token: ${response.status}`);
  }

  const data = await response.json();
  console.log('Successfully obtained Google access token');
  return data.access_token;
}

// Fetch campaign names from Snapchat API
async function fetchCampaignNames(accessToken: string): Promise<Map<string, string>> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  const campaignMap = new Map<string, string>();

  if (!adAccountId) {
    console.warn('Missing SNAPCHAT_AD_ACCOUNT_ID for campaign name lookup');
    return campaignMap;
  }

  try {
    console.log('Fetching campaign names...');
    const response = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/campaigns?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch campaign names: ${response.status}`);
      return campaignMap;
    }

    const data = await response.json();
    if (data.campaigns && Array.isArray(data.campaigns)) {
      for (const wrapper of data.campaigns) {
        const campaign = wrapper.campaign;
        if (campaign?.id && campaign?.name) {
          campaignMap.set(campaign.id, campaign.name);
        }
      }
    }

    console.log(`Fetched names for ${campaignMap.size} campaigns`);
  } catch (error) {
    console.warn('Error fetching campaign names:', error);
  }

  return campaignMap;
}

// Fetch account-level stats (no breakdown) for verification
// Note: Snapchat API only supports 'spend' field at account level without breakdown
async function fetchAccountLevelStats(accessToken: string, date: string): Promise<{
  spend: number;
  note: string;
}> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  if (!adAccountId) {
    throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');
  }

  const accountTimeZone = Deno.env.get('SNAPCHAT_ACCOUNT_TIMEZONE') || 'America/Toronto';
  const { startTime, endTime } = resolveAccountDayRangeUtc(date, accountTimeZone);

  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'DAY');
  // No breakdown - get account totals
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  // Only 'spend' is supported at account level without breakdown
  url.searchParams.set('fields', 'spend');

  console.log(`Fetching account-level stats for ${date} (no breakdown, spend only)`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Account-level stats API error: ${response.status} ${errorText}`);
    // Return zeros if account-level query fails - don't block the sync
    return { spend: 0, note: `API error: ${response.status}` };
  }

  const data = await response.json();
  
  let totalSpend = 0;

  // Account-level response structure (no breakdown)
  if (Array.isArray(data.timeseries_stats)) {
    for (const wrapper of data.timeseries_stats) {
      const timeseriesStat = wrapper?.timeseries_stat;
      if (!timeseriesStat) continue;

      const timeseries = timeseriesStat.timeseries;
      if (Array.isArray(timeseries)) {
        for (const dayData of timeseries) {
          totalSpend += (dayData.stats?.spend || 0) / 1000000;
        }
      }
    }
  }

  console.log(`Account-level total spend: $${totalSpend.toFixed(2)}`);
  return { spend: totalSpend, note: 'Only spend is available at account level (API limitation)' };
}

// Fetch Snapchat campaign stats for a given date (DAY granularity, campaign breakdown)
async function fetchSnapchatStats(accessToken: string, date: string, campaignNames: Map<string, string>): Promise<{ stats: any[]; campaignTotals: { spend: number; impressions: number; installs: number } }> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');

  if (!adAccountId) {
    throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');
  }

  const accountTimeZone = Deno.env.get('SNAPCHAT_ACCOUNT_TIMEZONE') || 'America/Toronto';
  const { startTime, endTime } = resolveAccountDayRangeUtc(date, accountTimeZone);

  console.log(`Querying date range: ${startTime} to ${endTime} (account TZ: ${accountTimeZone})`);
  console.log(`Fetching Snapchat stats for ad account ${adAccountId} on ${date}`);

  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'DAY');
  url.searchParams.set('breakdown', 'campaign');
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  url.searchParams.set('limit', '200');
  url.searchParams.set('fields', 'impressions,swipes,spend,video_views,screen_time_millis,quartile_1,quartile_2,quartile_3,view_completion,total_installs,conversion_purchases,conversion_purchases_value');
  // Attribution windows: 28-day swipe, 1-day view (matches Snapchat Ads Manager default)
  url.searchParams.set('swipe_up_attribution_window', '28_DAY');
  url.searchParams.set('view_attribution_window', '1_DAY');
  url.searchParams.set('action_report_time', 'conversion');

  console.log(`Calling Snapchat API: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Snapchat API error: ${response.status} ${errorText}`);
    throw new Error(`Snapchat API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log(`Snapchat API response received`);

  const stats: any[] = [];
  let campaignTotalSpend = 0;
  let campaignTotalImpressions = 0;
  let campaignTotalInstalls = 0;

  console.log(`Response keys: ${Object.keys(data).join(', ')}`);
  console.log(`timeseries_stats count: ${Array.isArray(data.timeseries_stats) ? data.timeseries_stats.length : 0}`);

  if (Array.isArray(data.timeseries_stats)) {
    for (const wrapper of data.timeseries_stats) {
      const timeseriesStat = wrapper?.timeseries_stat;
      if (!timeseriesStat) {
        console.warn('No timeseries_stat found in wrapper');
        continue;
      }

      const breakdownStats = timeseriesStat.breakdown_stats;
      if (!breakdownStats?.campaign || !Array.isArray(breakdownStats.campaign)) {
        console.warn('No breakdown_stats.campaign found');
        console.warn(`timeseries_stat keys: ${Object.keys(timeseriesStat).join(', ')}`);
        continue;
      }

      console.log(`Found ${breakdownStats.campaign.length} campaigns in breakdown_stats`);

      for (const campaign of breakdownStats.campaign) {
        const campaignId = campaign.id || 'unknown';
        const campaignName = campaignNames.get(campaignId) || campaignId;

        console.log(`Processing campaign ${campaignId} (${campaignName})`);

        // For DAY granularity, timeseries has one entry with daily totals
        const timeseries = campaign.timeseries;
        if (Array.isArray(timeseries) && timeseries.length > 0) {
          const dayData = timeseries[0];
          const s = dayData.stats || {};
          
          const rowSpend = (s.spend || 0) / 1000000;
          const rowImpressions = s.impressions || 0;
          const rowInstalls = s.total_installs || 0;

          campaignTotalSpend += rowSpend;
          campaignTotalImpressions += rowImpressions;
          campaignTotalInstalls += rowInstalls;

          stats.push({
            timestamp: dayData.start_time,
            campaign_id: campaignId,
            campaign_name: campaignName,
            impressions: rowImpressions,
            swipes: s.swipes || 0,
            spend: rowSpend,
            video_views: s.video_views || 0,
            screen_time_millis: s.screen_time_millis || 0,
            quartile_1: s.quartile_1 || 0,
            quartile_2: s.quartile_2 || 0,
            quartile_3: s.quartile_3 || 0,
            view_completion: s.view_completion || 0,
            total_installs: rowInstalls,
            conversion_purchases: s.conversion_purchases || 0,
            conversion_purchases_value: (s.conversion_purchases_value || 0) / 1000000,
          });
        } else {
          console.warn(`No timeseries data found for campaign ${campaignId}`);
        }
      }
    }
  }

  console.log(`Extracted ${stats.length} daily campaign stat records`);
  console.log(`Campaign breakdown totals: spend=$${campaignTotalSpend.toFixed(2)}, impressions=${campaignTotalImpressions}, installs=${campaignTotalInstalls}`);
  
  return { 
    stats, 
    campaignTotals: { 
      spend: campaignTotalSpend, 
      impressions: campaignTotalImpressions, 
      installs: campaignTotalInstalls 
    } 
  };
}

// Format timestamp for BigQuery - correctly handles timezone offsets
// Snapchat returns timestamps like "2026-01-01T00:00:00.000-05:00"
// We parse the full ISO string (including offset) and convert to UTC for BigQuery
function formatTimestamp(isoString: string): string {
  // Parse the ISO string with offset into a Date object (this handles the timezone correctly)
  const date = new Date(isoString);
  // Format as BigQuery-friendly UTC timestamp: "YYYY-MM-DD HH:MM:SS"
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  const formatted = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  console.log(`Timestamp conversion: ${isoString} -> ${formatted} (UTC)`);
  return formatted;
}

// Transform data for BigQuery schema
function transformData(stats: any[], fetchedAt: string): any[] {
  return stats.map(row => ({
    timestamp: formatTimestamp(row.timestamp),
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    impressions: row.impressions,
    swipes: row.swipes,
    spend: row.spend,
    video_views: row.video_views,
    screen_time_millis: row.screen_time_millis,
    quartile_1: row.quartile_1,
    quartile_2: row.quartile_2,
    quartile_3: row.quartile_3,
    view_completion: row.view_completion,
    total_installs: row.total_installs,
    conversion_purchases: row.conversion_purchases,
    conversion_purchases_value: row.conversion_purchases_value,
    fetched_at: fetchedAt,
  }));
}

// Get BigQuery target table configuration
function resolveBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  const rawProjectId = Deno.env.get('BQ_PROJECT_ID')?.trim();
  const rawDatasetId = Deno.env.get('BQ_DATASET_ID')?.trim();
  const rawTableId = Deno.env.get('SNAPCHAT_BQ_TABLE_ID')?.trim();

  let projectId = rawProjectId || '';
  let datasetId = rawDatasetId || '';
  let tableId = rawTableId || '';

  const splitRef = (value: string) => value.replace(/`/g, '').split(/[.:]/).filter(Boolean);

  if (tableId && (tableId.includes('.') || tableId.includes(':'))) {
    const parts = splitRef(tableId);
    if (parts.length >= 3) {
      projectId = parts[0];
      datasetId = parts[1];
      tableId = parts[2];
    } else if (parts.length === 2) {
      datasetId = parts[0];
      tableId = parts[1];
    }
  }

  if (datasetId && (datasetId.includes('.') || datasetId.includes(':'))) {
    const parts = splitRef(datasetId);
    if (parts.length >= 2) {
      projectId = projectId || parts[0];
      datasetId = parts[1];
      if (!tableId && parts.length >= 3) {
        tableId = parts[2];
      }
    }
  }

  if (projectId && (projectId.includes('.') || projectId.includes(':'))) {
    const parts = splitRef(projectId);
    if (parts.length >= 1) {
      projectId = parts[0];
      if (!datasetId && parts.length >= 2) datasetId = parts[1];
      if (!tableId && parts.length >= 3) tableId = parts[2];
    }
  }

  if (!projectId || !datasetId || !tableId) {
    throw new Error('Missing BigQuery configuration (BQ_PROJECT_ID, BQ_DATASET_ID, SNAPCHAT_BQ_TABLE_ID)');
  }

  console.log('Resolved BigQuery target', {
    rawProjectId,
    rawDatasetId,
    rawTableId,
    projectId,
    datasetId,
    tableId,
  });

  return { projectId, datasetId, tableId };
}

// Merge data into BigQuery using MERGE statement
async function mergeIntoBigQuery(rows: any[], accessToken: string): Promise<void> {
  const { projectId, datasetId, tableId } = resolveBigQueryTarget();

  if (rows.length === 0) {
    console.log('No rows to merge into BigQuery');
    return;
  }

  console.log(`Merging ${rows.length} rows into BigQuery table ${projectId}.${datasetId}.${tableId}`);

  // Build VALUES clause for the MERGE statement
  const valuesRows = rows.map(row => {
    return `(
      TIMESTAMP '${row.timestamp}',
      '${row.campaign_id.replace(/'/g, "''")}',
      '${row.campaign_name.replace(/'/g, "''")}',
      ${row.impressions},
      ${row.swipes},
      ${row.spend},
      ${row.video_views},
      ${row.screen_time_millis},
      ${row.quartile_1},
      ${row.quartile_2},
      ${row.quartile_3},
      ${row.view_completion},
      ${row.total_installs},
      ${row.conversion_purchases},
      ${row.conversion_purchases_value},
      TIMESTAMP '${row.fetched_at}'
    )`;
  }).join(',\n');

  const mergeQuery = `
    MERGE \`${projectId}.${datasetId}.${tableId}\` AS target
    USING (
      SELECT * FROM UNNEST([
        STRUCT<
          timestamp TIMESTAMP,
          campaign_id STRING,
          campaign_name STRING,
          impressions INT64,
          swipes INT64,
          spend FLOAT64,
          video_views INT64,
          screen_time_millis INT64,
          quartile_1 INT64,
          quartile_2 INT64,
          quartile_3 INT64,
          view_completion INT64,
          total_installs INT64,
          conversion_purchases INT64,
          conversion_purchases_value FLOAT64,
          fetched_at TIMESTAMP
        >
        ${valuesRows}
      ])
    ) AS source
    ON target.timestamp = source.timestamp AND target.campaign_id = source.campaign_id
    WHEN MATCHED THEN UPDATE SET
      campaign_name = source.campaign_name,
      impressions = source.impressions,
      swipes = source.swipes,
      spend = source.spend,
      video_views = source.video_views,
      screen_time_millis = source.screen_time_millis,
      quartile_1 = source.quartile_1,
      quartile_2 = source.quartile_2,
      quartile_3 = source.quartile_3,
      view_completion = source.view_completion,
      total_installs = source.total_installs,
      conversion_purchases = source.conversion_purchases,
      conversion_purchases_value = source.conversion_purchases_value,
      fetched_at = source.fetched_at
    WHEN NOT MATCHED THEN INSERT (
      timestamp, campaign_id, campaign_name, impressions, swipes, spend,
      video_views, screen_time_millis, quartile_1, quartile_2, quartile_3,
      view_completion, total_installs, conversion_purchases, conversion_purchases_value, fetched_at
    ) VALUES (
      source.timestamp, source.campaign_id, source.campaign_name, source.impressions, source.swipes, source.spend,
      source.video_views, source.screen_time_millis, source.quartile_1, source.quartile_2, source.quartile_3,
      source.view_completion, source.total_installs, source.conversion_purchases, source.conversion_purchases_value, source.fetched_at
    )
  `;

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: mergeQuery,
        useLegacySql: false,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`BigQuery API error: ${response.status} ${errorText}`);
    throw new Error(`BigQuery API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log(`BigQuery merge completed. Job ID: ${result.jobReference?.jobId}`);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let targetDate = getYesterdayDate();

  try {
    // Parse request body for optional date parameter
    try {
      const body = await req.json();
      if (body.date) {
        targetDate = body.date;
      }
    } catch {
      // No body or invalid JSON, use default date
    }

    console.log(`Starting Snapchat to BigQuery sync for date: ${targetDate}`);

    // Get access tokens
    const snapchatToken = await getSnapchatAccessToken();
    const googleToken = await getGoogleAccessToken();

    // Fetch campaign names
    const campaignNames = await fetchCampaignNames(snapchatToken);

    // Fetch both account-level and campaign-level stats in parallel
    const [accountStats, campaignResult] = await Promise.all([
      fetchAccountLevelStats(snapchatToken, targetDate),
      fetchSnapchatStats(snapchatToken, targetDate, campaignNames),
    ]);

    const { stats, campaignTotals } = campaignResult;

    // Check for spend discrepancy between account-level and campaign-level totals
    // Note: Snapchat API only supports 'spend' at account level, installs comparison not possible
    const spendDiff = Math.abs(accountStats.spend - campaignTotals.spend);
    
    if (accountStats.spend > 0 && spendDiff > 0.01) {
      console.warn(`⚠️ SPEND DISCREPANCY DETECTED:`);
      console.warn(`   Account-level total: $${accountStats.spend.toFixed(2)}`);
      console.warn(`   Campaign breakdown sum: $${campaignTotals.spend.toFixed(2)}`);
      console.warn(`   Difference: $${spendDiff.toFixed(2)} (${((spendDiff / accountStats.spend) * 100).toFixed(1)}% missing)`);
      console.warn(`   This may indicate campaigns not appearing in the breakdown.`);
    } else if (accountStats.spend === 0 && campaignTotals.spend > 0) {
      console.warn(`⚠️ Account-level query returned $0 but campaign breakdown shows $${campaignTotals.spend.toFixed(2)}`);
      console.warn(`   This might indicate an API issue with account-level queries.`);
    }

    if (stats.length === 0) {
      const duration = Date.now() - startTime;
      console.log('No Snapchat stats found for the specified date');
      await logSync(targetDate, 'success', 0, duration);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No data found for the specified date',
          date: targetDate,
          rowsProcessed: 0,
          accountTotals: accountStats,
          campaignTotals,
          discrepancy: { spend: spendDiff },
          durationMs: duration,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform and merge into BigQuery
    const fetchedAt = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const transformedData = transformData(stats, fetchedAt);
    await mergeIntoBigQuery(transformedData, googleToken);

    const duration = Date.now() - startTime;
    console.log(`Successfully synced ${transformedData.length} rows to BigQuery in ${duration}ms`);

    await logSync(targetDate, 'success', transformedData.length, duration);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced Snapchat data to BigQuery`,
        date: targetDate,
        rowsProcessed: transformedData.length,
        accountTotals: accountStats,
        campaignTotals,
        discrepancy: { spend: spendDiff },
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in snapchat-to-bigquery function:', error);
    
    await logSync(targetDate, 'error', null, duration, errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs: duration,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
