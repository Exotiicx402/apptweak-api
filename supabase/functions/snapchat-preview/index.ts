import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CachedOAuthToken = { token: string; expiresAtMs: number };
let snapchatTokenCache: CachedOAuthToken | null = null;

// Get yesterday's date in EST timezone
function getYesterdayDate(): string {
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  estNow.setDate(estNow.getDate() - 1);
  return estNow.toISOString().split("T")[0];
}

function parseYmd(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${dateStr} (expected YYYY-MM-DD)`);
  return { year: y, month: m, day: d };
}

function addDaysYmd(dateStr: string, days: number): string {
  const { year, month, day } = parseYmd(dateStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function getZonedParts(utcDate: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(utcDate);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const hour = Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(utcDate: Date, timeZone: string): number {
  const p = getZonedParts(utcDate, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcDate.getTime();
}

function getUtcMsForZonedMidnight(dateStr: string, timeZone: string): number {
  const { year, month, day } = parseYmd(dateStr);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

  let utcMs = localMidnightAsUtc;
  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const nextUtcMs = localMidnightAsUtc - offset;
    if (Math.abs(nextUtcMs - utcMs) < 1000) break;
    utcMs = nextUtcMs;
  }

  return utcMs;
}

function resolveAccountDayRangeUtc(dateStr: string, timeZone: string): { startTime: string; endTime: string } {
  const startMs = getUtcMsForZonedMidnight(dateStr, timeZone);
  const nextDate = addDaysYmd(dateStr, 1);
  const endMs = getUtcMsForZonedMidnight(nextDate, timeZone);
  return {
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
  };
}

async function getSnapchatAccessToken(): Promise<string> {
  const clientId = Deno.env.get('SNAPCHAT_CLIENT_ID');
  const clientSecret = Deno.env.get('SNAPCHAT_CLIENT_SECRET');
  const refreshToken = Deno.env.get('SNAPCHAT_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Snapchat OAuth credentials');
  }

  if (snapchatTokenCache && Date.now() < snapchatTokenCache.expiresAtMs - 60_000) {
    console.log('Reusing cached Snapchat access token');
    return snapchatTokenCache.token;
  }

  console.log('Exchanging Snapchat refresh token for access token...');

  const response = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Snapchat access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const expiresInSec = Number(data.expires_in ?? 3600);
  snapchatTokenCache = {
    token: data.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  console.log('Successfully obtained Snapchat access token');
  return data.access_token;
}

async function fetchCampaignNames(accessToken: string): Promise<Map<string, string>> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  const campaignMap = new Map<string, string>();

  if (!adAccountId) {
    console.warn('Missing SNAPCHAT_AD_ACCOUNT_ID for campaign name lookup');
    return campaignMap;
  }

  try {
    console.log('Fetching campaign names...');
    const response = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/campaigns?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch campaign names: ${response.status}`);
      return campaignMap;
    }

    const data = await response.json();
    if (data.campaigns && Array.isArray(data.campaigns)) {
      for (const wrapper of data.campaigns) {
        const campaign = wrapper.campaign;
        if (campaign?.id && campaign?.name) {
          campaignMap.set(campaign.id, campaign.name);
        }
      }
    }

    console.log(`Fetched names for ${campaignMap.size} campaigns`);
  } catch (error) {
    console.warn('Error fetching campaign names:', error);
  }

  return campaignMap;
}

