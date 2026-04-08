import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

interface PlatformData {
  spend: number;
  installs: number;
  ftds: number;
  cpi: number;
  cftd: number;
}

const emptyPlatform: PlatformData = { spend: 0, installs: 0, ftds: 0, cpi: 0, cftd: 0 };

async function fetchPlatformData(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
  startDate: string,
  endDate: string,
): Promise<PlatformData> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const url = `${supabaseUrl}/functions/v1/${functionName}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ startDate, endDate }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await resp.json();
    if (!result?.success) {
      console.error(`${functionName} failed:`, result?.error);
      return { ...emptyPlatform };
    }
    const totals = result.data?.totals || {};
    const spend = totals.spend || 0;
    const installs = totals.installs || 0;
    const ftds = totals.ftds || 0;
    return {
      spend,
      installs,
      ftds,
      cpi: installs > 0 ? spend / installs : 0,
      cftd: ftds > 0 ? spend / ftds : 0,
    };
  } catch (err) {
    console.error(`Error calling ${functionName} (may have timed out):`, err);
    return { ...emptyPlatform };
  }
}

function buildSlackMessage(
  date: string,
  metaCurrent: PlatformData,
  metaPrevious: PlatformData,
  molocoCurrent: PlatformData,
  molocoPrevious: PlatformData,
): object {
  const displayDate = formatDateForDisplay(date);
  const reportDateShort = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const prevDateShort = (() => {
    const prev = new Date(new Date(date + 'T12:00:00').getTime() - 86400000);
    return prev.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  const COL1 = 14;
  const COL2 = 12;
  const COL3 = 14;
  const SEP_LEN = COL1 + COL2 + COL3;

  const header    = `${'Metric'.padEnd(COL1)}${reportDateShort.padStart(COL2)}${('vs ' + prevDateShort).padStart(COL3)}`;
  const separator = '━'.repeat(SEP_LEN);
  const thinSep   = '─'.repeat(SEP_LEN);

  function row(label: string, value: string, change: string) {
    return `${label.padEnd(COL1)}${value.padStart(COL2)}${change.padStart(COL3)}`;
  }

  function platformBlock(current: PlatformData, previous: PlatformData): string[] {
    return [
      row('Spend',    formatCurrency(current.spend),                        pct(current.spend, previous.spend)),
      row('Installs', formatNumber(current.installs),                       pct(current.installs, previous.installs)),
      row('FTD',      formatNumber(current.ftds),                           pct(current.ftds, previous.ftds)),
      row('CPI',      current.cpi > 0 ? formatCurrency(current.cpi, 2) : '-',   current.cpi > 0 && previous.cpi > 0 ? pct(current.cpi, previous.cpi) : '  -  '),
      row('CFTD',     current.cftd > 0 ? formatCurrency(current.cftd, 2) : '-', current.cftd > 0 && previous.cftd > 0 ? pct(current.cftd, previous.cftd) : '  -  '),
    ];
  }

  // Totals
  const totalCurrent: PlatformData = {
    spend: metaCurrent.spend + molocoCurrent.spend,
    installs: metaCurrent.installs + molocoCurrent.installs,
    ftds: metaCurrent.ftds + molocoCurrent.ftds,
    cpi: 0, cftd: 0,
  };
  totalCurrent.cpi = totalCurrent.installs > 0 ? totalCurrent.spend / totalCurrent.installs : 0;
  totalCurrent.cftd = totalCurrent.ftds > 0 ? totalCurrent.spend / totalCurrent.ftds : 0;

  const totalPrevious: PlatformData = {
    spend: metaPrevious.spend + molocoPrevious.spend,
    installs: metaPrevious.installs + molocoPrevious.installs,
    ftds: metaPrevious.ftds + molocoPrevious.ftds,
    cpi: 0, cftd: 0,
  };
  totalPrevious.cpi = totalPrevious.installs > 0 ? totalPrevious.spend / totalPrevious.installs : 0;
  totalPrevious.cftd = totalPrevious.ftds > 0 ? totalPrevious.spend / totalPrevious.ftds : 0;

  const lines = [
    header,
    separator,
    '',
    'META',
    thinSep,
    ...platformBlock(metaCurrent, metaPrevious),
    '',
    'MOLOCO',
    thinSep,
    ...platformBlock(molocoCurrent, molocoPrevious),
    '',
    'TOTAL',
    separator,
    ...platformBlock(totalCurrent, totalPrevious),
  ].join('\n');

  return {
    channel: 'C0AED2ECQSZ',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Daily Performance Report - ${displayDate}`,
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

    let customDate: string | null = null;
    let previewOnly = false;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.date) customDate = body.date;
        if (body.preview === true) previewOnly = true;
      } catch { /* no body */ }
    }

    const reportDate = customDate || getDateEST(1);
    const previousDate = customDate
      ? new Date(new Date(customDate + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0]
      : getDateEST(2);

    console.log(`Platform report for: ${reportDate} vs ${previousDate} (preview: ${previewOnly})`);

    // Fetch all 4 data points in parallel
    const [metaCurrent, metaPrevious, molocoCurrent, molocoPrevious] = await Promise.all([
      fetchPlatformData(supabaseUrl, serviceRoleKey, 'meta-history', reportDate, reportDate),
      fetchPlatformData(supabaseUrl, serviceRoleKey, 'meta-history', previousDate, previousDate),
      fetchPlatformData(supabaseUrl, serviceRoleKey, 'moloco-history', reportDate, reportDate),
      fetchPlatformData(supabaseUrl, serviceRoleKey, 'moloco-history', previousDate, previousDate),
    ]);

    console.log('Meta current:', metaCurrent);
    console.log('Moloco current:', molocoCurrent);

    if (previewOnly) {
      return new Response(
        JSON.stringify({
          success: true,
          preview: true,
          date: reportDate,
          previousDate,
          meta: { current: metaCurrent, previous: metaPrevious },
          moloco: { current: molocoCurrent, previous: molocoPrevious },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send to Slack
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) throw new Error('SLACK_WEBHOOK_URL not configured');

    const slackMessage = buildSlackMessage(reportDate, metaCurrent, metaPrevious, molocoCurrent, molocoPrevious);

    const slackResponse = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      throw new Error(`Slack API error: ${slackResponse.status} - ${errorText}`);
    }

    console.log('Slack platform report sent successfully');

    return new Response(
      JSON.stringify({ success: true, date: reportDate, meta: metaCurrent, moloco: molocoCurrent }),
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
