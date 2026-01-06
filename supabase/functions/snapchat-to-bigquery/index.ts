import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CachedOAuthToken = { token: string; expiresAtMs: number };
let snapchatTokenCache: CachedOAuthToken | null = null;


// Get yesterday's date in YYYY-MM-DD format
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper function to sleep for a given number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
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

async function fetchAdNames(accessToken: string): Promise<Map<string, { name: string; adSquadId: string }>> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  const adMap = new Map<string, { name: string; adSquadId: string }>();

  if (!adAccountId) {
    console.warn('Missing SNAPCHAT_AD_ACCOUNT_ID for ad name lookup');
    return adMap;
  }

  try {
    console.log('Fetching ad names...');
    const response = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/ads?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch ad names: ${response.status}`);
      return adMap;
    }

    const data = await response.json();
    if (data.ads && Array.isArray(data.ads)) {
      for (const wrapper of data.ads) {
        const ad = wrapper.ad;
        if (ad?.id && ad?.name) {
          adMap.set(ad.id, { name: ad.name, adSquadId: ad.ad_squad_id || '' });
        }
      }
    }

    console.log(`Fetched names for ${adMap.size} ads`);
  } catch (error) {
    console.warn('Error fetching ad names:', error);
  }

  return adMap;
}

async function fetchAdSquadData(accessToken: string): Promise<Map<string, { campaignId: string; name: string }>> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  const adSquadMap = new Map<string, { campaignId: string; name: string }>();

  if (!adAccountId) {
    return adSquadMap;
  }

  try {
    console.log('Fetching ad squads for campaign mapping and names...');
    const response = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/adsquads?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch ad squads: ${response.status}`);
      return adSquadMap;
    }

    const data = await response.json();
    if (data.adsquads && Array.isArray(data.adsquads)) {
      for (const wrapper of data.adsquads) {
        const adSquad = wrapper.adsquad;
        if (adSquad?.id) {
          adSquadMap.set(adSquad.id, {
            campaignId: adSquad.campaign_id || '',
            name: adSquad.name || adSquad.id,
          });
        }
      }
    }

    console.log(`Fetched ${adSquadMap.size} ad squad mappings with names`);
  } catch (error) {
    console.warn('Error fetching ad squads:', error);
  }

  return adSquadMap;
}

interface AdLookupMaps {
  adNames: Map<string, { name: string; adSquadId: string }>;
  adSquadData: Map<string, { campaignId: string; name: string }>;
  campaignNames: Map<string, string>;
}

