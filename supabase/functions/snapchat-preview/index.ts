import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CachedOAuthToken = { token: string; expiresAtMs: number };
let snapchatTokenCache: CachedOAuthToken | null = null;

function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split('T')[0];
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

async function fetchSnapchatStats(accessToken: string, date: string, lookupMaps: AdLookupMaps): Promise<any[]> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');

  if (!adAccountId) {
    throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');
  }

  const startTime = `${date}T00:00:00.000Z`;
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const endTime = nextDate.toISOString().split('.')[0] + '.000Z';

  console.log(`Fetching Snapchat stats for ad account ${adAccountId} on ${date}`);

  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'HOUR');
  url.searchParams.set('breakdown', 'ad');
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  url.searchParams.set('fields', 'impressions,swipes,spend,video_views,screen_time_millis,quartile_1,quartile_2,quartile_3,view_completion,total_installs,conversion_purchases,conversion_purchases_value');

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

  if (Array.isArray(data.timeseries_stats)) {
    for (const wrapper of data.timeseries_stats) {
      const timeseriesStat = wrapper?.timeseries_stat;
      if (!timeseriesStat) continue;

      const breakdownStats = timeseriesStat.breakdown_stats;
      if (!breakdownStats?.ad || !Array.isArray(breakdownStats.ad)) continue;

      for (const ad of breakdownStats.ad) {
        const adId = ad.id || 'unknown';
        const adInfo = lookupMaps.adNames.get(adId);
        const adName = adInfo?.name || adId;
        const adSquadId = adInfo?.adSquadId || '';
        const campaignId = lookupMaps.adSquadToCampaign.get(adSquadId) || '';
        const campaignName = lookupMaps.campaignNames.get(campaignId) || campaignId;
        
        const timeseries = ad.timeseries;

        if (Array.isArray(timeseries)) {
          for (const hourData of timeseries) {
            stats.push({
              timestamp: hourData.start_time,
              campaign_id: campaignId,
              campaign_name: campaignName,
              ad_id: adId,
              ad_name: adName,
              impressions: hourData.stats?.impressions || 0,
              swipes: hourData.stats?.swipes || 0,
              spend: (hourData.stats?.spend || 0) / 1000000,
              video_views: hourData.stats?.video_views || 0,
              screen_time_millis: hourData.stats?.screen_time_millis || 0,
              quartile_1: hourData.stats?.quartile_1 || 0,
              quartile_2: hourData.stats?.quartile_2 || 0,
              quartile_3: hourData.stats?.quartile_3 || 0,
              view_completion: hourData.stats?.view_completion || 0,
              total_installs: hourData.stats?.total_installs || 0,
              conversion_purchases: hourData.stats?.conversion_purchases || 0,
              conversion_purchases_value: hourData.stats?.conversion_purchases_value || 0,
            });
          }
        }
      }
    }
  }

  console.log(`Extracted ${stats.length} hourly stat records`);
  return stats;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
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

    console.log(`=== Snapchat Preview Started ===`);
    console.log(`Target date: ${targetDate}`);

    const accessToken = await getSnapchatAccessToken();
    
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

    // Get spend by ad
    const adSpend: Record<string, { name: string; spend: number; installs: number; impressions: number; swipes: number }> = {};
    snapchatData.forEach(row => {
      const key = row.ad_id || 'Unknown';
      if (!adSpend[key]) {
        adSpend[key] = { name: row.ad_name || key, spend: 0, installs: 0, impressions: 0, swipes: 0 };
      }
      adSpend[key].spend += row.spend || 0;
      adSpend[key].installs += row.total_installs || 0;
      adSpend[key].impressions += row.impressions || 0;
      adSpend[key].swipes += row.swipes || 0;
    });

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

    return new Response(
      JSON.stringify({
        success: true,
        data: snapchatData,
        summary,
        date: targetDate,
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