async function fetchAdNames(accessToken: string): Promise<Map<string, { name: string; adSquadId: string }>> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  const adMap = new Map<string, { name: string; adSquadId: string }>();

  if (!adAccountId) {
    console.warn('Missing SNAPCHAT_AD_ACCOUNT_ID for ad name lookup');
    return adMap;
  }

  try {
    console.log('Fetching ad names...');
    const response = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/ads?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch ad names: ${response.status}`);
      return adMap;
    }

    const data = await response.json();
    if (data.ads && Array.isArray(data.ads)) {
      for (const wrapper of data.ads) {
        const ad = wrapper.ad;
        if (ad?.id && ad?.name) {
          adMap.set(ad.id, { name: ad.name, adSquadId: ad.ad_squad_id || '' });
        }
      }
    }

    console.log(`Fetched names for ${adMap.size} ads`);
  } catch (error) {
    console.warn('Error fetching ad names:', error);
  }

  return adMap;
}

async function fetchAdSquadToCampaignMap(accessToken: string): Promise<Map<string, string>> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  const adSquadMap = new Map<string, string>();

  if (!adAccountId) {
    return adSquadMap;
  }

  try {
    console.log('Fetching ad squads for campaign mapping...');
    const response = await fetch(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/adsquads?limit=500`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch ad squads: ${response.status}`);
      return adSquadMap;
    }

    const data = await response.json();
    if (data.adsquads && Array.isArray(data.adsquads)) {
      for (const wrapper of data.adsquads) {
        const adSquad = wrapper.adsquad;
        if (adSquad?.id && adSquad?.campaign_id) {
          adSquadMap.set(adSquad.id, adSquad.campaign_id);
        }
      }
    }

    console.log(`Fetched ${adSquadMap.size} ad squad to campaign mappings`);
  } catch (error) {
    console.warn('Error fetching ad squads:', error);
  }

  return adSquadMap;
}

interface AdLookupMaps {
  adNames: Map<string, { name: string; adSquadId: string }>;
  adSquadToCampaign: Map<string, string>;
  campaignNames: Map<string, string>;
}

interface DiagnosticVariant {
  swipe_up_attribution_window: string;
  view_attribution_window: string;
  action_report_time: string;
}

// Fetch stats with specific attribution settings for diagnostics
async function fetchStatsWithSettings(
  accessToken: string, 
  date: string, 
  settings: DiagnosticVariant
): Promise<{ total_installs: number; ios_installs: number; android_installs: number; error?: string }> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');

  if (!adAccountId) {
    return { total_installs: -1, ios_installs: -1, android_installs: -1, error: 'Missing SNAPCHAT_AD_ACCOUNT_ID' };
  }

  const accountTimeZone = Deno.env.get('SNAPCHAT_ACCOUNT_TIMEZONE') || 'America/Toronto';
  const { startTime, endTime } = resolveAccountDayRangeUtc(date, accountTimeZone);

  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'DAY');
  url.searchParams.set('breakdown', 'campaign'); // Required for install metrics
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  url.searchParams.set('swipe_up_attribution_window', settings.swipe_up_attribution_window);
  url.searchParams.set('view_attribution_window', settings.view_attribution_window);
  url.searchParams.set('action_report_time', settings.action_report_time);
  url.searchParams.set('fields', 'total_installs,ios_installs,android_installs');

  console.log(`Diagnostics API call: swipe=${settings.swipe_up_attribution_window}, view=${settings.view_attribution_window}, action=${settings.action_report_time}`);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Diagnostics API error: ${response.status} ${errorText}`);
      return { total_installs: -1, ios_installs: -1, android_installs: -1, error: `API ${response.status}: ${errorText.slice(0, 100)}` };
    }

    const data = await response.json();
    
    let totalInstalls = 0;
    let iosInstalls = 0;
    let androidInstalls = 0;

    // Parse breakdown_stats.campaign structure (same as main preview)
    if (Array.isArray(data.timeseries_stats)) {
      for (const wrapper of data.timeseries_stats) {
        const timeseriesStat = wrapper?.timeseries_stat;
        if (!timeseriesStat) continue;

        const breakdownStats = timeseriesStat.breakdown_stats;
        if (!breakdownStats?.campaign || !Array.isArray(breakdownStats.campaign)) continue;

        for (const campaign of breakdownStats.campaign) {
          const timeseries = campaign.timeseries;
          if (Array.isArray(timeseries)) {
            for (const dayData of timeseries) {
              totalInstalls += dayData.stats?.total_installs || 0;
              iosInstalls += dayData.stats?.ios_installs || 0;
              androidInstalls += dayData.stats?.android_installs || 0;
            }
          }
        }
      }
    }

    console.log(`Result: total=${totalInstalls}, ios=${iosInstalls}, android=${androidInstalls}`);
    return { total_installs: totalInstalls, ios_installs: iosInstalls, android_installs: androidInstalls };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Diagnostics fetch error: ${errMsg}`);
    return { total_installs: -1, ios_installs: -1, android_installs: -1, error: errMsg };
  }
}

// Run diagnostics with multiple attribution window combinations
async function runDiagnostics(accessToken: string, date: string) {
  const variants: DiagnosticVariant[] = [
    // All swipe + view combinations with conversion time
    { swipe_up_attribution_window: '1_DAY', view_attribution_window: 'NONE', action_report_time: 'conversion' },
    { swipe_up_attribution_window: '1_DAY', view_attribution_window: '1_DAY', action_report_time: 'conversion' },
    { swipe_up_attribution_window: '7_DAY', view_attribution_window: 'NONE', action_report_time: 'conversion' },
    { swipe_up_attribution_window: '7_DAY', view_attribution_window: '1_DAY', action_report_time: 'conversion' },
    { swipe_up_attribution_window: '7_DAY', view_attribution_window: '7_DAY', action_report_time: 'conversion' },
    { swipe_up_attribution_window: '28_DAY', view_attribution_window: 'NONE', action_report_time: 'conversion' },
    { swipe_up_attribution_window: '28_DAY', view_attribution_window: '1_DAY', action_report_time: 'conversion' },
    { swipe_up_attribution_window: '28_DAY', view_attribution_window: '7_DAY', action_report_time: 'conversion' },
    // Key combinations with impression time
    { swipe_up_attribution_window: '7_DAY', view_attribution_window: '1_DAY', action_report_time: 'impression' },
    { swipe_up_attribution_window: '28_DAY', view_attribution_window: '1_DAY', action_report_time: 'impression' },
  ];

  const results: Array<{
    swipe_up_attribution_window: string;
    view_attribution_window: string;
    action_report_time: string;
    total_installs: number;
    ios_installs: number;
    android_installs: number;
    error?: string;
  }> = [];

  for (const variant of variants) {
    const stats = await fetchStatsWithSettings(accessToken, date, variant);
    results.push({
      ...variant,
      ...stats,
    });
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

// Fetch stats with DAY granularity to get SKAN installs (not available with HOUR)
async function fetchSnapchatStats(accessToken: string, date: string, lookupMaps: AdLookupMaps): Promise<any[]> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');

  if (!adAccountId) {
    throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');
  }

  const accountTimeZone = Deno.env.get('SNAPCHAT_ACCOUNT_TIMEZONE') || 'America/Toronto';
  const { startTime, endTime } = resolveAccountDayRangeUtc(date, accountTimeZone);

  console.log(`Querying date range: ${startTime} to ${endTime} (account TZ: ${accountTimeZone})`);

  console.log(`Fetching Snapchat stats for ad account ${adAccountId} on ${date}`);

  // Use DAY granularity to get SKAN install metrics (not available at HOUR level)
  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'DAY');
  url.searchParams.set('breakdown', 'campaign');
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  // Attribution windows: 7-day swipe, 1-day view, impression time (matches Snapchat Ads Manager)
  url.searchParams.set('swipe_up_attribution_window', '7_DAY');
  url.searchParams.set('view_attribution_window', '1_DAY');
  url.searchParams.set('action_report_time', 'impression');
  // Fetch installs via total_installs (matches Ads Manager "Installs")
  url.searchParams.set('fields', 'impressions,swipes,spend,video_views,screen_time_millis,quartile_1,quartile_2,quartile_3,view_completion,total_installs,ios_installs,android_installs,conversion_purchases,conversion_purchases_value');

  console.log(`API URL: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Snapchat API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const stats: any[] = [];

  console.log(`Response keys: ${Object.keys(data).join(', ')}`);

  if (Array.isArray(data.timeseries_stats)) {
    for (const wrapper of data.timeseries_stats) {
      const timeseriesStat = wrapper?.timeseries_stat;
      if (!timeseriesStat) continue;

      const breakdownStats = timeseriesStat.breakdown_stats;
      if (!breakdownStats?.campaign || !Array.isArray(breakdownStats.campaign)) {
        console.warn('No breakdown_stats.campaign found');
        continue;
      }

      console.log(`Found ${breakdownStats.campaign.length} campaigns in breakdown_stats`);

      for (const campaign of breakdownStats.campaign) {
        const campaignId = campaign.id || 'unknown';
        const campaignName = lookupMaps.campaignNames.get(campaignId) || campaignId;
        
        const timeseries = campaign.timeseries;

        if (Array.isArray(timeseries)) {
          for (const dayData of timeseries) {
            const iosInstalls = dayData.stats?.ios_installs || 0;
            const androidInstalls = dayData.stats?.android_installs || 0;
            const totalInstalls = dayData.stats?.total_installs ?? (iosInstalls + androidInstalls);

            console.log(
              `Campaign ${campaignName}: total_installs=${totalInstalls} (ios=${iosInstalls}, android=${androidInstalls})`
            );

            stats.push({
              timestamp: dayData.start_time,
              campaign_id: campaignId,
              campaign_name: campaignName,
              ad_id: '',
              ad_name: '',
              impressions: dayData.stats?.impressions || 0,
              swipes: dayData.stats?.swipes || 0,
              spend: (dayData.stats?.spend || 0) / 1000000,
              video_views: dayData.stats?.video_views || 0,
              screen_time_millis: dayData.stats?.screen_time_millis || 0,
              quartile_1: dayData.stats?.quartile_1 || 0,
              quartile_2: dayData.stats?.quartile_2 || 0,
              quartile_3: dayData.stats?.quartile_3 || 0,
              view_completion: dayData.stats?.view_completion || 0,
              total_installs: totalInstalls,
              conversion_purchases: dayData.stats?.conversion_purchases || 0,
              conversion_purchases_value: dayData.stats?.conversion_purchases_value || 0,
            });
          }
        }
      }
    }
  }

  console.log(`Extracted ${stats.length} daily stat records`);
  return stats;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    let targetDate = getYesterdayDate();
    let diagnosticsMode = false;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.date) {
          targetDate = body.date;
        }
        if (body.diagnostics === true) {
          diagnosticsMode = true;
        }
      } catch {
        // No body or invalid JSON, use default date
      }
    }

    console.log(`=== Snapchat Preview Started ===`);
    console.log(`Target date: ${targetDate}, Diagnostics mode: ${diagnosticsMode}`);

    const accessToken = await getSnapchatAccessToken();

    // If diagnostics mode, run the diagnostics and return early
    if (diagnosticsMode) {
      console.log('Running diagnostics mode...');
      const diagnosticsResults = await runDiagnostics(accessToken, targetDate);
      const duration = Date.now() - startTime;
      
      console.log(`Diagnostics completed in ${duration}ms with ${diagnosticsResults.length} variants`);
      
      return new Response(
        JSON.stringify({
          success: true,
          diagnostics: true,
          date: targetDate,
          results: diagnosticsResults,
          durationMs: duration,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fetch all lookup maps in parallel
    const [campaignNames, adNames, adSquadToCampaign] = await Promise.all([
      fetchCampaignNames(accessToken),
      fetchAdNames(accessToken),
      fetchAdSquadToCampaignMap(accessToken),
    ]);
    
    const lookupMaps: AdLookupMaps = { adNames, adSquadToCampaign, campaignNames };
    const snapchatData = await fetchSnapchatStats(accessToken, targetDate, lookupMaps);

    if (snapchatData.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
           summary: {
             totalSpend: 0,
             totalImpressions: 0,
             totalSwipes: 0,
             totalInstalls: 0,
             avgCpi: 0,
             swipeRate: 0,
             rowCount: 0,
             campaigns: [],
             ads: [],
           },
          date: targetDate,
          durationMs: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate summary statistics
    const totalSpend = snapchatData.reduce((sum, row) => sum + (row.spend || 0), 0);
    const totalImpressions = snapchatData.reduce((sum, row) => sum + (row.impressions || 0), 0);
    const totalSwipes = snapchatData.reduce((sum, row) => sum + (row.swipes || 0), 0);
     const totalInstalls = snapchatData.reduce((sum, row) => sum + (row.total_installs || 0), 0);
     const avgCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
     const swipeRate = totalImpressions > 0 ? (totalSwipes / totalImpressions) * 100 : 0;

    // Get spend by campaign
     const campaignSpend: Record<string, { name: string; spend: number; installs: number; impressions: number; swipes: number }> = {};
     snapchatData.forEach(row => {
       const key = row.campaign_id || 'Unknown';
       if (!campaignSpend[key]) {
         campaignSpend[key] = { name: row.campaign_name || key, spend: 0, installs: 0, impressions: 0, swipes: 0 };
       }
       campaignSpend[key].spend += row.spend || 0;
       campaignSpend[key].installs += row.total_installs || 0;
       campaignSpend[key].impressions += row.impressions || 0;
       campaignSpend[key].swipes += row.swipes || 0;
     });

    // Get spend by ad (empty since we're using campaign breakdown for SKAN)
    const adSpend: Record<string, { name: string; spend: number; installs: number; impressions: number; swipes: number }> = {};

    const summary = {
      totalSpend,
      totalImpressions,
      totalSwipes,
      totalInstalls,
      avgCpi,
      swipeRate,
      rowCount: snapchatData.length,
       campaigns: Object.entries(campaignSpend)
         .map(([id, data]) => ({
           id,
           name: data.name,
           spend: data.spend,
           installs: data.installs,
           impressions: data.impressions,
           swipeRate: data.impressions > 0 ? (data.swipes / data.impressions) * 100 : 0,
         }))
         .sort((a, b) => b.spend - a.spend),
      ads: Object.entries(adSpend)
        .map(([id, data]) => ({
          id,
          name: data.name,
          spend: data.spend,
          installs: data.installs,
          impressions: data.impressions,
          swipeRate: data.impressions > 0 ? (data.swipes / data.impressions) * 100 : 0,
        }))
        .sort((a, b) => b.spend - a.spend),
    };

    const duration = Date.now() - startTime;
     console.log(`=== Preview completed in ${duration}ms with ${snapchatData.length} rows ===`);
     console.log(`Total spend: $${totalSpend.toFixed(2)}, Total installs: ${totalInstalls}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: snapchatData,
        summary,
        date: targetDate,
        durationMs: duration,
        attributionSettings: {
          swipe_up_attribution_window: '28_DAY',
          view_attribution_window: '1_DAY',
          action_report_time: 'conversion',
          note: 'Installs are credited to the day of conversion. Snapchat platform may use impression time, causing discrepancies.',
        },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
