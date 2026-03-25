import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get today's date in EST timezone
function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function isWithinLastNDays(dateStr: string, n: number): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  const diffMs = today.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= n && diffDays >= 0;
}

function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
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

function resolveBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  const fullTableId = Deno.env.get("META_BQ_TABLE_ID") ?? "";
  const parts = fullTableId.split(".");

  if (parts.length === 3) {
    return { projectId: parts[0], datasetId: parts[1], tableId: parts[2] };
  } else if (parts.length === 2) {
    return {
      projectId: Deno.env.get("BQ_PROJECT_ID") ?? "",
      datasetId: parts[0],
      tableId: parts[1],
    };
  } else {
    return {
      projectId: Deno.env.get("BQ_PROJECT_ID") ?? "",
      datasetId: Deno.env.get("BQ_DATASET_ID") ?? "",
      tableId: fullTableId,
    };
  }
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

// Fetch live data from Meta API for a specific date at campaign level
async function fetchMetaInsights(date: string): Promise<any[]> {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

  if (!accessToken || !adAccountId) {
    throw new Error("Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID");
  }

  if (!adAccountId.startsWith("act_")) {
    adAccountId = `act_${adAccountId}`;
  }

  const fields = [
    "campaign_id",
    "campaign_name",
    "impressions",
    "clicks",
    "spend",
    "reach",
    "cpm",
    "cpc",
    "ctr",
    "actions",
    "action_values",
  ].join(",");

  const timeRange = JSON.stringify({
    since: date,
    until: date,
  });

  const url = new URL(`https://graph.facebook.com/v19.0/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("action_attribution_windows", '["7d_click","1d_view"]');
  url.searchParams.set("access_token", accessToken);

  console.log(`Fetching live Meta campaign data for date: ${date}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Meta API error:", errorText);
    throw new Error(`Meta API error: ${errorText}`);
  }

  const data = await response.json();
  return data.data || [];
}

// Fetch live ad-level data from Meta API for a specific date
async function fetchMetaAdInsights(date: string): Promise<any[]> {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

  if (!accessToken || !adAccountId) {
    throw new Error("Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID");
  }

  if (!adAccountId.startsWith("act_")) {
    adAccountId = `act_${adAccountId}`;
  }

  const fields = [
    "campaign_id",
    "campaign_name",
    "ad_id",
    "ad_name",
    "impressions",
    "clicks",
    "spend",
    "cpm",
    "cpc",
    "ctr",
    "actions",
    "action_values",
    "video_play_actions",
    "video_avg_time_watched_actions",
  ].join(",");

  const timeRange = JSON.stringify({
    since: date,
    until: date,
  });

  const baseUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights`;
  const params = new URLSearchParams({
    fields,
    time_range: timeRange,
    level: "ad",
    action_attribution_windows: '["7d_click","1d_view"]',
    access_token: accessToken,
    limit: "500",
  });

  console.log(`Fetching live Meta ad-level data for date: ${date}`);

  const allAds: any[] = [];
  let fetchUrl: string | null = `${baseUrl}?${params.toString()}`;
  let pageCount = 0;

  while (fetchUrl) {
    pageCount++;
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Meta API error:", errorText);
      throw new Error(`Meta API error: ${errorText}`);
    }

    const data = await response.json();
    allAds.push(...(data.data || []));
    fetchUrl = data.paging?.next || null;
  }

  console.log(`Fetched ${pageCount} page(s), ${allAds.length} total ads`);
  return allAds;
}

// Fetch video metrics for a date range at ad level (single API call for the whole range)
async function fetchMetaAdVideoMetrics(startDate: string, endDate: string): Promise<Map<string, { video3sViews: number; avgWatchTime: number }>> {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  let adAccountId = Deno.env.get("META_AD_ACCOUNT_ID");

  if (!accessToken || !adAccountId) {
    return new Map();
  }

  if (!adAccountId.startsWith("act_")) {
    adAccountId = `act_${adAccountId}`;
  }

  const fields = "ad_id,ad_name,campaign_name,impressions,video_play_actions,video_avg_time_watched_actions";

  const timeRange = JSON.stringify({ since: startDate, until: endDate });

  const baseUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights`;
  const params = new URLSearchParams({
    fields,
    time_range: timeRange,
    level: "ad",
    filtering: JSON.stringify([{ field: "campaign.name", operator: "CONTAIN", value: "HOURS" }]),
    access_token: accessToken,
    limit: "500",
  });

  console.log(`Fetching video metrics for date range: ${startDate} to ${endDate}`);

  const result = new Map<string, { video3sViews: number; avgWatchTime: number }>();

  try {
    let fetchUrl: string | null = `${baseUrl}?${params.toString()}`;
    let pageCount = 0;

    while (fetchUrl && pageCount < 5) {
      pageCount++;
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        console.error("Video metrics API error:", await response.text());
        break;
      }

      const data = await response.json();
      for (const ad of data.data || []) {
        const campaignName = ad.campaign_name?.toUpperCase() || "";
        if (!campaignName.includes("HOURS") || !campaignName.includes("APP")) continue;

        const adId = ad.ad_id;
        if (!adId) continue;

        let video3sViews = 0;
        let avgWatchTime = 0;

        if (ad.video_play_actions && Array.isArray(ad.video_play_actions)) {
          const playAction = ad.video_play_actions.find((a: any) => a.action_type === "video_view");
          if (playAction) video3sViews = parseInt(playAction.value) || 0;
        }

        if (ad.video_avg_time_watched_actions && Array.isArray(ad.video_avg_time_watched_actions)) {
          const watchAction = ad.video_avg_time_watched_actions.find((a: any) => a.action_type === "video_view");
          if (watchAction) avgWatchTime = parseFloat(watchAction.value) || 0;
        }

        const existing = result.get(adId);
        if (existing) {
          existing.video3sViews += video3sViews;
          // Weighted average for watch time
          existing.avgWatchTime = (existing.avgWatchTime + avgWatchTime) / 2;
        } else {
          result.set(adId, { video3sViews, avgWatchTime });
        }
      }

      fetchUrl = data.paging?.next || null;
    }

    console.log(`Video metrics fetched for ${result.size} ads`);
  } catch (err) {
    console.error("Error fetching video metrics:", err);
  }

  return result;
}

