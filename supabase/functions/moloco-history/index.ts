import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOLOCO_AUTH_URL = 'https://api.moloco.cloud/cm/v1/auth/tokens';
const MOLOCO_REPORTS_URL = 'https://api.moloco.cloud/cm/v1/reports';

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

    // Wait before next attempt
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

    // Parse request body
    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    console.log(`Fetching Moloco data from ${startDate} to ${endDate}`);

    // Step 1: Get access token
    const token = await getAccessToken(apiKey);

    // Step 2: Create report
    const reportId = await createReport(token, adAccountId, startDate, endDate);

    // Step 3: Poll for report status until ready
    const jsonUrl = await waitForReport(token, reportId);

    // Step 4: Download and process the report
    const rawRows = await downloadReport(jsonUrl);
    const rows = processRows(rawRows);

    // Calculate totals
    const totals = rows.reduce(
      (acc, row) => ({
        spend: acc.spend + row.spend,
        installs: acc.installs + row.installs,
        impressions: acc.impressions + row.impressions,
        clicks: acc.clicks + row.clicks,
      }),
      { spend: 0, installs: 0, impressions: 0, clicks: 0 }
    );

    console.log(`Processed ${rows.length} rows, total spend: ${totals.spend}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: { 
          rows, 
          totals: {
            ...totals,
            cpi: totals.installs > 0 ? totals.spend / totals.installs : 0,
          },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in moloco-history:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
