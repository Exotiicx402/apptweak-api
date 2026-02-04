import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Generate array of dates between start and end (inclusive)
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDaysYmd(current, 1);
  }
  return dates;
}

type CachedOAuthToken = { token: string; expiresAtMs: number };
let snapchatTokenCache: CachedOAuthToken | null = null;

// Exchange refresh token for access token with retry logic
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

// Fetch ad names for lookup
async function fetchAdNames(accessToken: string): Promise<Map<string, { name: string; campaignId: string }>> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  const adMap = new Map<string, { name: string; campaignId: string }>();

  if (!adAccountId) {
    console.warn('Missing SNAPCHAT_AD_ACCOUNT_ID for ad name lookup');
    return adMap;
  }

  try {
    console.log('Fetching ad names...');
    
    // First get all ad squads to map ads to campaigns
    const adSquadsResponse = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/adsquads?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    const adSquadToCampaign = new Map<string, string>();
    if (adSquadsResponse.ok) {
      const adSquadsData = await adSquadsResponse.json();
      if (adSquadsData.adsquads && Array.isArray(adSquadsData.adsquads)) {
        for (const wrapper of adSquadsData.adsquads) {
          const adSquad = wrapper.adsquad;
          if (adSquad?.id && adSquad?.campaign_id) {
            adSquadToCampaign.set(adSquad.id, adSquad.campaign_id);
          }
        }
      }
      console.log(`Fetched ${adSquadToCampaign.size} ad squads`);
    }

    // Now get all ads
    const adsResponse = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/ads?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!adsResponse.ok) {
      console.warn(`Failed to fetch ads: ${adsResponse.status}`);
      return adMap;
    }

    const adsData = await adsResponse.json();
    if (adsData.ads && Array.isArray(adsData.ads)) {
      for (const wrapper of adsData.ads) {
        const ad = wrapper.ad;
        if (ad?.id && ad?.name) {
          const campaignId = adSquadToCampaign.get(ad.ad_squad_id) || '';
          adMap.set(ad.id, { name: ad.name, campaignId });
        }
      }
    }

    console.log(`Fetched names for ${adMap.size} ads`);
  } catch (error) {
    console.warn('Error fetching ad names:', error);
  }

  return adMap;
}

// Fetch Snapchat ad-level stats for a given date
async function fetchSnapchatStatsForDate(
  accessToken: string,
  date: string,
  campaignNames: Map<string, string>,
  adNames: Map<string, { name: string; campaignId: string }>
): Promise<any[]> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');

  if (!adAccountId) {
    throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');
  }

  const accountTimeZone = Deno.env.get('SNAPCHAT_ACCOUNT_TIMEZONE') || 'America/Toronto';
  const { startTime, endTime } = resolveAccountDayRangeUtc(date, accountTimeZone);

  console.log(`[${date}] Fetching ad-level stats...`);

  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'DAY');
  url.searchParams.set('breakdown', 'ad');
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  url.searchParams.set('limit', '500');
  url.searchParams.set('fields', 'impressions,swipes,spend,video_views,screen_time_millis,quartile_1,quartile_2,quartile_3,view_completion,total_installs,conversion_purchases,conversion_purchases_value');
  url.searchParams.set('swipe_up_attribution_window', '7_DAY');
  url.searchParams.set('view_attribution_window', '1_DAY');
  url.searchParams.set('action_report_time', 'impression');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${date}] Snapchat API error: ${response.status} ${errorText}`);
    throw new Error(`Snapchat API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const stats: any[] = [];

  if (Array.isArray(data.timeseries_stats)) {
    for (const wrapper of data.timeseries_stats) {
      const timeseriesStat = wrapper?.timeseries_stat;
      if (!timeseriesStat) continue;

      const breakdownStats = timeseriesStat.breakdown_stats;
      if (!breakdownStats?.ad || !Array.isArray(breakdownStats.ad)) continue;

      for (const ad of breakdownStats.ad) {
        const adId = ad.id || 'unknown';
        const adInfo = adNames.get(adId);
        const adName = adInfo?.name || adId;
        const campaignId = adInfo?.campaignId || '';
        const campaignName = campaignNames.get(campaignId) || campaignId;

        const timeseries = ad.timeseries;
        if (Array.isArray(timeseries) && timeseries.length > 0) {
          const dayData = timeseries[0];
          const s = dayData.stats || {};

          stats.push({
            timestamp: dayData.start_time,
            ad_id: adId,
            ad_name: adName,
            campaign_id: campaignId,
            campaign_name: campaignName,
            impressions: s.impressions || 0,
            swipes: s.swipes || 0,
            spend: (s.spend || 0) / 1000000,
            video_views: s.video_views || 0,
            screen_time_millis: s.screen_time_millis || 0,
            quartile_1: s.quartile_1 || 0,
            quartile_2: s.quartile_2 || 0,
            quartile_3: s.quartile_3 || 0,
            view_completion: s.view_completion || 0,
            total_installs: s.total_installs || 0,
            conversion_purchases: s.conversion_purchases || 0,
            conversion_purchases_value: (s.conversion_purchases_value || 0) / 1000000,
          });
        }
      }
    }
  }

  console.log(`[${date}] Found ${stats.length} ad-level records`);
  return stats;
}