function filterHoursAppCampaigns(campaigns: any[]): any[] {
  return campaigns.filter(
    (c) => {
      const name = c.campaign_name?.toUpperCase() || "";
      return name.includes("HOURS") && name.includes("APP");
    }
  );
}

// Extract action count by type from Meta actions array
function extractActionCount(actions: any[], actionTypes: string[]): number {
  if (!actions || !Array.isArray(actions)) return 0;
  const found = actions.find((a: any) => actionTypes.includes(a.action_type));
  return found ? parseInt(found.value) || 0 : 0;
}

// Extract action value (dollar amount) by type from Meta action_values array
function extractActionValue(actionValues: any[], actionTypes: string[]): number {
  if (!actionValues || !Array.isArray(actionValues)) return 0;
  const found = actionValues.find((a: any) => actionTypes.includes(a.action_type));
  return found ? parseFloat(found.value) || 0 : 0;
}

const REGISTRATION_ACTION_TYPES = [
  'app_custom_event.fb_mobile_complete_registration',
  'complete_registration',
  'fb_mobile_complete_registration',
];

const FTD_ACTION_TYPES = [
  'first_time_deposit',
  'app_custom_event.first_time_deposit',
  'app_custom_event.fb_mobile_add_payment_info',
  'add_payment_info',
  'fb_mobile_add_payment_info',
];

const PURCHASE_ACTION_TYPES = [
  'purchase',
  'app_custom_event.fb_mobile_purchase',
  'fb_mobile_purchase',
  'offsite_conversion.fb_pixel_purchase',
];

