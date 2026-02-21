import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getDateEST(daysAgo: number): string {
  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
}

function formatCurrency(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function pct(current: number, previous: number): string {
  if (previous === 0) return '  -  ';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface FTDTotals {
  spend: number;
  ftd_count: number;
  cost_per_ftd: number;
  results_value: number;
  roas: number;
  avg_ftd_value: number;
}

export interface CampaignTotals extends FTDTotals {
  campaign_name: string;
}

async function fetchFTDData(
  supabase: ReturnType<typeof createClient>,
  date: string
): Promise<{ totals: FTDTotals; campaigns: CampaignTotals[] }> {
  const { data, error } = await supabase
    .from('ftd_performance')
    .select('spend, ftd_count, results_value, campaign_name')
    .eq('date', date);

  if (error) {
    console.error(`FTD fetch error for ${date}:`, error.message);
    const empty = { spend: 0, ftd_count: 0, cost_per_ftd: 0, results_value: 0, roas: 0, avg_ftd_value: 0 };
    return { totals: empty, campaigns: [] };
  }

  const rows = data || [];

  // Per-campaign aggregation
  const campMap = new Map<string, { spend: number; ftd_count: number; results_value: number }>();
  rows.forEach((r) => {
    const name = r.campaign_name || 'Unknown';
    if (!campMap.has(name)) campMap.set(name, { spend: 0, ftd_count: 0, results_value: 0 });
    const c = campMap.get(name)!;
    c.spend += Number(r.spend) || 0;
    c.ftd_count += Number(r.ftd_count) || 0;
    c.results_value += Number(r.results_value) || 0;
  });

  const campaigns: CampaignTotals[] = Array.from(campMap.entries())
    .map(([name, c]) => ({
      campaign_name: name,
      spend: c.spend,
      ftd_count: c.ftd_count,
      cost_per_ftd: c.ftd_count > 0 ? c.spend / c.ftd_count : 0,
      results_value: c.results_value,
      roas: c.spend > 0 ? c.results_value / c.spend : 0,
      avg_ftd_value: c.ftd_count > 0 ? c.results_value / c.ftd_count : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Overall totals
  const spend = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const ftd_count = rows.reduce((s, r) => s + (Number(r.ftd_count) || 0), 0);
  const results_value = rows.reduce((s, r) => s + (Number(r.results_value) || 0), 0);

  return {
    totals: {
      spend,
      ftd_count,
      cost_per_ftd: ftd_count > 0 ? spend / ftd_count : 0,
      results_value,
      roas: spend > 0 ? results_value / spend : 0,
      avg_ftd_value: ftd_count > 0 ? results_value / ftd_count : 0,
    },
    campaigns,
  };
}

// Short label from campaign name: extract the differentiating part (e.g. "WORLD" or "TIER ONE")
function campaignLabel(name: string): string {
  const parts = name.split('|').map(s => s.trim());
  // Find the part after INTERNATIONAL and before WEB
  const intlIdx = parts.findIndex(p => p.toUpperCase() === 'INTERNATIONAL');
  const webIdx = parts.findIndex(p => p.toUpperCase() === 'WEB');
  if (intlIdx >= 0 && webIdx > intlIdx) {
    return parts.slice(intlIdx + 1, webIdx).join(' ');
  }
  return name.length > 20 ? name.substring(0, 20) + '…' : name;
}

function buildSlackMessage(
  date: string,
  currentData: { totals: FTDTotals; campaigns: CampaignTotals[] },
  previousData: { totals: FTDTotals; campaigns: CampaignTotals[] },
): object {
  const displayDate = formatDateForDisplay(date);

  const reportDateShort = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const prevDateShort = (() => {
    const prev = new Date(new Date(date + 'T12:00:00').getTime() - 86400000);
    return prev.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  const COL1 = 18;
  const COL2 = 12;
  const COL3 = 16;
  const SEP_LEN = COL1 + COL2 + COL3;

  const header =    `${'Metric'.padEnd(COL1)}${reportDateShort.padStart(COL2)}${('vs ' + prevDateShort).padStart(COL3)}`;
  const separator = '━'.repeat(SEP_LEN);
  const thinSep =   '─'.repeat(SEP_LEN);

  function row(label: string, value: string, change: string) {
    return `${label.padEnd(COL1)}${value.padStart(COL2)}${change.padStart(COL3)}`;
  }

  function metricsBlock(current: FTDTotals, previous: FTDTotals): string[] {
    const roasVal = current.roas > 0 ? `${current.roas.toFixed(2)}x` : '-';
    const roasChg = previous.roas > 0 ? pct(current.roas, previous.roas) : '-';
    return [
      row('Amount Spent',    formatCurrency(current.spend),                             pct(current.spend, previous.spend)),
      row('Results (FTDs)',  formatNumber(current.ftd_count),                           pct(current.ftd_count, previous.ftd_count)),
      row('Cost per Result', current.ftd_count > 0 ? formatCurrency(current.cost_per_ftd, 2) : '-', pct(current.cost_per_ftd, previous.cost_per_ftd)),
      row('Results Value',   current.results_value > 0 ? formatCurrency(current.results_value) : '-', pct(current.results_value, previous.results_value)),
      row('Results ROAS',    roasVal,                                                   roasChg),
      row('Avg. FTD Value',  current.avg_ftd_value > 0 ? formatCurrency(current.avg_ftd_value, 2) : '-', pct(current.avg_ftd_value, previous.avg_ftd_value)),
    ];
  }

  // Build per-campaign sections
  const campaignBlocks: string[] = [];
  currentData.campaigns.forEach((camp) => {
    const prevCamp = previousData.campaigns.find(p => p.campaign_name === camp.campaign_name)
      || { spend: 0, ftd_count: 0, cost_per_ftd: 0, results_value: 0, roas: 0, avg_ftd_value: 0, campaign_name: '' };
    const label = campaignLabel(camp.campaign_name);
    campaignBlocks.push('');
    campaignBlocks.push(`📌 ${label}`);
    campaignBlocks.push(thinSep);
    campaignBlocks.push(...metricsBlock(camp, prevCamp));
  });

  // Total section
  const totalBlock = [
    '',
    `📊 TOTAL`,
    separator,
    ...metricsBlock(currentData.totals, previousData.totals),
  ];

  const lines = [header, separator, ...campaignBlocks, ...totalBlock].join('\n');

  return {
    channel: 'C0AED2ECQSZ',
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
        text: { type: 'mrkdwn', text: '```' + lines + '```' },
      },
    ],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let customDate: string | null = null;
    let previewOnly = false;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.date) customDate = body.date;
        if (body.preview === true) previewOnly = true;
      } catch { /* no body */ }
    }

    // Always report on yesterday (previous day) unless a custom date is provided
    const reportDate = customDate || getDateEST(1);
    const previousDate = customDate
      ? new Date(new Date(customDate + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0]
      : getDateEST(2);

    console.log(`FTD report for: ${reportDate} vs ${previousDate} (preview: ${previewOnly})`);

    const [currentData, previousData] = await Promise.all([
      fetchFTDData(supabase, reportDate),
      fetchFTDData(supabase, previousDate),
    ]);

    console.log('Current totals:', currentData.totals);
    console.log('Campaigns:', currentData.campaigns.map(c => c.campaign_name));

    // If preview mode, return the data without sending to Slack
    if (previewOnly) {
      return new Response(
        JSON.stringify({
          success: true,
          preview: true,
          date: reportDate,
          previousDate,
          current: currentData.totals,
          previous: previousData.totals,
          campaigns: currentData.campaigns,
          previousCampaigns: previousData.campaigns,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send to Slack
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) throw new Error('SLACK_WEBHOOK_URL not configured');

    const slackMessage = buildSlackMessage(reportDate, currentData, previousData);

    const slackResponse = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      throw new Error(`Slack API error: ${slackResponse.status} - ${errorText}`);
    }

    console.log('Slack FTD report sent successfully');

    return new Response(
      JSON.stringify({ success: true, date: reportDate, current: currentData.totals, previous: previousData.totals }),
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
