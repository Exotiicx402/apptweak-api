import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlatformResult {
  platform: string;
  spend: number;
  installs: number;
  cpi: number;
  error?: string;
}

function getYesterdayEST(): string {
  // Get current time in EST/EDT (America/New_York)
  const now = new Date();
  const estFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Get yesterday in EST
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Format as YYYY-MM-DD
  return estFormatter.format(yesterday);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCPI(spend: number, installs: number): string {
  if (installs === 0) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(spend / installs);
}

async function fetchPlatformData(
  platform: string,
  endpoint: string,
  supabaseUrl: string,
  anonKey: string,
  date: string
): Promise<PlatformResult> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ startDate: date, endDate: date }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const responseData = await response.json();
    
    // Extract totals from the response
    // Most platforms return: { success: true, data: { totals: {...} } }
    // Moloco returns: { success: true, data: { totals: {...} } }
    let spend = 0;
    let installs = 0;

    // Handle standard format: { success: true, data: { totals: {...} } }
    if (responseData.success && responseData.data?.totals) {
      spend = responseData.data.totals.spend || 0;
      installs = responseData.data.totals.installs || 0;
    }
    // Fallback for direct totals format
    else if (responseData.totals) {
      spend = responseData.totals.spend || 0;
      installs = responseData.totals.installs || 0;
    }
    // Fallback for rows format
    else if (responseData.rows && Array.isArray(responseData.rows)) {
      for (const row of responseData.rows) {
        spend += row.spend || 0;
        installs += row.installs || 0;
      }
    }

    return {
      platform,
      spend,
      installs,
      cpi: installs > 0 ? spend / installs : 0,
    };
  } catch (error) {
    console.error(`Error fetching ${platform}:`, error);
    return {
      platform,
      spend: 0,
      installs: 0,
      cpi: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildSlackMessage(results: PlatformResult[], date: string): object {
  const displayDate = formatDateForDisplay(date);
  
  // Calculate totals
  const totals = results.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      installs: acc.installs + r.installs,
    }),
    { spend: 0, installs: 0 }
  );

  // Build the table rows
  const platformOrder = ['Meta', 'Snapchat', 'Unity', 'Google Ads', 'TikTok', 'Moloco'];
  const sortedResults = platformOrder.map(
    p => results.find(r => r.platform === p) || { platform: p, spend: 0, installs: 0, cpi: 0, error: 'No data' }
  );

  // Format table with fixed-width columns
  const header = 'Platform         Spend        Installs      CPI';
  const separator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  const rows = sortedResults.map(r => {
    const platform = r.platform.padEnd(16);
    const spend = r.error ? 'Error'.padStart(12) : formatCurrency(r.spend).padStart(12);
    const installs = r.error ? '-'.padStart(12) : formatNumber(r.installs).padStart(12);
    const cpi = r.error ? '-'.padStart(10) : formatCPI(r.spend, r.installs).padStart(10);
    return `${platform}${spend}${installs}${cpi}`;
  });

  const totalRow = `${'TOTAL'.padEnd(16)}${formatCurrency(totals.spend).padStart(12)}${formatNumber(totals.installs).padStart(12)}${formatCPI(totals.spend, totals.installs).padStart(10)}`;

  const tableContent = [header, separator, ...rows, separator, totalRow].join('\n');

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Daily Performance Report - ${displayDate}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '```' + tableContent + '```',
        },
      },
    ],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!slackWebhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL not configured');
    }

    if (!supabaseUrl || !anonKey) {
      throw new Error('Supabase credentials not configured');
    }

    const yesterday = getYesterdayEST();
    console.log(`Generating report for: ${yesterday}`);

    // Fetch all platform data in parallel
    const platforms = [
      { name: 'Meta', endpoint: 'meta-history' },
      { name: 'Snapchat', endpoint: 'snapchat-history' },
      { name: 'Unity', endpoint: 'unity-history' },
      { name: 'Google Ads', endpoint: 'google-ads-history' },
      { name: 'TikTok', endpoint: 'tiktok-history' },
      { name: 'Moloco', endpoint: 'moloco-history' },
    ];

    const results = await Promise.all(
      platforms.map(p => fetchPlatformData(p.name, p.endpoint, supabaseUrl, anonKey, yesterday))
    );

    console.log('Platform results:', JSON.stringify(results, null, 2));

    // Build and send Slack message
    const slackMessage = buildSlackMessage(results, yesterday);
    
    const slackResponse = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      throw new Error(`Slack API error: ${slackResponse.status} - ${errorText}`);
    }

    console.log('Slack message sent successfully');

    return new Response(
      JSON.stringify({ success: true, date: yesterday, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in slack-daily-report:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
