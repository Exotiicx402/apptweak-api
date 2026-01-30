import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOLOCO_AUTH_URL = 'https://api.moloco.cloud/cm/v1/auth/tokens';
const MOLOCO_REPORTS_URL = 'https://api.moloco.cloud/cm/v1/reports';

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

interface MolocoRow {
  date: string;
  campaign?: {
    id: string;
    title: string;
    country?: string;
  };
  metric?: {
    impressions: string;
    clicks: string;
    installs: string;
    spend: number;
  };
}

interface ProcessedRow {
  date: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
  installs: number;
  impressions: number;
  clicks: number;
}

async function getAccessToken(apiKey: string): Promise<string> {
  console.log('Fetching Moloco access token...');
  
  const response = await fetch(MOLOCO_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Auth error:', response.status, errorText);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

async function createReport(
  token: string,
  adAccountId: string,
  startDate: string,
  endDate: string
): Promise<string> {
  console.log(`Creating report for ${startDate} to ${endDate}...`);
  
  const response = await fetch(MOLOCO_REPORTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ad_account_id: adAccountId,
      date_range: {
        start: startDate,
        end: endDate,
      },
      dimensions: ['DATE', 'CAMPAIGN'],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Create report error:', response.status, errorText);
    throw new Error(`Failed to create report: ${response.status}`);
  }

  const data = await response.json();
  console.log('Report created:', data.id);
  return data.id;
}

async function waitForReport(
  token: string,
  reportId: string,
  maxAttempts = 30,
  delayMs = 2000
): Promise<string> {
  console.log(`Waiting for report ${reportId} to be ready...`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${MOLOCO_REPORTS_URL}/${reportId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Status check error:', response.status, errorText);
      throw new Error(`Failed to check report status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Attempt ${attempt + 1}: Status = ${data.status}`);

    if (data.status === 'READY') {
      return data.location_json;
    }

    if (data.status === 'FAILED') {
      throw new Error('Report generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('Report generation timed out');
}

async function downloadReport(jsonUrl: string): Promise<MolocoRow[]> {
  console.log('Downloading report from:', jsonUrl);
  
  const response = await fetch(jsonUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`);
  }

  const data = await response.json();
  return data.rows || [];
}

function processRows(rows: MolocoRow[]): ProcessedRow[] {
  return rows.map(row => ({
    date: row.date,
    campaign_id: row.campaign?.id || '',
    campaign_name: row.campaign?.title || 'Unknown',
    spend: row.metric?.spend || 0,
    installs: parseInt(row.metric?.installs || '0', 10),
    impressions: parseInt(row.metric?.impressions || '0', 10),
    clicks: parseInt(row.metric?.clicks || '0', 10),
  }));
}

// Aggregate rows by date
function aggregateByDate(rows: ProcessedRow[]): any[] {
  const dateMap = new Map<string, any>();
  
  for (const row of rows) {
    const existing = dateMap.get(row.date) || {
      date: row.date,
      spend: 0,
      installs: 0,
      impressions: 0,
      clicks: 0,
    };
    existing.spend += row.spend;
    existing.installs += row.installs;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    dateMap.set(row.date, existing);
  }
  
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Aggregate rows by campaign
function aggregateByCampaign(rows: ProcessedRow[]): any[] {
  const campaignMap = new Map<string, any>();
  
  for (const row of rows) {
    const key = row.campaign_id;
    const existing = campaignMap.get(key) || {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: 0,
      installs: 0,
      impressions: 0,
      clicks: 0,
    };
    existing.spend += row.spend;
    existing.installs += row.installs;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    campaignMap.set(key, existing);
  }
  
  return Array.from(campaignMap.values())
    .map(c => ({
      ...c,
      cpi: c.installs > 0 ? c.spend / c.installs : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('MOLOCO_API_KEY');
    const adAccountId = Deno.env.get('MOLOCO_AD_ACCOUNT_ID');

    if (!apiKey || !adAccountId) {
      throw new Error('Moloco credentials not configured');
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    // Query Moloco API with the full date range - let API return whatever data is available
    const effectiveStartDate = startDate;
    const effectiveEndDate = endDate;
    const shouldFetch = true;

    console.log(`Moloco query: ${effectiveStartDate} to ${effectiveEndDate}`);

    // Calculate previous period for comparison
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - daysDiff - 1);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    
    const prevStartStr = prevStart.toISOString().split("T")[0];
    const prevEndStr = prevEnd.toISOString().split("T")[0];

    // If no valid date range, return empty with flag
    if (!shouldFetch) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            daily: [],
            campaigns: [],
            totals: { spend: 0, installs: 0, impressions: 0, clicks: 0, cpi: 0 },
            previousTotals: { spend: 0, installs: 0, impressions: 0, clicks: 0, cpi: 0 },
            dateRange: { startDate, endDate: effectiveEndDate },
            previousDateRange: { startDate: prevStartStr, endDate: prevEndStr },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get access token
    const token = await getAccessToken(apiKey);

    // Fetch current period and previous period SEQUENTIALLY to avoid rate limiting
    let currentRows: ProcessedRow[] = [];
    let prevRows: ProcessedRow[] = [];
    
    try {
      const reportId = await createReport(token, adAccountId, effectiveStartDate, effectiveEndDate);
      const jsonUrl = await waitForReport(token, reportId);
      const rawRows = await downloadReport(jsonUrl);
      currentRows = processRows(rawRows);
    } catch (error) {
      console.error('Error fetching current period:', error);
    }
    
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      const reportId = await createReport(token, adAccountId, prevStartStr, prevEndStr);
      const jsonUrl = await waitForReport(token, reportId);
      const rawRows = await downloadReport(jsonUrl);
      prevRows = processRows(rawRows);
    } catch (error) {
      console.error('Error fetching previous period:', error);
    }

    // Calculate totals for current period
    const totals = currentRows.reduce(
      (acc, row) => ({
        spend: acc.spend + row.spend,
        installs: acc.installs + row.installs,
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
      }),
      { spend: 0, installs: 0, impressions: 0, clicks: 0 }
    );

    // Calculate totals for previous period
    const previousTotals = prevRows.reduce(
      (acc, row) => ({
        spend: acc.spend + row.spend,
        installs: acc.installs + row.installs,
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
      }),
      { spend: 0, installs: 0, impressions: 0, clicks: 0 }
    );

    console.log(`Processed ${currentRows.length} rows, total spend: ${totals.spend}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: { 
          daily: aggregateByDate(currentRows),
          campaigns: aggregateByCampaign(currentRows),
          totals: {
            ...totals,
            cpi: totals.installs > 0 ? totals.spend / totals.installs : 0,
          },
          previousTotals: {
            ...previousTotals,
            cpi: previousTotals.installs > 0 ? previousTotals.spend / previousTotals.installs : 0,
          },
          dateRange: { startDate, endDate: effectiveEndDate },
          previousDateRange: { startDate: prevStartStr, endDate: prevEndStr },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in moloco-history:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
