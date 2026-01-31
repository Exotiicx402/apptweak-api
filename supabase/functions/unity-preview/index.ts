import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get yesterday's date in EST timezone
function getYesterdayDate(): string {
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  estNow.setDate(estNow.getDate() - 1);
  return estNow.toISOString().split("T")[0];
}

// Parse request body and determine date range
interface DateRange {
  startDate: string;
  endDate: string;
}

function parseDateRange(body: any): DateRange {
  const yesterday = getYesterdayDate();
  
  // New range format: { startDate, endDate }
  if (body.startDate && body.endDate) {
    return { startDate: body.startDate, endDate: body.endDate };
  }
  
  // Legacy single date format: { date } - treat as single day range
  if (body.date) {
    return { startDate: body.date, endDate: body.date };
  }
  
  // Default: yesterday only
  return { startDate: yesterday, endDate: yesterday };
}

// Fetch Unity Ads data for a date range
async function fetchUnityData(startDate: string, endDate: string): Promise<any[]> {
  const orgId = Deno.env.get('UNITY_ORG_ID');
  const keyId = Deno.env.get('UNITY_KEY_ID');
  const secretKey = Deno.env.get('UNITY_SECRET_KEY');

  if (!orgId || !keyId || !secretKey) {
    throw new Error('Missing Unity credentials');
  }

  const basicAuth = btoa(`${keyId}:${secretKey}`);
  
  // Unity API requires end date to be after start date, so add 1 day
  const endDateObj = new Date(`${endDate}T00:00:00.000Z`);
  endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
  const endDateStr = endDateObj.toISOString().split('T')[0];
  
  const params = new URLSearchParams({
    start: startDate,
    end: endDateStr,
    scale: 'day',
    format: 'json',
    metrics: 'starts,views,clicks,installs,spend,cpi,ctr,cvr,ecpm,d0AdRevenue,d1AdRevenue,d3AdRevenue,d7AdRevenue,d14AdRevenue,d0TotalRoas,d1TotalRoas,d3TotalRoas,d7TotalRoas,d14TotalRoas,d0Retained,d1Retained,d3Retained,d7Retained,d14Retained,d0RetentionRate,d1RetentionRate,d3RetentionRate,d7RetentionRate,d14RetentionRate',
    breakdowns: 'campaign,country,platform,creativePackType',
  });

  // Optional filters
  const gameIds = Deno.env.get('UNITY_GAME_IDS');
  const appIds = Deno.env.get('UNITY_APP_IDS');
  if (gameIds) params.set('gameIds', gameIds);
  if (appIds) params.set('appIds', appIds);

  const url = `https://services.api.unity.com/advertise/stats/v2/organizations/${orgId}/reports/acquisitions?${params}`;
  
  console.log(`Fetching Unity preview data for range: ${startDate} to ${endDate}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Accept': 'application/json',
    },
  });

  console.log(`Unity API response status: ${response.status}`);

  if (response.status === 204) {
    console.log('No data available (204)');
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Unity API error:', response.status, errorText);
    throw new Error(`Unity API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`Unity API returned ${result.data?.length || 0} rows`);
  
  return result.data || [];
}

// Format date to BigQuery TIMESTAMP format
function formatTimestamp(dateStr: string): string {
  if (dateStr.includes('T') || dateStr.includes(' ')) {
    const d = new Date(dateStr);
    return d.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
  }
  return `${dateStr} 00:00:00`;
}

// Transform Unity data to BigQuery schema (same as sync function)
function transformData(unityData: any[], targetDate: string): any[] {
  const fetchedAt = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
  
  return unityData.map(row => ({
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    let dateRange: DateRange = { startDate: getYesterdayDate(), endDate: getYesterdayDate() };
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        dateRange = parseDateRange(body);
      } catch {
        // No body or invalid JSON, use default dates
      }
    }

    console.log(`=== Unity Preview Started ===`);
    console.log(`Date range: ${dateRange.startDate} to ${dateRange.endDate}`);

    // Fetch Unity data for the range
    const unityData = await fetchUnityData(dateRange.startDate, dateRange.endDate);
    
    if (unityData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: [],
          summary: {
            totalSpend: 0,
            totalInstalls: 0,
            totalClicks: 0,
            avgCpi: 0,
            rowCount: 0,
            campaigns: [],
            countries: [],
            platforms: [],
          },
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          durationMs: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform data (use startDate as fallback for timestamp)
    const transformedData = transformData(unityData, dateRange.startDate);

    // Calculate summary statistics
    const totalSpend = transformedData.reduce((sum, row) => sum + (row.spend || 0), 0);
    const totalInstalls = transformedData.reduce((sum, row) => sum + (row.installs || 0), 0);
    const totalClicks = transformedData.reduce((sum, row) => sum + (row.clicks || 0), 0);
    const avgCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
    
    // Get unique campaigns, countries, platforms with spend
    const campaignSpend: Record<string, number> = {};
    const countryInstalls: Record<string, number> = {};
    const platformSpend: Record<string, number> = {};
    
    transformedData.forEach(row => {
      const campaignKey = row.campaign_name || row.campaign_id || 'Unknown';
      campaignSpend[campaignKey] = (campaignSpend[campaignKey] || 0) + (row.spend || 0);
      
      const countryKey = row.country || 'Unknown';
      countryInstalls[countryKey] = (countryInstalls[countryKey] || 0) + (row.installs || 0);
      
      const platformKey = row.platform || 'Unknown';
      platformSpend[platformKey] = (platformSpend[platformKey] || 0) + (row.spend || 0);
    });

    const summary = {
      totalSpend,
      totalInstalls,
      totalClicks,
      avgCpi,
      rowCount: transformedData.length,
      campaigns: Object.entries(campaignSpend)
        .map(([name, spend]) => ({ name, spend }))
        .sort((a, b) => b.spend - a.spend),
      countries: Object.entries(countryInstalls)
        .map(([name, installs]) => ({ name, installs }))
        .sort((a, b) => b.installs - a.installs),
      platforms: Object.entries(platformSpend)
        .map(([name, spend]) => ({ name, spend }))
        .sort((a, b) => b.spend - a.spend),
    };

    const duration = Date.now() - startTime;
    console.log(`=== Preview completed in ${duration}ms with ${transformedData.length} rows ===`);

    return new Response(
      JSON.stringify({
        success: true,
        data: transformedData,
        summary,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Preview failed:', error);
    
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