// Fetch Snapchat ad stats for a given date
async function fetchSnapchatStats(accessToken: string, date: string, lookupMaps: AdLookupMaps): Promise<any[]> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');

  if (!adAccountId) {
    throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');
  }

  // Convert date to start and end timestamps (full day in UTC)
  // End time must be at the beginning of an hour per Snapchat API requirements
  const startTime = `${date}T00:00:00.000Z`;
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const endTime = `${nextDate.toISOString().split('T')[0]}T00:00:00.000Z`;

  console.log(`Fetching Snapchat stats for ad account ${adAccountId} on ${date}`);

  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'HOUR');
  url.searchParams.set('breakdown', 'ad');
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  url.searchParams.set('limit', '200');
  url.searchParams.set('fields', 'impressions,swipes,spend,total_installs,android_installs,ios_installs,screen_time_millis,frequency,uniques');

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

  // Extract timeseries stats from the response
  const stats: any[] = [];
  
  // Log the response structure for debugging
  console.log(`Response keys: ${Object.keys(data).join(', ')}`);
  console.log(
    `timeseries_stats count: ${Array.isArray(data.timeseries_stats) ? data.timeseries_stats.length : 0}`
  );

  if (Array.isArray(data.timeseries_stats)) {
    for (const wrapper of data.timeseries_stats) {
      // Access the nested timeseries_stat object (singular)
      const timeseriesStat = wrapper?.timeseries_stat;
      if (!timeseriesStat) {
        console.warn('No timeseries_stat found in wrapper');
        continue;
      }

      // The actual ad data is inside breakdown_stats.ad[]
      const breakdownStats = timeseriesStat.breakdown_stats;
      if (!breakdownStats?.ad || !Array.isArray(breakdownStats.ad)) {
        console.warn('No breakdown_stats.ad found');
        console.warn(`timeseries_stat keys: ${Object.keys(timeseriesStat).join(', ')}`);
        continue;
      }

      console.log(`Found ${breakdownStats.ad.length} ads in breakdown_stats`);

      for (const ad of breakdownStats.ad) {
        const adId = ad.id || 'unknown';
        const adInfo = lookupMaps.adNames.get(adId);
        const adName = adInfo?.name || adId;
        const adSquadId = adInfo?.adSquadId || '';
        const adSquadInfo = lookupMaps.adSquadData.get(adSquadId);
        const adSquadName = adSquadInfo?.name || adSquadId;
        const campaignId = adSquadInfo?.campaignId || '';
        const campaignName = lookupMaps.campaignNames.get(campaignId) || campaignId;

        console.log(`Processing ad ${adId} (${adName})`);

        const timeseries = ad.timeseries;
        if (Array.isArray(timeseries)) {
          for (const hourData of timeseries) {
            const impressions = hourData.stats?.impressions || 0;
            const swipes = hourData.stats?.swipes || 0;
            const screenTimeMillis = hourData.stats?.screen_time_millis || 0;
            const avgScreenTimeMillis = impressions > 0 ? screenTimeMillis / impressions : 0;
            const swipeUpPercent = impressions > 0 ? (swipes / impressions) * 100 : 0;
            
            stats.push({
              timestamp: hourData.start_time,
              campaign_id: campaignId,
              campaign_name: campaignName,
              ad_squad_id: adSquadId,
              ad_squad_name: adSquadName,
              ad_id: adId,
              ad_name: adName,
              impressions: impressions,
              swipes: swipes,
              spend: (hourData.stats?.spend || 0) / 1000000,
              total_installs: hourData.stats?.total_installs || 0,
              android_installs: hourData.stats?.android_installs || 0,
              ios_installs: hourData.stats?.ios_installs || 0,
              screen_time_millis: screenTimeMillis,
              avg_screen_time_millis: avgScreenTimeMillis,
              frequency: hourData.stats?.frequency || 0,
              uniques: hourData.stats?.uniques || 0,
              swipe_up_percent: swipeUpPercent,
            });
          }
        } else {
          console.warn(`No timeseries array found for ad ${adId}`);
        }
      }
    }
  }

  console.log(`Extracted ${stats.length} hourly stat records`);
  return stats;
}

// Format timestamp for BigQuery
function formatTimestamp(isoString: string): string {
  return isoString.replace('T', ' ').replace('Z', '').split('.')[0];
}

