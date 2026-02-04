import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CachedOAuthToken = { token: string; expiresAtMs: number };
let snapchatTokenCache: CachedOAuthToken | null = null;

// Get today's date in EST timezone
function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function parseYmd(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${dateStr}`);
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

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getSnapchatAccessToken(): Promise<string> {
  const clientId = Deno.env.get('SNAPCHAT_CLIENT_ID');
  const clientSecret = Deno.env.get('SNAPCHAT_CLIENT_SECRET');
  const refreshToken = Deno.env.get('SNAPCHAT_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Snapchat OAuth credentials');
  }

  if (snapchatTokenCache && Date.now() < snapchatTokenCache.expiresAtMs - 60_000) {
    return snapchatTokenCache.token;
  }

  const response = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
  return data.access_token;
}

function resolveBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  const rawProjectId = Deno.env.get("BQ_PROJECT_ID")?.trim();
  const rawDatasetId = Deno.env.get("BQ_DATASET_ID")?.trim();
  const rawTableId = Deno.env.get("SNAPCHAT_BQ_TABLE_ID")?.trim();

  let projectId = rawProjectId || "";
  let datasetId = rawDatasetId || "";
  let tableId = rawTableId || "";

  const splitRef = (value: string) => value.replace(/`/g, "").split(/[.:]/).filter(Boolean);

  if (tableId && (tableId.includes(".") || tableId.includes(":"))) {
    const parts = splitRef(tableId);
    if (parts.length >= 3) {
      projectId = parts[0];
      datasetId = parts[1];
      tableId = parts[2];
    } else if (parts.length === 2) {
      datasetId = parts[0];
      tableId = parts[1];
    }
  }

  return { projectId, datasetId, tableId };
}

