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
  previousSpend: number;
  previousInstalls: number;
  previousCpi: number;
  error?: string;
}

function getDateEST(daysAgo: number): string {
  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() - daysAgo);
  
  const estFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  return estFormatter.format(target);
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

function calculatePercentChange(current: number, previous: number): string {
  if (previous === 0) return '-';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

async function fetchRankingForDate(
  supabaseUrl: string,
  anonKey: string,
  date: string
): Promise<{ rank: number | null; categoryName: string; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/apptweak-ranking-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ 
        appId: '6648798962', 
        country: 'us', 
        device: 'iphone',
        startDate: date,
        endDate: date,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rankings = data?.result?.['6648798962']?.rankings || [];
    
    // Find Sports category (6004) with "free" chart type
    for (const ranking of rankings) {
      for (const value of ranking.value || []) {
        if (value.category === '6004' && value.chart_type === 'free') {
          return {
            rank: value.rank,
            categoryName: value.category_name || 'Sports',
          };
        }
      }
    }
    
    return { rank: null, categoryName: 'Sports' };
  } catch (error) {
    console.error(`Error fetching ranking for ${date}:`, error);
    return {
      rank: null,
      categoryName: 'Sports',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function fetchPlatformDataForDate(
  platform: string,
  endpoint: string,
  supabaseUrl: string,
  anonKey: string,
  date: string
): Promise<{ spend: number; installs: number; cpi: number; error?: string }> {
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
    
    let spend = 0;
    let installs = 0;

    if (responseData.success && responseData.data?.totals) {
      spend = responseData.data.totals.spend || 0;
      installs = responseData.data.totals.installs || 0;
    } else if (responseData.totals) {
      spend = responseData.totals.spend || 0;
      installs = responseData.totals.installs || 0;
    } else if (responseData.rows && Array.isArray(responseData.rows)) {
      for (const row of responseData.rows) {
        spend += row.spend || 0;
        installs += row.installs || 0;
      }
    }

    return {
      spend,
      installs,
      cpi: installs > 0 ? spend / installs : 0,
    };
  } catch (error) {
    console.error(`Error fetching ${platform} for ${date}:`, error);
    return {
      spend: 0,
      installs: 0,
      cpi: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function fetchPlatformData(
  platform: string,
  endpoint: string,
  supabaseUrl: string,
  anonKey: string,
  currentDate: string,
  previousDate: string
): Promise<PlatformResult> {
  const [current, previous] = await Promise.all([
    fetchPlatformDataForDate(platform, endpoint, supabaseUrl, anonKey, currentDate),
    fetchPlatformDataForDate(platform, endpoint, supabaseUrl, anonKey, previousDate),
  ]);

  return {
    platform,
    spend: current.spend,
    installs: current.installs,
    cpi: current.cpi,
    previousSpend: previous.spend,
    previousInstalls: previous.installs,
    previousCpi: previous.cpi,
    error: current.error,
  };
}

function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface FormatOptions {
  showPercentChanges: boolean;
  showPlatformSpacing: boolean;
}

interface RankingData {
  rank: number | null;
  categoryName: string;
  error?: string;
}

function buildSlackMessage(results: PlatformResult[], date: string, options: FormatOptions, ranking: RankingData): object {
  const displayDate = formatDateForDisplay(date);
  
  // Calculate totals for current and previous period
  const totals = results.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      installs: acc.installs + r.installs,
      previousSpend: acc.previousSpend + r.previousSpend,
      previousInstalls: acc.previousInstalls + r.previousInstalls,
    }),
    { spend: 0, installs: 0, previousSpend: 0, previousInstalls: 0 }
  );

  const totalCpi = totals.installs > 0 ? totals.spend / totals.installs : 0;
  const previousTotalCpi = totals.previousInstalls > 0 ? totals.previousSpend / totals.previousInstalls : 0;

  // Build the table rows
  const platformOrder = ['Meta', 'Snapchat', 'Google Ads', 'TikTok'];
  const sortedResults = platformOrder.map(
    p => results.find(r => r.platform === p) || { 
      platform: p, spend: 0, installs: 0, cpi: 0, 
      previousSpend: 0, previousInstalls: 0, previousCpi: 0, 
      error: 'No data' 
    }
  );

  // Format table with fixed-width columns
  const header = 'Platform         Spend        Installs      CPI';
  const separator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  const rows: string[] = [];
  
  for (const r of sortedResults) {
    const platform = r.platform.padEnd(16);
    const spend = r.error ? 'Error'.padStart(12) : formatCurrency(r.spend).padStart(12);
    const installs = r.error ? '-'.padStart(12) : formatNumber(r.installs).padStart(12);
    const cpi = r.error ? '-'.padStart(10) : formatCPI(r.spend, r.installs).padStart(10);
    rows.push(`${platform}${spend}${installs}${cpi}`);
    
    // Add percentage change row if enabled
    if (options.showPercentChanges && !r.error) {
      const spendChange = calculatePercentChange(r.spend, r.previousSpend).padStart(12);
      const installsChange = calculatePercentChange(r.installs, r.previousInstalls).padStart(12);
      const cpiChange = calculatePercentChange(r.cpi, r.previousCpi).padStart(10);
      rows.push(`${''.padEnd(16)}${spendChange}${installsChange}${cpiChange}`);
    }
    
    // Add blank line for spacing between platforms if enabled
    if (options.showPlatformSpacing) {
      rows.push('');
    }
  }

  // Total row
  const totalRow = `${'TOTAL'.padEnd(16)}${formatCurrency(totals.spend).padStart(12)}${formatNumber(totals.installs).padStart(12)}${formatCPI(totals.spend, totals.installs).padStart(10)}`;
  
  // Total change row if enabled
  const totalRows = [totalRow];
  if (options.showPercentChanges) {
    const totalChangeRow = `${''.padEnd(16)}${calculatePercentChange(totals.spend, totals.previousSpend).padStart(12)}${calculatePercentChange(totals.installs, totals.previousInstalls).padStart(12)}${calculatePercentChange(totalCpi, previousTotalCpi).padStart(10)}`;
    totalRows.push(totalChangeRow);
  }

  const tableContent = [header, separator, ...rows, separator, ...totalRows].join('\n');

  // Build ranking text
  const rankingText = ranking.rank !== null 
    ? `🏆 *App Store Ranking:* #${ranking.rank} in ${ranking.categoryName} (Free)`
    : ranking.error 
      ? `🏆 *App Store Ranking:* Unable to fetch`
      : `🏆 *App Store Ranking:* No data available`;

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
          text: rankingText,
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

    // Parse request body for custom options
    let customDate: string | null = null;
    let formatOptions: FormatOptions = {
      showPercentChanges: true,
      showPlatformSpacing: true,
    };

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.date) {
          customDate = body.date;
        }
        if (typeof body.showPercentChanges === 'boolean') {
          formatOptions.showPercentChanges = body.showPercentChanges;
        }
        if (typeof body.showPlatformSpacing === 'boolean') {
          formatOptions.showPlatformSpacing = body.showPlatformSpacing;
        }
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Use custom date or default to yesterday
    const reportDate = customDate || getDateEST(1);
    const previousDate = customDate 
      ? new Date(new Date(customDate + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0]
      : getDateEST(2);
    
    console.log(`Generating report for: ${reportDate} (comparing to ${previousDate})`);
    console.log(`Format options:`, formatOptions);

    // Fetch all platform data and ranking in parallel
    const platforms = [
      { name: 'Meta', endpoint: 'meta-history' },
      { name: 'Snapchat', endpoint: 'snapchat-history' },
      { name: 'Google Ads', endpoint: 'google-ads-history' },
      { name: 'TikTok', endpoint: 'tiktok-history' },
    ];

    const [platformResults, rankingData] = await Promise.all([
      Promise.all(
        platforms.map(p => fetchPlatformData(p.name, p.endpoint, supabaseUrl, anonKey, reportDate, previousDate))
      ),
      fetchRankingForDate(supabaseUrl, anonKey, reportDate),
    ]);

    console.log('Platform results:', JSON.stringify(platformResults, null, 2));
    console.log('Ranking data:', JSON.stringify(rankingData, null, 2));

    // Build and send Slack message
    const slackMessage = buildSlackMessage(platformResults, reportDate, formatOptions, rankingData);
    
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
      JSON.stringify({ success: true, date: reportDate, formatOptions, results: platformResults, ranking: rankingData }),
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