// Transform data for BigQuery schema
function transformData(stats: any[], fetchedAt: string): any[] {
  return stats.map(row => ({
    timestamp: formatTimestamp(row.timestamp),
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    ad_squad_id: row.ad_squad_id,
    ad_squad_name: row.ad_squad_name,
    ad_id: row.ad_id,
    ad_name: row.ad_name,
    impressions: row.impressions,
    swipes: row.swipes,
    spend: row.spend,
    total_installs: row.total_installs,
    android_installs: row.android_installs,
    ios_installs: row.ios_installs,
    screen_time_millis: row.screen_time_millis,
    avg_screen_time_millis: row.avg_screen_time_millis,
    frequency: row.frequency,
    uniques: row.uniques,
    swipe_up_percent: row.swipe_up_percent,
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

  // Allow SNAPCHAT_BQ_TABLE_ID to be either:
  // - table
  // - dataset.table
  // - project.dataset.table OR project:dataset.table
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

  // Allow BQ_DATASET_ID to be either:
  // - dataset
  // - project.dataset OR project:dataset
  // - (accidentally) project.dataset.table
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

  // Allow BQ_PROJECT_ID to be (accidentally) qualified
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
      '${row.ad_squad_id.replace(/'/g, "''")}',
      '${row.ad_squad_name.replace(/'/g, "''")}',
      '${row.ad_id.replace(/'/g, "''")}',
      '${row.ad_name.replace(/'/g, "''")}',
      ${row.impressions},
      ${row.swipes},
      ${row.spend},
      ${row.total_installs},
      ${row.android_installs},
      ${row.ios_installs},
      ${row.screen_time_millis},
      ${row.avg_screen_time_millis},
      ${row.frequency},
      ${row.uniques},
      ${row.swipe_up_percent},
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
          ad_squad_id STRING,
          ad_squad_name STRING,
          ad_id STRING,
          ad_name STRING,
          impressions INT64,
          swipes INT64,
          spend FLOAT64,
          total_installs INT64,
          android_installs INT64,
          ios_installs INT64,
          screen_time_millis INT64,
          avg_screen_time_millis FLOAT64,
          frequency FLOAT64,
          uniques INT64,
          swipe_up_percent FLOAT64,
          fetched_at TIMESTAMP
        >
        ${valuesRows}
      ])
    ) AS source
    ON target.timestamp = source.timestamp AND target.ad_id = source.ad_id
    WHEN MATCHED THEN UPDATE SET
      campaign_id = source.campaign_id,
      campaign_name = source.campaign_name,
      ad_squad_id = source.ad_squad_id,
      ad_squad_name = source.ad_squad_name,
      ad_name = source.ad_name,
      impressions = source.impressions,
      swipes = source.swipes,
      spend = source.spend,
      total_installs = source.total_installs,
      android_installs = source.android_installs,
      ios_installs = source.ios_installs,
      screen_time_millis = source.screen_time_millis,
      avg_screen_time_millis = source.avg_screen_time_millis,
      frequency = source.frequency,
      uniques = source.uniques,
      swipe_up_percent = source.swipe_up_percent,
      fetched_at = source.fetched_at
    WHEN NOT MATCHED THEN INSERT (
      timestamp, campaign_id, campaign_name, ad_squad_id, ad_squad_name, ad_id, ad_name,
      impressions, swipes, spend, total_installs, android_installs, ios_installs,
      screen_time_millis, avg_screen_time_millis, frequency, uniques, swipe_up_percent, fetched_at
    ) VALUES (
      source.timestamp, source.campaign_id, source.campaign_name, source.ad_squad_id, source.ad_squad_name,
      source.ad_id, source.ad_name, source.impressions, source.swipes, source.spend,
      source.total_installs, source.android_installs, source.ios_installs, source.screen_time_millis,
      source.avg_screen_time_millis, source.frequency, source.uniques, source.swipe_up_percent, source.fetched_at
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

  try {
    // Parse request body for optional date parameter
    let targetDate = getYesterdayDate();
    
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

    // Fetch all lookup maps in parallel
    const [campaignNames, adNames, adSquadData] = await Promise.all([
      fetchCampaignNames(snapchatToken),
      fetchAdNames(snapchatToken),
      fetchAdSquadData(snapchatToken),
    ]);
    
    const lookupMaps: AdLookupMaps = { adNames, adSquadData, campaignNames };
    const stats = await fetchSnapchatStats(snapchatToken, targetDate, lookupMaps);

    if (stats.length === 0) {
      console.log('No Snapchat stats found for the specified date');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No data found for the specified date',
          date: targetDate,
          rowsProcessed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform and merge into BigQuery
    const fetchedAt = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const transformedData = transformData(stats, fetchedAt);
    await mergeIntoBigQuery(transformedData, googleToken);

    console.log(`Successfully synced ${transformedData.length} rows to BigQuery`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced Snapchat data to BigQuery`,
        date: targetDate,
        rowsProcessed: transformedData.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in snapchat-to-bigquery function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