// Transform live Meta data to match BigQuery format
function transformLiveData(liveData: any[], date: string): {
  daily: any;
  campaigns: any[];
} {
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalReach = 0;
  let totalInstalls = 0;
  let totalRegistrations = 0;
  let totalFtds = 0;
  let totalTrades = 0;
  let totalFtdValue = 0;
  let totalTradeValue = 0;

  const campaigns = liveData.map((row) => {
    const spend = parseFloat(row.spend) || 0;
    const impressions = parseInt(row.impressions) || 0;
    const clicks = parseInt(row.clicks) || 0;
    const reach = parseInt(row.reach) || 0;
    
    const installs = extractActionCount(row.actions, ['mobile_app_install']);
    const registrations = extractActionCount(row.actions, REGISTRATION_ACTION_TYPES);
    const ftds = extractActionCount(row.actions, FTD_ACTION_TYPES);
    const trades = extractActionCount(row.actions, PURCHASE_ACTION_TYPES);
    const ftdValue = extractActionValue(row.action_values, FTD_ACTION_TYPES);
    const tradeValue = extractActionValue(row.action_values, PURCHASE_ACTION_TYPES);

    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalReach += reach;
    totalInstalls += installs;
    totalRegistrations += registrations;
    totalFtds += ftds;
    totalTrades += trades;
    totalFtdValue += ftdValue;
    totalTradeValue += tradeValue;

    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend,
      impressions,
      clicks,
      reach,
      cpm: parseFloat(row.cpm) || 0,
      cpc: parseFloat(row.cpc) || 0,
      ctr: parseFloat(row.ctr) || 0,
      installs,
      cpi: installs > 0 ? spend / installs : 0,
      registrations,
      ftds,
      trades,
      ftdValue,
      tradeValue,
    };
  });

  const daily = {
    date,
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    reach: totalReach,
    cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    installs: totalInstalls,
    cpi: totalInstalls > 0 ? totalSpend / totalInstalls : 0,
    registrations: totalRegistrations,
    ftds: totalFtds,
    trades: totalTrades,
    ftdValue: totalFtdValue,
    tradeValue: totalTradeValue,
  };

  return { daily, campaigns };
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
    
    // Determine BigQuery date range (exclude today if present)
    const bqEndDate = includestoday ? 
      new Date(new Date(today).getTime() - 86400000).toISOString().split("T")[0] : 
      endDate;
    const shouldQueryBigQuery = startDate <= bqEndDate;

    console.log(`Query range: ${startDate} to ${endDate}, today: ${today}, includestoday: ${includestoday}`);

    const googleAccessToken = await getGoogleAccessToken();
    const { projectId, datasetId, tableId } = resolveBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

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

    const campaignFilter = campaignId ? `AND campaign_id = '${campaignId}'` : "";

    // Build queries - only include HOURS APP campaigns
    const hoursAppFilter = "AND (UPPER(campaign_name) LIKE '%HOURS%' AND UPPER(campaign_name) LIKE '%APP%')";
    
    const dailyQuery = shouldQueryBigQuery ? `
      SELECT 
        DATE(timestamp) as date,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(reach) as reach,
        AVG(cpm) as cpm,
        AVG(cpc) as cpc,
        AVG(ctr) as ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as installs,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('app_custom_event.fb_mobile_complete_registration', 'complete_registration', 'fb_mobile_complete_registration')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as registrations,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as ftds,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as trades,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as ftd_value,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as trade_value
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${hoursAppFilter}
      ${campaignFilter}
      GROUP BY date
      ORDER BY date
    ` : null;

    const campaignQuery = shouldQueryBigQuery ? `
      SELECT 
        campaign_id,
        campaign_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(reach) as reach,
        AVG(cpm) as cpm,
        AVG(cpc) as cpc,
        AVG(ctr) as ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as installs
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${hoursAppFilter}
      GROUP BY campaign_id, campaign_name
      ORDER BY spend DESC
    ` : null;

    const totalsQuery = shouldQueryBigQuery ? `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(reach) as total_reach,
        AVG(cpm) as avg_cpm,
        AVG(cpc) as avg_cpc,
        AVG(ctr) as avg_ctr,
        SAFE_DIVIDE(SUM(clicks), SUM(impressions)) as calculated_ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_installs,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('app_custom_event.fb_mobile_complete_registration', 'complete_registration', 'fb_mobile_complete_registration')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_registrations,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_ftds,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_trades,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as total_ftd_value,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as total_trade_value
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${hoursAppFilter}
      ${campaignFilter}
    ` : null;

    // Query for ad-level data with adset breakdown (no limit)
    const adsQuery = shouldQueryBigQuery ? `
      SELECT 
        ad_id,
        ad_name,
        adset_id,
        adset_name,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SAFE_DIVIDE(SUM(clicks), SUM(impressions)) as ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as installs,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('app_custom_event.fb_mobile_complete_registration', 'complete_registration', 'fb_mobile_complete_registration')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as registrations,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('first_time_deposit', 'app_custom_event.first_time_deposit', 'app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as ftds,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as trades,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('first_time_deposit', 'app_custom_event.first_time_deposit', 'app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as ftd_value,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as trade_value,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'video_view'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as video_3s_views
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${bqEndDate}'
      ${hoursAppFilter}
      AND ad_id IS NOT NULL AND ad_id != ''
      GROUP BY ad_id, ad_name, adset_id, adset_name
      ORDER BY spend DESC
    ` : null;

    const prevTotalsQuery = `
      SELECT 
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(reach) as total_reach,
        AVG(cpm) as avg_cpm,
        AVG(cpc) as avg_cpc,
        AVG(ctr) as avg_ctr,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') = 'mobile_app_install'
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_installs,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('app_custom_event.fb_mobile_complete_registration', 'complete_registration', 'fb_mobile_complete_registration')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_registrations,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_ftds,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(action, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(actions)) AS action 
               WHERE JSON_EXTRACT_SCALAR(action, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS INT64
            ), 0
          )
        ) as total_trades,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('app_custom_event.fb_mobile_add_payment_info', 'add_payment_info', 'fb_mobile_add_payment_info')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as total_ftd_value,
        SUM(
          IFNULL(
            CAST(
              (SELECT JSON_EXTRACT_SCALAR(av, '$.value') 
               FROM UNNEST(JSON_EXTRACT_ARRAY(action_values)) AS av 
               WHERE JSON_EXTRACT_SCALAR(av, '$.action_type') IN ('purchase', 'app_custom_event.fb_mobile_purchase', 'fb_mobile_purchase', 'offsite_conversion.fb_pixel_purchase')
               LIMIT 1) AS FLOAT64
            ), 0
          )
        ) as total_trade_value
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
      ${hoursAppFilter}
      ${campaignFilter}
    `;

    // Query to check which dates have data in BigQuery for previous period
    const prevDatesQuery = `
      SELECT DISTINCT DATE(timestamp) as date
      FROM ${fullTable}
      WHERE DATE(timestamp) BETWEEN '${prevStartStr}' AND '${prevEndStr}'
      ${hoursAppFilter}
    `;

    // Execute critical queries in parallel (excluding ads query which may fail if schema is outdated)
    const promises: Promise<any>[] = [];

    if (shouldQueryBigQuery) {
      promises.push(
        queryBigQuery(dailyQuery!, googleAccessToken),
        queryBigQuery(campaignQuery!, googleAccessToken),
        queryBigQuery(totalsQuery!, googleAccessToken)
      );
    } else {
      promises.push(
        Promise.resolve([]),
        Promise.resolve([]),
        Promise.resolve([])
      );
    }

    promises.push(queryBigQuery(prevTotalsQuery, googleAccessToken));
    promises.push(queryBigQuery(prevDatesQuery, googleAccessToken));

    // Fetch live campaign + ad-level data for today if needed
    if (includestoday) {
      promises.push(fetchMetaInsights(today), fetchMetaAdInsights(today));
    } else {
      promises.push(Promise.resolve([]), Promise.resolve([]));
    }

    let [bqDailyData, bqCampaignData, bqTotalsData, prevTotalsData, prevDatesData, liveData, liveAdData] = await Promise.all(promises);

    // Try ads query separately - non-blocking if schema doesn't support ad_id/ad_name yet
    let bqAdsData: any[] = [];
    if (shouldQueryBigQuery && adsQuery) {
      try {
        bqAdsData = await queryBigQuery(adsQuery, googleAccessToken);
        console.log(`Ads query returned ${bqAdsData.length} results`);
      } catch (adsError: any) {
        console.warn("Ads query failed (columns may not exist yet):", adsError.message);
        // Continue without ads data - the creative grid will just be empty
      }
    }

    const mergeLiveAdsIntoBq = (ads: any[]) => {
      for (const ad of ads) {
        const adId = ad.ad_id || ad.ad_name;
        if (!adId || !ad.ad_name) continue;

        const spend = parseFloat(ad.spend) || 0;
        const impressions = parseInt(ad.impressions) || 0;
        const clicks = parseInt(ad.clicks) || 0;

        // Extract metrics from actions array
        let installs = 0;
        let registrations = 0;
        let ftds = 0;
        let trades = 0;
        let ftdValue = 0;
        let tradeValue = 0;
        let video3sViews = 0;
        let avgWatchTime = 0;
        if (ad.actions && Array.isArray(ad.actions)) {
          const installAction = ad.actions.find((a: any) => a.action_type === "mobile_app_install");
          if (installAction) {
            installs = parseInt(installAction.value) || 0;
          }
          registrations = extractActionCount(ad.actions, REGISTRATION_ACTION_TYPES);
          ftds = extractActionCount(ad.actions, FTD_ACTION_TYPES);
          trades = extractActionCount(ad.actions, PURCHASE_ACTION_TYPES);
          // 3-sec video views
          const videoViewAction = ad.actions.find((a: any) => a.action_type === "video_view");
          if (videoViewAction) {
            video3sViews = parseInt(videoViewAction.value) || 0;
          }
        }
        if (ad.action_values && Array.isArray(ad.action_values)) {
          ftdValue = extractActionValue(ad.action_values, FTD_ACTION_TYPES);
          tradeValue = extractActionValue(ad.action_values, PURCHASE_ACTION_TYPES);
        }
        // Extract video avg watch time from video_avg_time_watched_actions
        if (ad.video_avg_time_watched_actions && Array.isArray(ad.video_avg_time_watched_actions)) {
          const totalAction = ad.video_avg_time_watched_actions.find((a: any) => a.action_type === "video_view");
          if (totalAction) {
            avgWatchTime = parseFloat(totalAction.value) || 0;
          }
        }
        // Also try video_play_actions for 3s views if not found in actions
        if (video3sViews === 0 && ad.video_play_actions && Array.isArray(ad.video_play_actions)) {
          const playAction = ad.video_play_actions.find((a: any) => a.action_type === "video_view");
          if (playAction) {
            video3sViews = parseInt(playAction.value) || 0;
          }
        }

        const existing = bqAdsData.find((a: any) => a.ad_id === adId);
        if (existing) {
          existing.spend = (parseFloat(existing.spend) || 0) + spend;
          existing.impressions = (parseInt(existing.impressions) || 0) + impressions;
          existing.clicks = (parseInt(existing.clicks) || 0) + clicks;
          existing.installs = (parseInt(existing.installs) || 0) + installs;
          existing.registrations = (parseInt(existing.registrations) || 0) + registrations;
          existing.ftds = (parseInt(existing.ftds) || 0) + ftds;
          existing.trades = (parseInt(existing.trades) || 0) + trades;
          existing.ftd_value = (parseFloat(existing.ftd_value) || 0) + ftdValue;
          existing.trade_value = (parseFloat(existing.trade_value) || 0) + tradeValue;
          existing.video_3s_views = (parseInt(existing.video_3s_views) || 0) + video3sViews;
          // Avg watch time: weighted average by impressions
          const prevImps = existing.impressions - impressions;
          if (prevImps > 0 && impressions > 0) {
            existing.avg_watch_time = ((existing.avg_watch_time || 0) * prevImps + avgWatchTime * impressions) / existing.impressions;
          } else {
            existing.avg_watch_time = avgWatchTime || existing.avg_watch_time || 0;
          }
          existing.ctr = existing.impressions > 0 ? existing.clicks / existing.impressions : 0;
          existing.cpi = existing.installs > 0 ? existing.spend / existing.installs : 0;
        } else {
          const ctr = impressions > 0 ? clicks / impressions : 0;
          const cpi = installs > 0 ? spend / installs : 0;
          bqAdsData.push({
            ad_id: adId,
            ad_name: ad.ad_name,
            spend,
            impressions,
            clicks,
            ctr,
            installs,
            cpi,
            registrations,
            ftds,
            trades,
            ftd_value: ftdValue,
            trade_value: tradeValue,
            video_3s_views: video3sViews,
            avg_watch_time: avgWatchTime,
          });
        }
      }
    };

    // Check if BigQuery is missing previous period data - fall back to live API
    const prevRequestedDates = getDatesBetween(prevStartStr, prevEndStr);
    const prevBqDatesFound = new Set((prevDatesData || []).map((row: any) => row.date?.split("T")[0] || row.date));
    const prevMissingDates = prevRequestedDates.filter(d => !prevBqDatesFound.has(d));

    if (prevMissingDates.length > 0) {
      console.log(`BigQuery missing previous period data for ${prevMissingDates.length} dates: ${prevMissingDates.join(", ")}. Fetching from live API...`);

      // Fetch missing previous dates from live Meta API
      const prevMissingDataPromises = prevMissingDates.map(async (date) => {
        try {
          const rawLiveData = await fetchMetaInsights(date);
          const liveDayData = filterHoursAppCampaigns(rawLiveData);
          console.log(`Previous period live fallback for ${date}: filtered to ${liveDayData.length} HOURS APP from ${rawLiveData.length} total`);
          return { date, data: liveDayData };
        } catch (err) {
          console.error(`Failed to fetch live data for previous period ${date}:`, err);
          return { date, data: [] };
        }
      });

      const prevMissingResults = await Promise.all(prevMissingDataPromises);

      // Aggregate the previous period live data into totals
      for (const { date, data } of prevMissingResults) {
        if (data.length > 0) {
          const transformed = transformLiveData(data, date);

          // Initialize prevTotalsData if empty
          if (!prevTotalsData[0]) {
            prevTotalsData[0] = {
              total_spend: 0,
              total_impressions: 0,
              total_clicks: 0,
              total_reach: 0,
              total_installs: 0,
              total_registrations: 0,
              total_ftds: 0,
              total_trades: 0,
              total_ftd_value: 0,
              total_trade_value: 0,
              avg_cpm: 0,
              avg_cpc: 0,
              avg_ctr: 0,
            };
          }

          prevTotalsData[0].total_spend = (parseFloat(prevTotalsData[0].total_spend) || 0) + transformed.daily.spend;
          prevTotalsData[0].total_impressions = (parseInt(prevTotalsData[0].total_impressions) || 0) + transformed.daily.impressions;
          prevTotalsData[0].total_clicks = (parseInt(prevTotalsData[0].total_clicks) || 0) + transformed.daily.clicks;
          prevTotalsData[0].total_reach = (parseInt(prevTotalsData[0].total_reach) || 0) + transformed.daily.reach;
          prevTotalsData[0].total_installs = (parseInt(prevTotalsData[0].total_installs) || 0) + transformed.daily.installs;
          prevTotalsData[0].total_registrations = (parseInt(prevTotalsData[0].total_registrations) || 0) + transformed.daily.registrations;
          prevTotalsData[0].total_ftds = (parseInt(prevTotalsData[0].total_ftds) || 0) + transformed.daily.ftds;
          prevTotalsData[0].total_trades = (parseInt(prevTotalsData[0].total_trades) || 0) + transformed.daily.trades;
          prevTotalsData[0].total_ftd_value = (parseFloat(prevTotalsData[0].total_ftd_value) || 0) + transformed.daily.ftdValue;
          prevTotalsData[0].total_trade_value = (parseFloat(prevTotalsData[0].total_trade_value) || 0) + transformed.daily.tradeValue;

          console.log(`Added previous period live data for ${date}: spend=${transformed.daily.spend}, installs=${transformed.daily.installs}`);
        }
      }
    }

    // Check if BigQuery returned no data (or suspicious all-zero data) for recent dates - fall back to live API
    const requestedDates = getDatesBetween(startDate, bqEndDate);
    const normalizeDate = (value: string) => value?.split("T")[0] || value;

    const bqDailyByDate = new Map<string, any>();
    for (const row of bqDailyData) {
      const dateKey = normalizeDate(row.date);
      if (!dateKey) continue;

      const existing = bqDailyByDate.get(dateKey);
      if (!existing) {
        bqDailyByDate.set(dateKey, {
          spend: parseFloat(row.spend) || 0,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.clicks) || 0,
          installs: parseInt(row.installs) || 0,
          registrations: parseInt(row.registrations) || 0,
          ftds: parseInt(row.ftds) || 0,
          trades: parseInt(row.trades) || 0,
        });
      } else {
        existing.spend += parseFloat(row.spend) || 0;
        existing.impressions += parseInt(row.impressions) || 0;
        existing.clicks += parseInt(row.clicks) || 0;
        existing.installs += parseInt(row.installs) || 0;
        existing.registrations += parseInt(row.registrations) || 0;
        existing.ftds += parseInt(row.ftds) || 0;
        existing.trades += parseInt(row.trades) || 0;
      }
    }

    const bqDatesFound = new Set(Array.from(bqDailyByDate.keys()));
    const missingDates = requestedDates.filter((d) => !bqDatesFound.has(d) && isWithinLastNDays(d, 7));
    const staleZeroDates = requestedDates.filter((d) => {
      if (!bqDatesFound.has(d) || !isWithinLastNDays(d, 7)) return false;
      const row = bqDailyByDate.get(d);
      if (!row) return false;
      return (
        row.spend === 0 &&
        row.impressions === 0 &&
        row.clicks === 0 &&
        row.installs === 0 &&
        row.registrations === 0 &&
        row.ftds === 0 &&
        row.trades === 0
      );
    });

    const fallbackDates = Array.from(new Set([...missingDates, ...staleZeroDates]));

    if (fallbackDates.length > 0 && shouldQueryBigQuery) {
      console.log(
        `BigQuery fallback needed for ${fallbackDates.length} recent dates: ${fallbackDates.join(", ")} (missing: ${missingDates.length}, zero: ${staleZeroDates.length})`
      );

      // Fetch fallback dates from live Meta API (campaign-level for totals)
      const missingDataPromises = fallbackDates.map(async (date) => {
        try {
          const rawLiveData = await fetchMetaInsights(date);
          const liveDayData = filterHoursAppCampaigns(rawLiveData);
          console.log(`Live fallback for ${date}: filtered to ${liveDayData.length} HOURS APP from ${rawLiveData.length} total`);
          return { date, data: liveDayData };
        } catch (err) {
          console.error(`Failed to fetch live data for ${date}:`, err);
          return { date, data: [] };
        }
      });

      // Also fetch ad-level data for creatives
      const missingAdDataPromises = fallbackDates.map(async (date) => {
        try {
          const rawAdData = await fetchMetaAdInsights(date);
          const filteredAdData = filterHoursAppCampaigns(rawAdData);
          console.log(`Live ad fallback for ${date}: filtered to ${filteredAdData.length} ads from ${rawAdData.length} total`);
          return { data: filteredAdData };
        } catch (err) {
          console.error(`Failed to fetch live ad data for ${date}:`, err);
          return { data: [] };
        }
      });

      const [missingResults, missingAdResults] = await Promise.all([
        Promise.all(missingDataPromises),
        Promise.all(missingAdDataPromises),
      ]);

      // Transform and merge missing campaign data
      for (const { date, data } of missingResults) {
        if (data.length > 0) {
          const transformed = transformLiveData(data, date);

          // Upsert into daily data
          const fallbackDailyRow = {
            date,
            spend: transformed.daily.spend,
            impressions: transformed.daily.impressions,
            clicks: transformed.daily.clicks,
            reach: transformed.daily.reach,
            cpm: transformed.daily.cpm,
            cpc: transformed.daily.cpc,
            ctr: transformed.daily.ctr,
            installs: transformed.daily.installs,
            registrations: transformed.daily.registrations,
            ftds: transformed.daily.ftds,
            trades: transformed.daily.trades,
            ftd_value: transformed.daily.ftdValue,
            trade_value: transformed.daily.tradeValue,
          };

          const existingDailyIdx = bqDailyData.findIndex(
            (row: any) => (row.date?.split("T")[0] || row.date) === date
          );

          if (existingDailyIdx >= 0) {
            bqDailyData[existingDailyIdx] = fallbackDailyRow;
          } else {
            bqDailyData.push(fallbackDailyRow);
          }

          // Add to campaign data
          for (const camp of transformed.campaigns) {
            const existing = bqCampaignData.find((c: any) => c.campaign_id === camp.campaign_id);
            if (existing) {
              existing.spend = (parseFloat(existing.spend) || 0) + camp.spend;
              existing.impressions = (parseInt(existing.impressions) || 0) + camp.impressions;
              existing.clicks = (parseInt(existing.clicks) || 0) + camp.clicks;
              existing.reach = (parseInt(existing.reach) || 0) + camp.reach;
              existing.installs = (parseInt(existing.installs) || 0) + camp.installs;
            } else {
              bqCampaignData.push({
                campaign_id: camp.campaign_id,
                campaign_name: camp.campaign_name,
                spend: camp.spend,
                impressions: camp.impressions,
                clicks: camp.clicks,
                reach: camp.reach,
                cpm: camp.cpm,
                cpc: camp.cpc,
                ctr: camp.ctr,
                installs: camp.installs,
              });
            }
          }

          // Update totals
          if (!bqTotalsData[0]) {
            bqTotalsData[0] = {
              total_spend: 0,
              total_impressions: 0,
              total_clicks: 0,
              total_reach: 0,
              total_installs: 0,
              total_registrations: 0,
              total_ftds: 0,
              total_trades: 0,
              total_ftd_value: 0,
              total_trade_value: 0,
            };
          }
          bqTotalsData[0].total_spend = (parseFloat(bqTotalsData[0].total_spend) || 0) + transformed.daily.spend;
          bqTotalsData[0].total_impressions = (parseInt(bqTotalsData[0].total_impressions) || 0) + transformed.daily.impressions;
          bqTotalsData[0].total_clicks = (parseInt(bqTotalsData[0].total_clicks) || 0) + transformed.daily.clicks;
          bqTotalsData[0].total_reach = (parseInt(bqTotalsData[0].total_reach) || 0) + transformed.daily.reach;
          bqTotalsData[0].total_installs = (parseInt(bqTotalsData[0].total_installs) || 0) + transformed.daily.installs;
          bqTotalsData[0].total_registrations = (parseInt(bqTotalsData[0].total_registrations) || 0) + transformed.daily.registrations;
          bqTotalsData[0].total_ftds = (parseInt(bqTotalsData[0].total_ftds) || 0) + transformed.daily.ftds;
          bqTotalsData[0].total_trades = (parseInt(bqTotalsData[0].total_trades) || 0) + transformed.daily.trades;
          bqTotalsData[0].total_ftd_value = (parseFloat(bqTotalsData[0].total_ftd_value) || 0) + transformed.daily.ftdValue;
          bqTotalsData[0].total_trade_value = (parseFloat(bqTotalsData[0].total_trade_value) || 0) + transformed.daily.tradeValue;

          console.log(`Added live fallback data for ${date}: spend=${transformed.daily.spend}, installs=${transformed.daily.installs}`);
        }
      }

      for (const { data } of missingAdResults) {
        mergeLiveAdsIntoBq(data);
      }

      console.log(`Live ad fallback aggregated ${bqAdsData.length} unique ads`);
    }

    if (includestoday) {
      const filteredTodayAds = filterHoursAppCampaigns(liveAdData || []);
      console.log(`Live today ad merge: filtered to ${filteredTodayAds.length} ads from ${(liveAdData || []).length} total`);
      mergeLiveAdsIntoBq(filteredTodayAds);
    }

    // Process BigQuery data
    let dailyData = bqDailyData.map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      const installs = parseInt(row.installs) || 0;
      const registrations = parseInt(row.registrations) || 0;
      const ftds = parseInt(row.ftds) || 0;
      return {
        date: row.date?.split("T")[0] || row.date,
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        reach: parseInt(row.reach) || 0,
        cpm: parseFloat(row.cpm) || 0,
        cpc: parseFloat(row.cpc) || 0,
        ctr: parseFloat(row.ctr) || 0,
        installs,
        cpi: installs > 0 ? spend / installs : 0,
        registrations,
        ftds,
        trades: parseInt(row.trades) || 0,
        ftdValue: parseFloat(row.ftd_value) || 0,
        tradeValue: parseFloat(row.trade_value) || 0,
      };
    });

    let campaignData = bqCampaignData.map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      const installs = parseInt(row.installs) || 0;
      return {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        spend,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.clicks) || 0,
        reach: parseInt(row.reach) || 0,
        cpm: parseFloat(row.cpm) || 0,
        cpc: parseFloat(row.cpc) || 0,
        ctr: parseFloat(row.ctr) || 0,
        installs,
        cpi: installs > 0 ? spend / installs : 0,
      };
    });

    const bqTotals = bqTotalsData[0] || {};
    let totals = {
      spend: parseFloat(bqTotals.total_spend) || 0,
      impressions: parseInt(bqTotals.total_impressions) || 0,
      clicks: parseInt(bqTotals.total_clicks) || 0,
      reach: parseInt(bqTotals.total_reach) || 0,
      cpm: parseFloat(bqTotals.avg_cpm) || 0,
      cpc: parseFloat(bqTotals.avg_cpc) || 0,
      ctr: parseFloat(bqTotals.calculated_ctr) || 0,
      installs: parseInt(bqTotals.total_installs) || 0,
      registrations: parseInt(bqTotals.total_registrations) || 0,
      ftds: parseInt(bqTotals.total_ftds) || 0,
      trades: parseInt(bqTotals.total_trades) || 0,
      ftdValue: parseFloat(bqTotals.total_ftd_value) || 0,
      tradeValue: parseFloat(bqTotals.total_trade_value) || 0,
      cpi: 0,
    };
    totals.cpi = totals.installs > 0 ? totals.spend / totals.installs : 0;

    // Merge live data for today (filter to HOURS APP campaigns)
    const filteredLiveData = filterHoursAppCampaigns(liveData);
    if (includestoday && filteredLiveData.length > 0) {
      console.log(`Live today: filtered to ${filteredLiveData.length} HOURS APP from ${liveData.length} total`);
      const liveTransformed = transformLiveData(filteredLiveData, today);
      
      // Add today's daily data
      dailyData.push(liveTransformed.daily);
      
      // Merge campaign data
      for (const liveCampaign of liveTransformed.campaigns) {
        const existing = campaignData.find((c: any) => c.campaign_id === liveCampaign.campaign_id);
        if (existing) {
          existing.spend += liveCampaign.spend;
          existing.impressions += liveCampaign.impressions;
          existing.clicks += liveCampaign.clicks;
          existing.reach += liveCampaign.reach;
          existing.installs += liveCampaign.installs;
          existing.cpi = existing.installs > 0 ? existing.spend / existing.installs : 0;
        } else {
          campaignData.push(liveCampaign);
        }
      }
      
      // Update totals
      totals.spend += liveTransformed.daily.spend;
      totals.impressions += liveTransformed.daily.impressions;
      totals.clicks += liveTransformed.daily.clicks;
      totals.reach += liveTransformed.daily.reach;
      totals.installs += liveTransformed.daily.installs;
      totals.registrations += liveTransformed.daily.registrations;
      totals.ftds += liveTransformed.daily.ftds;
      totals.trades += liveTransformed.daily.trades;
      totals.ftdValue += liveTransformed.daily.ftdValue;
      totals.tradeValue += liveTransformed.daily.tradeValue;
      totals.cpi = totals.installs > 0 ? totals.spend / totals.installs : 0;
      totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
      totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
      totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
      
      console.log(`Added live data for today: spend=${liveTransformed.daily.spend}, installs=${liveTransformed.daily.installs}`);
    }

    // Sort daily data by date
    dailyData.sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));

    // Sort campaign data by spend desc
    campaignData.sort((a: any, b: any) => b.spend - a.spend);

    // Fetch video metrics from live Meta API (BQ doesn't store video_play_actions)
    let videoMetricsMap = new Map<string, { video3sViews: number; avgWatchTime: number }>();
    try {
      videoMetricsMap = await fetchMetaAdVideoMetrics(startDate, endDate);
    } catch (err) {
      console.warn("Failed to fetch video metrics, continuing without them:", err);
    }

    // Process ads data
    const adsData = (bqAdsData || []).map((row: any) => {
      const spend = parseFloat(row.spend) || 0;
      const impressions = parseInt(row.impressions) || 0;
      const installs = parseInt(row.installs) || 0;
      const registrations = parseInt(row.registrations) || 0;
      const ftds = parseInt(row.ftds) || 0;
      const trades = parseInt(row.trades) || 0;
      const ftdValue = parseFloat(row.ftd_value) || 0;
      const tradeValue = parseFloat(row.trade_value) || 0;
      // Use live video metrics, falling back to BQ data
      const videoMetrics = videoMetricsMap.get(row.ad_id);
      const video3sViews = videoMetrics?.video3sViews || parseInt(row.video_3s_views) || 0;
      const avgWatchTime = videoMetrics?.avgWatchTime || parseFloat(row.avg_watch_time) || 0;
      const thumbstopRate = impressions > 0 ? video3sViews / impressions : 0;
      return {
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        spend,
        impressions,
        clicks: parseInt(row.clicks) || 0,
        ctr: parseFloat(row.ctr) || 0,
        installs,
        cpi: installs > 0 ? spend / installs : 0,
        registrations,
        ftds,
        trades,
        ftdValue,
        tradeValue,
        cps: registrations > 0 ? spend / registrations : 0,
        cftd: ftds > 0 ? spend / ftds : 0,
        video3sViews,
        avgWatchTime,
        thumbstopRate,
      };
    });

    const prevTotals = prevTotalsData[0] || {};

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
            clicks: parseInt(prevTotals.total_clicks) || 0,
            reach: parseInt(prevTotals.total_reach) || 0,
            cpm: parseFloat(prevTotals.avg_cpm) || 0,
            cpc: parseFloat(prevTotals.avg_cpc) || 0,
            ctr: parseFloat(prevTotals.avg_ctr) || 0,
            installs: parseInt(prevTotals.total_installs) || 0,
            registrations: parseInt(prevTotals.total_registrations) || 0,
            ftds: parseInt(prevTotals.total_ftds) || 0,
            trades: parseInt(prevTotals.total_trades) || 0,
            cpi: parseInt(prevTotals.total_installs) > 0 ? parseFloat(prevTotals.total_spend) / parseInt(prevTotals.total_installs) : 0,
          },
          dateRange: { startDate, endDate },
          previousDateRange: { startDate: prevStartStr, endDate: prevEndStr },
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