async function queryBigQuery(query: string, accessToken: string): Promise<any[]> {
  const { projectId } = resolveBigQueryTarget();
  
  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        timeoutMs: 30000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BigQuery error: ${errorText}`);
  }

  const result = await response.json();
  
  if (!result.rows) {
    return [];
  }

  const fields = result.schema.fields.map((f: any) => f.name);
  return result.rows.map((row: any) => {
    const obj: any = {};
    row.f.forEach((cell: any, index: number) => {
      obj[fields[index]] = cell.v;
    });
    return obj;
  });
}

// Fetch live Snapchat stats for a specific date
async function fetchSnapchatLiveStats(accessToken: string, date: string): Promise<any> {
  const adAccountId = Deno.env.get('SNAPCHAT_AD_ACCOUNT_ID');
  if (!adAccountId) {
    throw new Error('Missing SNAPCHAT_AD_ACCOUNT_ID');
  }

  const accountTimeZone = Deno.env.get('SNAPCHAT_ACCOUNT_TIMEZONE') || 'America/Toronto';
  const { startTime, endTime } = resolveAccountDayRangeUtc(date, accountTimeZone);

  const url = new URL(`https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/stats`);
  url.searchParams.set('granularity', 'DAY');
  url.searchParams.set('breakdown', 'campaign');
  url.searchParams.set('start_time', startTime);
  url.searchParams.set('end_time', endTime);
  url.searchParams.set('omit_empty', 'false');
  url.searchParams.set('swipe_up_attribution_window', '7_DAY');
  url.searchParams.set('view_attribution_window', '1_DAY');
  url.searchParams.set('action_report_time', 'impression');
  url.searchParams.set('fields', 'impressions,swipes,spend,video_views,total_installs');

  console.log(`Fetching live Snapchat data for ${date}`);

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
  
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalSwipes = 0;
  let totalVideoViews = 0;
  let totalInstalls = 0;

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
            totalSpend += (dayData.stats?.spend || 0) / 1000000;
            totalImpressions += dayData.stats?.impressions || 0;
            totalSwipes += dayData.stats?.swipes || 0;
            totalVideoViews += dayData.stats?.video_views || 0;
            totalInstalls += dayData.stats?.total_installs || 0;
          }
        }
      }
    }
  }

  return {
    date,
    spend: totalSpend,
    impressions: totalImpressions,
    swipes: totalSwipes,
    video_views: totalVideoViews,
    installs: totalInstalls,
    view_completion: 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, campaignId } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = getTodayDate();
    const includestoday = endDate >= today;
    const bqEndDate = includestoday ? addDaysYmd(today, -1) : endDate;
    const shouldQueryBigQuery = startDate <= bqEndDate;

    console.log(`Query range: ${startDate} to ${endDate}, today: ${today}, includestoday: ${includestoday}`);

    const googleAccessToken = await getGoogleAccessToken();
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

    // Calculate previous period
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - daysDiff - 1);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    
    const prevStartStr = prevStart.toISOString().split("T")[0];
    const prevEndStr = prevEnd.toISOString().split("T")[0];

    const campaignFilter = campaignId ? `AND campaign_id = '${campaignId}'` : "";

    // Build queries
    // Smart fallback: prefer ad-level data when it exists, otherwise use campaign-level
    // This handles both new ad-level data and historical campaign-level data without double-counting
    
    // Daily query with fallback
    const dailyQuery = shouldQueryBigQuery ? `
      WITH ad_level AS (
        SELECT 
          DATE(timestamp) as date,
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(swipes) as swipes,
          SUM(video_views) as video_views,
          SUM(total_installs) as installs,
          SUM(view_completion) as view_completion
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
        AND ad_id IS NOT NULL AND ad_id != ''
        ${campaignFilter}
        GROUP BY date
      ),
      campaign_level AS (
        SELECT 
          DATE(timestamp) as date,
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(swipes) as swipes,
          SUM(video_views) as video_views,
          SUM(total_installs) as installs,
          SUM(view_completion) as view_completion
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
        AND (ad_id IS NULL OR ad_id = '')
        ${campaignFilter}
        GROUP BY date
      )
      SELECT 
        COALESCE(a.date, c.date) as date,
        COALESCE(a.spend, c.spend, 0) as spend,
        COALESCE(a.impressions, c.impressions, 0) as impressions,
        COALESCE(a.swipes, c.swipes, 0) as swipes,
        COALESCE(a.video_views, c.video_views, 0) as video_views,
        COALESCE(a.installs, c.installs, 0) as installs,
        COALESCE(a.view_completion, c.view_completion, 0) as view_completion
      FROM ad_level a
      FULL OUTER JOIN campaign_level c ON a.date = c.date
      ORDER BY date
    ` : null;

    // Campaign query with fallback
    const campaignQuery = shouldQueryBigQuery ? `
      WITH ad_level AS (
        SELECT 
          campaign_id,
          campaign_name,
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(swipes) as swipes,
          SUM(video_views) as video_views,
          SUM(total_installs) as installs,
          SUM(view_completion) as view_completion
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
        AND ad_id IS NOT NULL AND ad_id != ''
        GROUP BY campaign_id, campaign_name
      ),
      campaign_level AS (
        SELECT 
          campaign_id,
          campaign_name,
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(swipes) as swipes,
          SUM(video_views) as video_views,
          SUM(total_installs) as installs,
          SUM(view_completion) as view_completion
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
        AND (ad_id IS NULL OR ad_id = '')
        GROUP BY campaign_id, campaign_name
      )
      SELECT 
        COALESCE(a.campaign_id, c.campaign_id) as campaign_id,
        COALESCE(a.campaign_name, c.campaign_name) as campaign_name,
        COALESCE(a.spend, c.spend, 0) as spend,
        COALESCE(a.impressions, c.impressions, 0) as impressions,
        COALESCE(a.swipes, c.swipes, 0) as swipes,
        COALESCE(a.video_views, c.video_views, 0) as video_views,
        COALESCE(a.installs, c.installs, 0) as installs,
        COALESCE(a.view_completion, c.view_completion, 0) as view_completion
      FROM ad_level a
      FULL OUTER JOIN campaign_level c ON a.campaign_id = c.campaign_id
      ORDER BY spend DESC
    ` : null;

    // Ad-level query (only returns data when ad_id exists - no fallback needed)
    const adsQuery = shouldQueryBigQuery ? `
      SELECT 
        ad_id,
        ad_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(swipes) as swipes,
        SUM(total_installs) as installs,
        SAFE_DIVIDE(SUM(swipes), NULLIF(SUM(impressions), 0)) as swipe_rate,
        SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      AND ad_id IS NOT NULL AND ad_id != ''
      GROUP BY ad_id, ad_name
      ORDER BY spend DESC
      LIMIT 50
    ` : null;

    // Totals query with fallback
    const totalsQuery = shouldQueryBigQuery ? `
      WITH ad_level AS (
        SELECT 
          SUM(spend) as total_spend,
          SUM(impressions) as total_impressions,
          SUM(swipes) as total_swipes,
          SUM(video_views) as total_video_views,
          SUM(total_installs) as total_installs,
          SUM(view_completion) as total_view_completion,
          SAFE_DIVIDE(SUM(swipes), SUM(impressions)) as swipe_rate,
          SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
        AND ad_id IS NOT NULL AND ad_id != ''
        ${campaignFilter}
      ),
      campaign_level AS (
        SELECT 
          SUM(spend) as total_spend,
          SUM(impressions) as total_impressions,
          SUM(swipes) as total_swipes,
          SUM(video_views) as total_video_views,
          SUM(total_installs) as total_installs,
          SUM(view_completion) as total_view_completion,
          SAFE_DIVIDE(SUM(swipes), SUM(impressions)) as swipe_rate,
          SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
        AND (ad_id IS NULL OR ad_id = '')
        ${campaignFilter}
      )
      SELECT 
        COALESCE(ad_level.total_spend, campaign_level.total_spend, 0) as total_spend,
        COALESCE(ad_level.total_impressions, campaign_level.total_impressions, 0) as total_impressions,
        COALESCE(ad_level.total_swipes, campaign_level.total_swipes, 0) as total_swipes,
        COALESCE(ad_level.total_video_views, campaign_level.total_video_views, 0) as total_video_views,
        COALESCE(ad_level.total_installs, campaign_level.total_installs, 0) as total_installs,
        COALESCE(ad_level.total_view_completion, campaign_level.total_view_completion, 0) as total_view_completion,
        COALESCE(ad_level.swipe_rate, campaign_level.swipe_rate, 0) as swipe_rate,
        COALESCE(ad_level.cpi, campaign_level.cpi, 0) as cpi
      FROM ad_level, campaign_level
    ` : null;

    // Previous period query with fallback
    const prevTotalsQuery = `
      WITH ad_level AS (
        SELECT 
          SUM(spend) as total_spend,
          SUM(impressions) as total_impressions,
          SUM(swipes) as total_swipes,
          SUM(video_views) as total_video_views,
          SUM(total_installs) as total_installs,
          SUM(view_completion) as total_view_completion,
          SAFE_DIVIDE(SUM(swipes), SUM(impressions)) as swipe_rate,
          SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
        AND ad_id IS NOT NULL AND ad_id != ''
        ${campaignFilter}
      ),
      campaign_level AS (
        SELECT 
          SUM(spend) as total_spend,
          SUM(impressions) as total_impressions,
          SUM(swipes) as total_swipes,
          SUM(video_views) as total_video_views,
          SUM(total_installs) as total_installs,
          SUM(view_completion) as total_view_completion,
          SAFE_DIVIDE(SUM(swipes), SUM(impressions)) as swipe_rate,
          SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
        FROM ${fullTable}
        WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
        AND (ad_id IS NULL OR ad_id = '')
        ${campaignFilter}
      )
      SELECT 
        COALESCE(ad_level.total_spend, campaign_level.total_spend, 0) as total_spend,
        COALESCE(ad_level.total_impressions, campaign_level.total_impressions, 0) as total_impressions,
        COALESCE(ad_level.total_swipes, campaign_level.total_swipes, 0) as total_swipes,
        COALESCE(ad_level.total_video_views, campaign_level.total_video_views, 0) as total_video_views,
        COALESCE(ad_level.total_installs, campaign_level.total_installs, 0) as total_installs,
        COALESCE(ad_level.total_view_completion, campaign_level.total_view_completion, 0) as total_view_completion,
        COALESCE(ad_level.swipe_rate, campaign_level.swipe_rate, 0) as swipe_rate,
        COALESCE(ad_level.cpi, campaign_level.cpi, 0) as cpi
      FROM ad_level, campaign_level
    `;

    // Execute queries in parallel
    const promises: Promise<any>[] = [];
    
    if (shouldQueryBigQuery) {
      promises.push(
        queryBigQuery(dailyQuery!, googleAccessToken),
        queryBigQuery(campaignQuery!, googleAccessToken),
        queryBigQuery(totalsQuery!, googleAccessToken)
      );
    } else {
      promises.push(Promise.resolve([]), Promise.resolve([]), Promise.resolve([]));
    }
    
    promises.push(queryBigQuery(prevTotalsQuery, googleAccessToken));
    
    // Fetch live data for today if needed
    if (includestoday) {
      const snapchatToken = await getSnapchatAccessToken();
      promises.push(fetchSnapchatLiveStats(snapchatToken, today));
    } else {
      promises.push(Promise.resolve(null));
    }

    const [bqDailyData, bqCampaignData, bqTotalsData, prevTotalsData, liveData] = await Promise.all(promises);

    // Fetch ad-level data separately (fault-tolerant)
    let bqAdsData: any[] = [];
    if (shouldQueryBigQuery && adsQuery) {
      try {
        bqAdsData = await queryBigQuery(adsQuery, googleAccessToken);
      } catch (adsError) {
        console.log("Ad-level query failed (columns may not exist):", adsError);
        bqAdsData = [];
      }
    }

    // Process BigQuery data
    let dailyData = bqDailyData.map((row: any) => ({
      date: row.date,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      swipes: parseInt(row.swipes) || 0,
      video_views: parseInt(row.video_views) || 0,
      installs: parseInt(row.installs) || 0,
      view_completion: parseInt(row.view_completion) || 0,
    }));

    let campaignData = bqCampaignData.map((row: any) => ({
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      swipes: parseInt(row.swipes) || 0,
      video_views: parseInt(row.video_views) || 0,
      installs: parseInt(row.installs) || 0,
      view_completion: parseInt(row.view_completion) || 0,
    }));

    const bqTotals = bqTotalsData[0] || {};
    let totals = {
      spend: parseFloat(bqTotals.total_spend) || 0,
      impressions: parseInt(bqTotals.total_impressions) || 0,
      swipes: parseInt(bqTotals.total_swipes) || 0,
      video_views: parseInt(bqTotals.total_video_views) || 0,
      installs: parseInt(bqTotals.total_installs) || 0,
      view_completion: parseInt(bqTotals.total_view_completion) || 0,
      swipe_rate: parseFloat(bqTotals.swipe_rate) || 0,
      cpi: parseFloat(bqTotals.cpi) || 0,
    };

    // Merge live data for today
    if (liveData) {
      dailyData.push(liveData);
      
      totals.spend += liveData.spend;
      totals.impressions += liveData.impressions;
      totals.swipes += liveData.swipes;
      totals.video_views += liveData.video_views;
      totals.installs += liveData.installs;
      totals.swipe_rate = totals.impressions > 0 ? totals.swipes / totals.impressions : 0;
      totals.cpi = totals.installs > 0 ? totals.spend / totals.installs : 0;
      
      console.log(`Added live data for today: spend=${liveData.spend}, installs=${liveData.installs}`);
    }

    const prevTotals = prevTotalsData[0] || {};

    // Process ad-level data
    const adsData = bqAdsData.map((row: any) => ({
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      spend: parseFloat(row.spend) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.swipes) || 0, // swipes = clicks for Snapchat
      installs: parseInt(row.installs) || 0,
      ctr: parseFloat(row.swipe_rate) || 0,
      cpi: parseFloat(row.cpi) || 0,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          daily: dailyData,
          campaigns: campaignData,
          ads: adsData,
          totals,
          previousTotals: {
            spend: parseFloat(prevTotals.total_spend) || 0,
            impressions: parseInt(prevTotals.total_impressions) || 0,
            swipes: parseInt(prevTotals.total_swipes) || 0,
            video_views: parseInt(prevTotals.total_video_views) || 0,
            installs: parseInt(prevTotals.total_installs) || 0,
            view_completion: parseInt(prevTotals.total_view_completion) || 0,
            swipe_rate: parseFloat(prevTotals.swipe_rate) || 0,
            cpi: parseFloat(prevTotals.cpi) || 0,
          },
          dateRange: { startDate, endDate },
          previousDateRange: { startDate: prevStartStr, endDate: prevEndStr },
          attributionSettings: {
            swipe_up_attribution_window: '7_DAY',
            view_attribution_window: '1_DAY',
            action_report_time: 'impression',
            note: 'Installs are credited to the day the ad was shown, matching Snapchat platform reporting.',
          },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
