import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CAMPAIGN_LAUNCH_DATE = '2026-02-18';

function getLastFullDayEST(): string {
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(twoDaysAgo);
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

function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface FTDTotals {
  spend: number;
  ftd_count: number;
  cost_per_ftd: number;
  results_value: number;
  roas: number;
  avg_ftd_value: number;
}

interface CampaignTotals extends FTDTotals {
  campaign_name: string;
}

function campaignLabel(name: string): string {
  const parts = name.split('|').map(s => s.trim());
  const intlIdx = parts.findIndex(p => p.toUpperCase() === 'INTERNATIONAL');
  const webIdx = parts.findIndex(p => p.toUpperCase() === 'WEB');
  if (intlIdx >= 0 && webIdx > intlIdx) {
    return parts.slice(intlIdx + 1, webIdx).join(' ');
  }
  return name.length > 20 ? name.substring(0, 20) + '…' : name;
}

async function fetchFTDDataRange(
  supabase: ReturnType<typeof createClient>,
  startDate: string,
  endDate: string
): Promise<{ totals: FTDTotals; campaigns: CampaignTotals[] }> {
  const { data, error } = await supabase
    .from('ftd_performance')
    .select('spend, ftd_count, results_value, campaign_name')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) {
    console.error(`FTD range fetch error ${startDate}-${endDate}:`, error.message);
    const empty = { spend: 0, ftd_count: 0, cost_per_ftd: 0, results_value: 0, roas: 0, avg_ftd_value: 0 };
    return { totals: empty, campaigns: [] };
  }

  const rows = data || [];

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

function buildCumulativeSlackMessage(
  startDate: string,
  endDate: string,
  data: { totals: FTDTotals; campaigns: CampaignTotals[] },
): object {
  const COL1 = 18;
  const COL2 = 14;
  const SEP_LEN = COL1 + COL2;

  const header =    `${'Metric'.padEnd(COL1)}${'Total'.padStart(COL2)}`;
  const separator = '━'.repeat(SEP_LEN);
  const thinSep =   '─'.repeat(SEP_LEN);

  function row(label: string, value: string) {
    return `${label.padEnd(COL1)}${value.padStart(COL2)}`;
  }

  function metricsBlock(t: FTDTotals): string[] {
    return [
      row('Amount Spent',    formatCurrency(t.spend)),
      row('Payment Info Adds', formatNumber(t.ftd_count)),
      row('Cost per Add',    t.ftd_count > 0 ? formatCurrency(t.cost_per_ftd, 2) : '-'),
      row('Results Value',   t.results_value > 0 ? formatCurrency(t.results_value) : '-'),
      row('Results ROAS',    t.roas > 0 ? `${t.roas.toFixed(2)}x` : '-'),
      row('Avg. Result Value', t.avg_ftd_value > 0 ? formatCurrency(t.avg_ftd_value, 2) : '-'),
    ];
  }

  const campaignBlocks: string[] = [];
  data.campaigns.forEach((camp) => {
    const label = campaignLabel(camp.campaign_name);
    campaignBlocks.push('');
    campaignBlocks.push(`📌 ${label}`);
    campaignBlocks.push(thinSep);
    campaignBlocks.push(...metricsBlock(camp));
  });

  const totalBlock = [
    '',
    `📊 TOTAL`,
    separator,
    ...metricsBlock(data.totals),
  ];

  const lines = [header, separator, ...campaignBlocks, ...totalBlock].join('\n');


  const displayStart = formatDateShort(startDate);
  const displayEnd = formatDateForDisplay(endDate);

  return {
    channel: 'C0AED2ECQSZ',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Cumulative Performance Report — ${displayStart} to ${displayEnd}`,
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

    let previewOnly = false;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.preview === true) previewOnly = true;
      } catch { /* no body */ }
    }

    const endDate = getLastFullDayEST();
    const startDate = CAMPAIGN_LAUNCH_DATE;

    console.log(`Cumulative report: ${startDate} to ${endDate} (preview: ${previewOnly})`);

    // Auto-sync recent FTD data from Meta
    try {
      const syncUrl = `${supabaseUrl}/functions/v1/ftd-meta-sync`;
      // Sync just the last 3 days to keep it fast
      const syncStart = new Date();
      syncStart.setDate(syncStart.getDate() - 3);
      const syncStartStr = syncStart.toISOString().split('T')[0];
      console.log(`Auto-syncing FTD data for ${syncStartStr} to ${endDate}...`);
      const syncResp = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ startDate: syncStartStr, endDate }),
      });
      const syncResult = await syncResp.json();
      console.log('Auto-sync result:', JSON.stringify(syncResult));
    } catch (syncErr) {
      console.error('Auto-sync failed (continuing with existing data):', syncErr);
    }

    const result = await fetchFTDDataRange(supabase, startDate, endDate);

    console.log('Cumulative totals:', result.totals);
    console.log('Campaigns:', result.campaigns.map(c => c.campaign_name));

    if (previewOnly) {
      return new Response(
        JSON.stringify({
          success: true,
          preview: true,
          startDate,
          endDate,
          totals: result.totals,
          campaigns: result.campaigns,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send to Slack
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) throw new Error('SLACK_WEBHOOK_URL not configured');

    const slackMessage = buildCumulativeSlackMessage(startDate, endDate, result);

    const slackResponse = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      throw new Error(`Slack API error: ${slackResponse.status} - ${errorText}`);
    }

    console.log('Cumulative Slack report sent successfully');

    return new Response(
      JSON.stringify({ success: true, startDate, endDate, totals: result.totals }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in slack-cumulative-report:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
