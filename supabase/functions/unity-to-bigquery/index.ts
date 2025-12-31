import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Delete existing data for a specific date to prevent duplicates
async function deleteExistingData(targetDate: string, accessToken: string): Promise<number> {
  const projectId = Deno.env.get('BQ_PROJECT_ID');
  const datasetId = Deno.env.get('BQ_DATASET_ID');
  const tableId = Deno.env.get('BQ_TABLE_ID');

  const query = `DELETE FROM \`${projectId}.${datasetId}.${tableId}\` WHERE DATE(timestamp) = '${targetDate}'`;
  
  console.log(`Deleting existing data for ${targetDate}...`);
  
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
        timeoutMs: 30000,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to delete existing data:', error);
    // Don't throw - we'll proceed with insert anyway
    return 0;
  }

  const result = await response.json();
  const deletedRows = result.numDmlAffectedRows ? parseInt(result.numDmlAffectedRows) : 0;
  console.log(`Deleted ${deletedRows} existing rows for ${targetDate}`);
  return deletedRows;
}

// Insert data into BigQuery
async function insertToBigQuery(rows: any[], accessToken: string): Promise<void> {
  const projectId = Deno.env.get('BQ_PROJECT_ID');
  const datasetId = Deno.env.get('BQ_DATASET_ID');
  const tableId = Deno.env.get('BQ_TABLE_ID');

  if (!projectId || !datasetId || !tableId) {
    throw new Error('Missing BigQuery configuration');
  }

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`;

  const requestBody = {
    rows: rows.map(row => ({
      insertId: generateInsertId(row),
      json: row,
    })),
  };

  console.log(`Inserting ${rows.length} rows to BigQuery`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('BigQuery insert error:', response.status, errorText);
    throw new Error(`BigQuery insert failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.insertErrors && result.insertErrors.length > 0) {
    console.error('BigQuery insert errors:', JSON.stringify(result.insertErrors));
    throw new Error(`BigQuery insert had ${result.insertErrors.length} errors`);
  }

  console.log('BigQuery insert successful');
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
      console.log(`No data for date ${targetDate}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `No data for date ${targetDate}`,
          date: targetDate,
          rowsInserted: 0,
          durationMs: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform data
    const transformedData = transformData(unityData, targetDate);
    console.log(`Transformed ${transformedData.length} rows`);

    // Get OAuth access token
    const accessToken = await getAccessToken();

    // Delete existing data for this date first (prevents duplicates on re-sync)
    const deletedRows = await deleteExistingData(targetDate, accessToken);

    // Insert fresh data to BigQuery
    await insertToBigQuery(transformedData, accessToken);

    const duration = Date.now() - startTime;
    console.log(`=== Sync completed in ${duration}ms ===`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${transformedData.length} rows (deleted ${deletedRows} old rows first)`,
        date: targetDate,
        rowsInserted: transformedData.length,
        rowsDeleted: deletedRows,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Sync failed:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: duration,
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
