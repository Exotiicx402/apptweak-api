import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CachedOAuthToken = { token: string; expiresAtMs: number };
let snapchatTokenCache: CachedOAuthToken | null = null;

// Helper function to sleep
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

function resolveAccountDayRangeUtc(startDate: string, endDate: string, timeZone: string): { startTime: string; endTime: string } {
  const startMs = getUtcMsForZonedMidnight(startDate, timeZone);
  const nextDate = addDaysYmd(endDate, 1);
  const endMs = getUtcMsForZonedMidnight(nextDate, timeZone);
  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
  };
}

// Get Snapchat access token
async function getSnapchatAccessToken(maxRetries = 3): Promise<string> {
  const clientId = Deno.env.get('SNAPCHAT_CLIENT_ID');
  const clientSecret = Deno.env.get('SNAPCHAT_CLIENT_SECRET');
  const refreshToken = Deno.env.get('SNAPCHAT_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Snapchat OAuth credentials');
  }

  if (snapchatTokenCache && Date.now() < snapchatTokenCache.expiresAtMs - 60_000) {
    return snapchatTokenCache.token;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      if (response.status === 429) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get Snapchat access token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      snapchatTokenCache = {
        token: data.access_token,
        expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000,
      };
      return data.access_token;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
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

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get Google access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch all campaign IDs
async function fetchCampaignIds(accessToken: string): Promise<string[]> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  if (!adAccountId) throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');

  const url = `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/campaigns?limit=1000`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Snapchat campaigns API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const campaignIds: string[] = [];
  
  if (data.campaigns && Array.isArray(data.campaigns)) {
    for (const wrapper of data.campaigns) {
      if (wrapper?.campaign?.id) {
        campaignIds.push(wrapper.campaign.id);
      }
    }
  }

  console.log(`Found ${campaignIds.length} campaigns`);
  return campaignIds;
}

// Fetch Snapchat totals for date range (at campaign level to get all metrics)
async function fetchSnapchatTotals(accessToken: string, startDate: string, endDate: string): Promise<{
  spend: number;
  impressions: number;
  swipes: number;
  totalInstalls: number;
}> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  if (!adAccountId) throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');

  // Get all campaign IDs first
  const campaignIds = await fetchCampaignIds(accessToken);
  
  if (campaignIds.length === 0) {
    console.log('No campaigns found, returning zeros');
    return { spend: 0, impressions: 0, swipes: 0, totalInstalls: 0 };
  }

  const accountTimeZone = Deno.env.get('SNAPCHAT_ACCOUNT_TIMEZONE') || 'America/Toronto';
  const { startTime, endTime } = resolveAccountDayRangeUtc(startDate, endDate, accountTimeZone);

  console.log(`Fetching Snapchat totals: ${startDate} to ${endDate} (${startTime} to ${endTime})`);

  // Query at campaign level (supports all fields)
  const url = new URL(`https://adsapi.snapchat.com/v1/campaigns/stats`);
  url.searchParams.set('campaign_ids', campaignIds.join(','));
  url.searchParams.set('granularity', 'TOTAL');
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  url.searchParams.set('fields', 'impressions,swipes,spend,total_installs');
  url.searchParams.set('swipe_up_attribution_window', '28_DAY');
  url.searchParams.set('view_attribution_window', '1_DAY');
  url.searchParams.set('action_report_time', 'conversion');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Snapchat API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  
  let spend = 0;
  let impressions = 0;
  let swipes = 0;
  let totalInstalls = 0;

  // Sum up stats from all campaigns
  if (data.total_stats && Array.isArray(data.total_stats)) {
    for (const wrapper of data.total_stats) {
      const stats = wrapper?.total_stat?.stats;
      if (stats) {
        spend += (stats.spend || 0) / 1000000;
        impressions += stats.impressions || 0;
        swipes += stats.swipes || 0;
        totalInstalls += stats.total_installs || 0;
      }
    }
  }

  console.log(`Snapchat totals: spend=$${spend.toFixed(2)}, impressions=${impressions}, swipes=${swipes}, installs=${totalInstalls}`);
  return { spend, impressions, swipes, totalInstalls };
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
    throw new Error('Missing BigQuery configuration');
  }

  return { projectId, datasetId, tableId };
}

// Fetch BigQuery totals for date range
async function fetchBigQueryTotals(accessToken: string, startDate: string, endDate: string): Promise<{
  spend: number;
  impressions: number;
  swipes: number;
  totalInstalls: number;
  rowCount: number;
}> {
  const { projectId, datasetId, tableId } = resolveBigQueryTarget();
  const fullTableRef = `\`${projectId}.${datasetId}.${tableId}\``;

  // Query with DATE() to handle UTC timestamps and match the requested date range
  const query = `
    SELECT 
      SUM(spend) as spend,
      SUM(impressions) as impressions,
      SUM(swipes) as swipes,
      SUM(total_installs) as total_installs,
      COUNT(*) as row_count
    FROM ${fullTableRef}
    WHERE DATE(timestamp) >= '${startDate}' AND DATE(timestamp) <= '${endDate}'
  `;

  console.log(`Fetching BigQuery totals: ${startDate} to ${endDate}`);

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BigQuery API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  
  if (result.rows && result.rows.length > 0) {
    const row = result.rows[0].f;
    return {
      spend: parseFloat(row[0].v) || 0,
      impressions: parseInt(row[1].v) || 0,
      swipes: parseInt(row[2].v) || 0,
      totalInstalls: parseInt(row[3].v) || 0,
      rowCount: parseInt(row[4].v) || 0,
    };
  }

  return { spend: 0, impressions: 0, swipes: 0, totalInstalls: 0, rowCount: 0 };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      throw new Error('Missing startDate or endDate');
    }

    console.log(`Reconciling Snapchat vs BigQuery: ${startDate} to ${endDate}`);

    // Get access tokens
    const [snapchatToken, googleToken] = await Promise.all([
      getSnapchatAccessToken(),
      getGoogleAccessToken(),
    ]);

    // Fetch totals from both sources
    const [snapchatTotals, bigQueryTotals] = await Promise.all([
      fetchSnapchatTotals(snapchatToken, startDate, endDate),
      fetchBigQueryTotals(googleToken, startDate, endDate),
    ]);

    // Calculate differences
    const diff = {
      spend: bigQueryTotals.spend - snapchatTotals.spend,
      impressions: bigQueryTotals.impressions - snapchatTotals.impressions,
      swipes: bigQueryTotals.swipes - snapchatTotals.swipes,
      totalInstalls: bigQueryTotals.totalInstalls - snapchatTotals.totalInstalls,
    };

    const diffPercent = {
      spend: snapchatTotals.spend ? ((diff.spend / snapchatTotals.spend) * 100) : 0,
      impressions: snapchatTotals.impressions ? ((diff.impressions / snapchatTotals.impressions) * 100) : 0,
      swipes: snapchatTotals.swipes ? ((diff.swipes / snapchatTotals.swipes) * 100) : 0,
      totalInstalls: snapchatTotals.totalInstalls ? ((diff.totalInstalls / snapchatTotals.totalInstalls) * 100) : 0,
    };

    return new Response(
      JSON.stringify({
        success: true,
        startDate,
        endDate,
        snapchat: snapchatTotals,
        bigQuery: bigQueryTotals,
        diff,
        diffPercent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in snapchat-reconcile function:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