// Format timestamp for BigQuery
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Transform data for BigQuery
function transformData(stats: any[], fetchedAt: string): any[] {
  return stats.map(row => ({
    timestamp: formatTimestamp(row.timestamp),
    ad_id: row.ad_id || '',
    ad_name: row.ad_name || '',
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

  if (!projectId || !datasetId || !tableId) {
    throw new Error('Missing BigQuery configuration (BQ_PROJECT_ID, BQ_DATASET_ID, SNAPCHAT_BQ_TABLE_ID)');
  }

  return { projectId, datasetId, tableId };
}

// Merge data into BigQuery
async function mergeIntoBigQuery(rows: any[], accessToken: string): Promise<number> {
  const { projectId, datasetId, tableId } = resolveBigQueryTarget();

  if (rows.length === 0) {
    console.log('No rows to merge into BigQuery');
    return 0;
  }

  console.log(`Merging ${rows.length} rows into BigQuery table ${projectId}.${datasetId}.${tableId}`);

  const valuesRows = rows.map(row => {
    return `(
      TIMESTAMP '${row.timestamp}',
      '${(row.ad_id || '').replace(/'/g, "''")}',
      '${(row.ad_name || '').replace(/'/g, "''")}',
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
          ad_id STRING,
          ad_name STRING,
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
    ON target.timestamp = source.timestamp AND target.ad_id = source.ad_id
    WHEN MATCHED THEN UPDATE SET
      ad_name = source.ad_name,
      campaign_id = source.campaign_id,
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
      timestamp, ad_id, ad_name, campaign_id, campaign_name, impressions, swipes, spend,
      video_views, screen_time_millis, quartile_1, quartile_2, quartile_3,
      view_completion, total_installs, conversion_purchases, conversion_purchases_value, fetched_at
    ) VALUES (
      source.timestamp, source.ad_id, source.ad_name, source.campaign_id, source.campaign_name, source.impressions, source.swipes, source.spend,
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
        timeoutMs: 30000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('BigQuery error:', errorText);
    throw new Error(`BigQuery error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const rowsAffected = result.numDmlAffectedRows ? parseInt(result.numDmlAffectedRows) : rows.length;
  console.log(`BigQuery MERGE completed, rows affected: ${rowsAffected}`);
  return rowsAffected;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters: startDate and endDate (YYYY-MM-DD)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid date format. Use YYYY-MM-DD' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (startDate > endDate) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'startDate must be before or equal to endDate' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dates = getDateRange(startDate, endDate);
    console.log(`Starting backfill for ${dates.length} dates: ${startDate} to ${endDate}`);

    // Get access tokens
    const [snapchatToken, googleToken] = await Promise.all([
      getSnapchatAccessToken(),
      getGoogleAccessToken(),
    ]);

    // Fetch campaign and ad names once (they're shared across all dates)
    const [campaignNames, adNames] = await Promise.all([
      fetchCampaignNames(snapchatToken),
      fetchAdNames(snapchatToken),
    ]);

    const fetchedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const results: { date: string; ads: number; rowsAffected: number }[] = [];
    let totalRowsAffected = 0;

    // Process each date sequentially to avoid rate limiting
    for (const date of dates) {
      try {
        // Fetch ad-level stats for this date
        const stats = await fetchSnapchatStatsForDate(snapchatToken, date, campaignNames, adNames);
        
        if (stats.length > 0) {
          // Transform and merge into BigQuery
          const transformedData = transformData(stats, fetchedAt);
          const rowsAffected = await mergeIntoBigQuery(transformedData, googleToken);
          
          results.push({ date, ads: stats.length, rowsAffected });
          totalRowsAffected += rowsAffected;
        } else {
          results.push({ date, ads: 0, rowsAffected: 0 });
        }

        // Rate limiting pause between dates
        await sleep(500);
      } catch (err) {
        console.error(`[${date}] Error:`, err);
        results.push({ date, ads: 0, rowsAffected: 0 });
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`Backfill completed in ${durationMs}ms. Total rows affected: ${totalRowsAffected}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          datesSynced: dates.length,
          totalRowsAffected,
          durationMs,
          results,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('Backfill error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
