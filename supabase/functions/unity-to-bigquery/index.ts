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
      source: 'unity',
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

// Calculate yesterday's date in YYYY-MM-DD format (UTC)
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Get OAuth access token using refresh token
async function getAccessToken(): Promise<string> {
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
    const errorText = await response.text();
    console.error('OAuth token error:', errorText);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch Unity Ads data
async function fetchUnityData(date: string): Promise<any[]> {
  const orgId = Deno.env.get('UNITY_ORG_ID');
  const keyId = Deno.env.get('UNITY_KEY_ID');
  const secretKey = Deno.env.get('UNITY_SECRET_KEY');

  if (!orgId || !keyId || !secretKey) {
    throw new Error('Missing Unity credentials');
  }

  const basicAuth = btoa(`${keyId}:${secretKey}`);
  
  // Unity API requires end date to be after start date, so we use next day (UTC)
  const endDate = new Date(`${date}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endDateStr = endDate.toISOString().split('T')[0];
  
  const params = new URLSearchParams({
    start: date,
    end: endDateStr,
    scale: 'day',
    format: 'json',
    metrics: 'starts,views,clicks,installs,spend,cpi,ctr,cvr,ecpm,d0AdRevenue,d1AdRevenue,d3AdRevenue,d7AdRevenue,d14AdRevenue,d0TotalRoas,d1TotalRoas,d3TotalRoas,d7TotalRoas,d14TotalRoas,d0Retained,d1Retained,d3Retained,d7Retained,d14Retained,d0RetentionRate,d1RetentionRate,d3RetentionRate,d7RetentionRate,d14RetentionRate',
    breakdowns: 'campaign,country,platform,creativePackType',
  });

  // Optional filters (set these as environment variables if you want to restrict the query)
  const gameIds = Deno.env.get('UNITY_GAME_IDS');
  const appIds = Deno.env.get('UNITY_APP_IDS');
  if (gameIds) params.set('gameIds', gameIds);
  if (appIds) params.set('appIds', appIds);

  const url = `https://services.api.unity.com/advertise/stats/v2/organizations/${orgId}/reports/acquisitions?${params}`;
  
  console.log(`Fetching Unity data for date: ${date}`);
  console.log(`Full URL: ${url}`);
  console.log(`Using org: ${orgId}, date range: ${date} to ${endDateStr}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Accept': 'application/json',
    },
  });

  console.log(`Unity API response status: ${response.status}`);

  if (response.status === 204) {
    console.log('No data available (204) - This could mean:');
    console.log('  1. No campaigns ran on this date');
    console.log('  2. The appId is incorrect');
    console.log('  3. Data is not yet available (usually 24-48h delay)');
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Unity API error:', response.status, errorText);
    throw new Error(`Unity API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  // Log raw data sample for debugging
  console.log(`Unity API returned ${result.data?.length || 0} rows`);
  if (result.data && result.data.length > 0) {
    console.log(`Sample row (first):`, JSON.stringify(result.data[0], null, 2));
    // Log spend values to verify they're correct from Unity
    const totalSpend = result.data.reduce((sum: number, row: any) => sum + (row.spend || 0), 0);
    console.log(`Total spend from Unity API: $${totalSpend.toFixed(2)}`);
  }
  
  return result.data || [];
}

// Format date to BigQuery TIMESTAMP format: YYYY-MM-DD HH:MM:SS
function formatTimestamp(dateStr: string): string {
  // If already has time component, parse and format
  if (dateStr.includes('T') || dateStr.includes(' ')) {
    const d = new Date(dateStr);
    return d.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
  }
  // If just a date (YYYY-MM-DD), add midnight time
  return `${dateStr} 00:00:00`;
}

// Transform Unity data to BigQuery schema
function transformData(unityData: any[], targetDate: string): any[] {
  const fetchedAt = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
  
  return unityData.map(row => ({
    // Format timestamp for BigQuery (YYYY-MM-DD HH:MM:SS)
    timestamp: formatTimestamp(row.timestamp || row.date || targetDate),
    campaign_id: row.campaignId || '',
    campaign_name: row.campaignName || '',
    country: row.country || '',
    platform: row.platform || '',
    creative_pack_type: row.creativePackType || '',
    starts: row.starts ?? 0,
    views: row.views ?? 0,
    clicks: row.clicks ?? 0,
    installs: row.installs ?? 0,
    spend: row.spend ?? 0,
    cpi: row.cpi ?? 0,
    ctr: row.ctr ?? 0,
    cvr: row.cvr ?? 0,
    ecpm: row.ecpm ?? 0,
    d0_ad_revenue: row.d0AdRevenue ?? 0,
    d0_total_roas: row.d0TotalRoas ?? 0,
    d0_retained: row.d0Retained ?? 0,
    d0_retention_rate: row.d0RetentionRate ?? 0,
    d1_ad_revenue: row.d1AdRevenue ?? 0,
    d1_total_roas: row.d1TotalRoas ?? 0,
    d1_retained: row.d1Retained ?? 0,
    d1_retention_rate: row.d1RetentionRate ?? 0,
    d3_ad_revenue: row.d3AdRevenue ?? 0,
    d3_total_roas: row.d3TotalRoas ?? 0,
    d3_retained: row.d3Retained ?? 0,
    d3_retention_rate: row.d3RetentionRate ?? 0,
    d7_ad_revenue: row.d7AdRevenue ?? 0,
    d7_total_roas: row.d7TotalRoas ?? 0,
    d7_retained: row.d7Retained ?? 0,
    d7_retention_rate: row.d7RetentionRate ?? 0,
    d14_ad_revenue: row.d14AdRevenue ?? 0,
    d14_total_roas: row.d14TotalRoas ?? 0,
    d14_retained: row.d14Retained ?? 0,
    d14_retention_rate: row.d14RetentionRate ?? 0,
    fetched_at: fetchedAt,
  }));
}

// Generate insert ID for deduplication
function generateInsertId(row: any): string {
  const key = `${row.timestamp}-${row.campaign_id}-${row.country}-${row.platform}-${row.creative_pack_type}`;
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Resolve BigQuery identifiers from env vars.
// Accepts any of:
// - BQ_TABLE_ID = "table"
// - BQ_TABLE_ID = "dataset.table"
// - BQ_TABLE_ID = "project.dataset.table"
// And similarly for BQ_DATASET_ID.
function resolveBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  let projectId = (Deno.env.get('BQ_PROJECT_ID') || '').trim();
  let datasetId = (Deno.env.get('BQ_DATASET_ID') || '').trim();
  let tableId = (Deno.env.get('BQ_TABLE_ID') || '').trim();

  if (!projectId || !datasetId || !tableId) {
    throw new Error('Missing BigQuery configuration');
  }

  // If tableId includes dataset/project, prefer parsing from it
  const tableParts = tableId.split('.').filter(Boolean);
  if (tableParts.length === 3) {
    projectId = tableParts[0];
    datasetId = tableParts[1];
    tableId = tableParts[2];
  } else if (tableParts.length === 2) {
    datasetId = tableParts[0];
    tableId = tableParts[1];
  }

  // If datasetId includes project, parse it
  const dsParts = datasetId.split('.').filter(Boolean);
  if (dsParts.length === 2) {
    projectId = dsParts[0];
    datasetId = dsParts[1];
  } else if (dsParts.length > 2) {
    // Guard against accidentally pasting "dataset.project.dataset" etc.
    datasetId = dsParts[dsParts.length - 1];
  }

  console.log(`BigQuery target resolved: ${projectId}.${datasetId}.${tableId}`);
  return { projectId, datasetId, tableId };
}

// MERGE data into BigQuery (upsert - prevents duplicates)
async function mergeIntoBigQuery(rows: any[], accessToken: string): Promise<{ inserted: number; updated: number }> {
  const { projectId, datasetId, tableId } = resolveBigQueryTarget();

  // Build VALUES clause for all rows
  const valuesClause = rows.map(row => `(
    TIMESTAMP '${row.timestamp}',
    '${row.campaign_id}',
    '${(row.campaign_name || '').replace(/'/g, "\\'")}',
    '${row.country}',
    '${row.platform}',
    '${row.creative_pack_type}',
    ${row.starts}, ${row.views}, ${row.clicks}, ${row.installs},
    ${row.spend}, ${row.cpi}, ${row.ctr}, ${row.cvr}, ${row.ecpm},
    ${row.d0_ad_revenue}, ${row.d0_total_roas}, ${row.d0_retained}, ${row.d0_retention_rate},
    ${row.d1_ad_revenue}, ${row.d1_total_roas}, ${row.d1_retained}, ${row.d1_retention_rate},
    ${row.d3_ad_revenue}, ${row.d3_total_roas}, ${row.d3_retained}, ${row.d3_retention_rate},
    ${row.d7_ad_revenue}, ${row.d7_total_roas}, ${row.d7_retained}, ${row.d7_retention_rate},
    ${row.d14_ad_revenue}, ${row.d14_total_roas}, ${row.d14_retained}, ${row.d14_retention_rate},
    TIMESTAMP '${row.fetched_at}'
  )`).join(',\n');

  const mergeQuery = `
    MERGE \`${projectId}.${datasetId}.${tableId}\` AS target
    USING (
      SELECT * FROM UNNEST([
        STRUCT<
          timestamp TIMESTAMP, campaign_id STRING, campaign_name STRING, country STRING, platform STRING, creative_pack_type STRING,
          starts INT64, views INT64, clicks INT64, installs INT64,
          spend FLOAT64, cpi FLOAT64, ctr FLOAT64, cvr FLOAT64, ecpm FLOAT64,
          d0_ad_revenue FLOAT64, d0_total_roas FLOAT64, d0_retained INT64, d0_retention_rate FLOAT64,
          d1_ad_revenue FLOAT64, d1_total_roas FLOAT64, d1_retained INT64, d1_retention_rate FLOAT64,
          d3_ad_revenue FLOAT64, d3_total_roas FLOAT64, d3_retained INT64, d3_retention_rate FLOAT64,
          d7_ad_revenue FLOAT64, d7_total_roas FLOAT64, d7_retained INT64, d7_retention_rate FLOAT64,
          d14_ad_revenue FLOAT64, d14_total_roas FLOAT64, d14_retained INT64, d14_retention_rate FLOAT64,
          fetched_at TIMESTAMP
        >
        ${valuesClause}
      ])
    ) AS source
    ON target.timestamp = source.timestamp 
       AND target.campaign_id = source.campaign_id 
       AND target.country = source.country 
       AND target.platform = source.platform 
       AND target.creative_pack_type = source.creative_pack_type
    WHEN MATCHED THEN UPDATE SET
      campaign_name = source.campaign_name,
      starts = source.starts, views = source.views, clicks = source.clicks, installs = source.installs,
      spend = source.spend, cpi = source.cpi, ctr = source.ctr, cvr = source.cvr, ecpm = source.ecpm,
      d0_ad_revenue = source.d0_ad_revenue, d0_total_roas = source.d0_total_roas, d0_retained = source.d0_retained, d0_retention_rate = source.d0_retention_rate,
      d1_ad_revenue = source.d1_ad_revenue, d1_total_roas = source.d1_total_roas, d1_retained = source.d1_retained, d1_retention_rate = source.d1_retention_rate,
      d3_ad_revenue = source.d3_ad_revenue, d3_total_roas = source.d3_total_roas, d3_retained = source.d3_retained, d3_retention_rate = source.d3_retention_rate,
      d7_ad_revenue = source.d7_ad_revenue, d7_total_roas = source.d7_total_roas, d7_retained = source.d7_retained, d7_retention_rate = source.d7_retention_rate,
      d14_ad_revenue = source.d14_ad_revenue, d14_total_roas = source.d14_total_roas, d14_retained = source.d14_retained, d14_retention_rate = source.d14_retention_rate,
      fetched_at = source.fetched_at
    WHEN NOT MATCHED THEN INSERT (
      timestamp, campaign_id, campaign_name, country, platform, creative_pack_type,
      starts, views, clicks, installs, spend, cpi, ctr, cvr, ecpm,
      d0_ad_revenue, d0_total_roas, d0_retained, d0_retention_rate,
      d1_ad_revenue, d1_total_roas, d1_retained, d1_retention_rate,
      d3_ad_revenue, d3_total_roas, d3_retained, d3_retention_rate,
      d7_ad_revenue, d7_total_roas, d7_retained, d7_retention_rate,
      d14_ad_revenue, d14_total_roas, d14_retained, d14_retention_rate,
      fetched_at
    ) VALUES (
      source.timestamp, source.campaign_id, source.campaign_name, source.country, source.platform, source.creative_pack_type,
      source.starts, source.views, source.clicks, source.installs, source.spend, source.cpi, source.ctr, source.cvr, source.ecpm,
      source.d0_ad_revenue, source.d0_total_roas, source.d0_retained, source.d0_retention_rate,
      source.d1_ad_revenue, source.d1_total_roas, source.d1_retained, source.d1_retention_rate,
      source.d3_ad_revenue, source.d3_total_roas, source.d3_retained, source.d3_retention_rate,
      source.d7_ad_revenue, source.d7_total_roas, source.d7_retained, source.d7_retention_rate,
      source.d14_ad_revenue, source.d14_total_roas, source.d14_retained, source.d14_retention_rate,
      source.fetched_at
    )
  `;

  console.log(`Executing MERGE for ${rows.length} rows into BigQuery`);

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
        timeoutMs: 60000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('BigQuery MERGE error:', response.status, errorText);
    throw new Error(`BigQuery MERGE failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  // Parse DML stats
  const affectedRows = result.numDmlAffectedRows ? parseInt(result.numDmlAffectedRows) : rows.length;
  console.log(`BigQuery MERGE successful: ${affectedRows} rows affected`);
  
  return { inserted: affectedRows, updated: 0 }; // BigQuery doesn't separate insert vs update counts
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Check for custom date in request body
    let targetDate = getYesterdayDate();
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.date) {
          targetDate = body.date;
        }
      } catch {
        // No body or invalid JSON, use default date
      }
    }

    console.log(`=== Unity to BigQuery Sync Started ===`);
    console.log(`Target date: ${targetDate}`);

    // Fetch Unity data
    const unityData = await fetchUnityData(targetDate);
    
    if (unityData.length === 0) {
      const duration = Date.now() - startTime;
      console.log(`No data for date ${targetDate}`);
      await logSync(targetDate, 'success', 0, duration);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `No data for date ${targetDate}`,
          date: targetDate,
          rowsInserted: 0,
          durationMs: duration,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform data
    const transformedData = transformData(unityData, targetDate);
    console.log(`Transformed ${transformedData.length} rows`);

    // Get OAuth access token
    const accessToken = await getAccessToken();

    // MERGE data into BigQuery (upsert - prevents duplicates)
    const mergeResult = await mergeIntoBigQuery(transformedData, accessToken);

    const duration = Date.now() - startTime;
    console.log(`=== Sync completed in ${duration}ms ===`);

    await logSync(targetDate, 'success', mergeResult.inserted, duration);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${transformedData.length} rows (${mergeResult.inserted} affected)`,
        date: targetDate,
        rowsAffected: mergeResult.inserted,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sync failed:', error);
    
    // Try to extract target date for logging
    let logDate: string;
    try {
      logDate = new Date().toISOString().split('T')[0];
    } catch {
      logDate = 'unknown';
    }
    await logSync(logDate, 'error', null, duration, errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs: duration,
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
