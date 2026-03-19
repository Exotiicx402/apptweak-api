 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
// ============ CREATIVE NAMING PARSER ============
 interface ParsedCreativeName {
   page: string;
   product: string;
   assetType: string;
   conceptId: string;
   uniqueIdentifier: string;
   category: string;
   angle: string;
   tactic: string;
   hook: string;
   contentType: string;
   language: string;
   creativeOwner: string;
   objective: string;
   landingPage: string;
   launchDate: string;
 }
 
 function parseCreativeName(adName: string): ParsedCreativeName {
   const parts = adName.split(' | ').map((part) => part.trim());
   return {
     page: parts[0] || '',
     product: parts[1] || '',
     assetType: parts[2] || '',
     conceptId: parts[3] || '',
     uniqueIdentifier: parts[4] || '',
     category: parts[5] || '',
     angle: parts[6] || '',
     tactic: parts[7] || '',
     hook: parts[8] || '',
     contentType: parts[9] || '',
     language: parts[10] || '',
     creativeOwner: parts[11] || '',
     objective: parts[12] || '',
     landingPage: parts[13] || '',
     launchDate: parts[14] || '',
   };
 }
 
 // ============ BIGQUERY HELPERS ============
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
 
 function resolveBigQueryTarget(tableEnvVar: string): { projectId: string; datasetId: string; tableId: string } {
   const rawProjectId = Deno.env.get("BQ_PROJECT_ID")?.trim();
   const rawDatasetId = Deno.env.get("BQ_DATASET_ID")?.trim();
   const rawTableId = Deno.env.get(tableEnvVar)?.trim();
 
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
 
 async function queryBigQuery(query: string, accessToken: string, projectId: string): Promise<any[]> {
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
         timeoutMs: 60000,
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
 
 // ============ PLATFORM QUERY FUNCTIONS ============
 interface AdMetric {
   ad_name: string;
   spend: number;
   impressions: number;
   clicks: number;
   installs: number;
   ctr: number;
   cpi: number;
   platform: string;
 }
 
 async function fetchMetaAds(startDate: string, endDate: string, accessToken: string): Promise<AdMetric[]> {
   const { projectId, datasetId, tableId } = resolveBigQueryTarget("META_BQ_TABLE_ID");
   if (!tableId) return [];
   
   const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;
   const appInstallsFilter = "AND UPPER(campaign_name) LIKE '%APP INSTALLS%'";
   
   const query = `
     SELECT 
       ad_name,
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
       ) as installs
     FROM ${fullTable}
     WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
     ${appInstallsFilter}
     AND ad_name IS NOT NULL AND ad_name != ''
     GROUP BY ad_name
     ORDER BY spend DESC
   `;
 
   try {
     const rows = await queryBigQuery(query, accessToken, projectId);
     return rows.map(row => {
       const spend = parseFloat(row.spend) || 0;
       const installs = parseInt(row.installs) || 0;
       return {
         ad_name: row.ad_name,
         spend,
         impressions: parseInt(row.impressions) || 0,
         clicks: parseInt(row.clicks) || 0,
         installs,
         ctr: parseFloat(row.ctr) || 0,
         cpi: installs > 0 ? spend / installs : 0,
         platform: "meta",
       };
     });
   } catch (err) {
     console.error("Meta query failed:", err);
     return [];
   }
 }
 
 async function fetchSnapchatAds(startDate: string, endDate: string, accessToken: string): Promise<AdMetric[]> {
   const { projectId, datasetId, tableId } = resolveBigQueryTarget("SNAPCHAT_BQ_TABLE_ID");
   if (!tableId) return [];
   
   const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;
   
   const query = `
     SELECT 
       ad_name,
       SUM(spend) as spend,
       SUM(impressions) as impressions,
       SUM(swipes) as clicks,
       SUM(total_installs) as installs,
       SAFE_DIVIDE(SUM(swipes), NULLIF(SUM(impressions), 0)) as ctr,
       SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_installs), 0)) as cpi
     FROM ${fullTable}
     WHERE DATE(timestamp) BETWEEN '${startDate}' AND '${endDate}'
     AND ad_name IS NOT NULL AND ad_name != ''
     GROUP BY ad_name
     ORDER BY spend DESC
   `;
 
   try {
     const rows = await queryBigQuery(query, accessToken, projectId);
     return rows.map(row => ({
       ad_name: row.ad_name,
       spend: parseFloat(row.spend) || 0,
       impressions: parseInt(row.impressions) || 0,
       clicks: parseInt(row.clicks) || 0,
       installs: parseInt(row.installs) || 0,
       ctr: parseFloat(row.ctr) || 0,
       cpi: parseFloat(row.cpi) || 0,
       platform: "snapchat",
     }));
   } catch (err) {
     console.error("Snapchat query failed:", err);
     return [];
   }
 }
 
 async function fetchTikTokAds(startDate: string, endDate: string, accessToken: string): Promise<AdMetric[]> {
   const { projectId, datasetId, tableId } = resolveBigQueryTarget("TIKTOK_BQ_TABLE_ID");
   if (!tableId) return [];
   
   const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;
   
   const query = `
     SELECT 
       ad_name,
       SUM(spend) as spend,
       SUM(impressions) as impressions,
       SUM(clicks) as clicks,
       SUM(conversions) as installs,
       SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) as ctr,
       SAFE_DIVIDE(SUM(spend), NULLIF(SUM(conversions), 0)) as cpi
     FROM ${fullTable}
     WHERE date BETWEEN '${startDate}' AND '${endDate}'
     AND ad_name IS NOT NULL AND ad_name != ''
     GROUP BY ad_name
     ORDER BY spend DESC
   `;
 
   try {
     const rows = await queryBigQuery(query, accessToken, projectId);
     return rows.map(row => ({
       ad_name: row.ad_name,
       spend: parseFloat(row.spend) || 0,
       impressions: parseInt(row.impressions) || 0,
       clicks: parseInt(row.clicks) || 0,
       installs: parseFloat(row.installs) || 0,
       ctr: parseFloat(row.ctr) || 0,
       cpi: parseFloat(row.cpi) || 0,
       platform: "tiktok",
     }));
   } catch (err) {
     console.error("TikTok query failed:", err);
     return [];
   }
 }
 
 async function fetchGoogleAds(startDate: string, endDate: string, accessToken: string): Promise<AdMetric[]> {
   const { projectId, datasetId, tableId } = resolveBigQueryTarget("GOOGLE_ADS_BQ_TABLE_ID");
   if (!tableId) return [];
   
   const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;
   
    const query = `
      WITH deduped AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY date, campaign, ad_group_name ORDER BY spend DESC) as rn
        FROM ${fullTable}
        WHERE date BETWEEN '${startDate}' AND '${endDate}'
        AND ad_group_name IS NOT NULL AND ad_group_name != ''
      )
      SELECT 
        ad_group_name as ad_name,
        SUM(CAST(spend AS FLOAT64)) as spend,
        CAST(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000 AS INT64) as impressions,
        SUM(CAST(clicks AS INT64)) as clicks,
        SUM(CAST(conversions AS FLOAT64)) as installs,
        SAFE_DIVIDE(SUM(CAST(clicks AS FLOAT64)), NULLIF(SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(average_cpm AS FLOAT64)), 0)) * 1000, 0)) as ctr,
        SAFE_DIVIDE(SUM(CAST(spend AS FLOAT64)), NULLIF(SUM(CAST(conversions AS FLOAT64)), 0)) as cpi
      FROM deduped WHERE rn = 1
      GROUP BY ad_group_name
      ORDER BY spend DESC
    `;
 
   try {
     const rows = await queryBigQuery(query, accessToken, projectId);
     return rows.map(row => ({
       ad_name: row.ad_name,
       spend: parseFloat(row.spend) || 0,
       impressions: parseInt(row.impressions) || 0,
       clicks: parseInt(row.clicks) || 0,
       installs: parseFloat(row.installs) || 0,
       ctr: parseFloat(row.ctr) || 0,
       cpi: parseFloat(row.cpi) || 0,
       platform: "google",
     }));
   } catch (err) {
     console.error("Google Ads query failed:", err);
     return [];
   }
 }
 
 // ============ AGGREGATION LOGIC ============
 interface BlendedCreative {
   adName: string;
   metrics: {
     spend: number;
     installs: number;
     ctr: number;
     cpi: number;
   };
   parsed: ParsedCreativeName;
  assetUrl: string | null;
  assetType: string | null;
   platformBreakdown: Array<{
     platform: string;
     spend: number;
     installs: number;
     ctr: number;
     cpi: number;
   }>;
   platformCount: number;
 }
 
 function blendCreatives(allAds: AdMetric[]): BlendedCreative[] {
   const grouped = new Map<string, AdMetric[]>();
   
   for (const ad of allAds) {
     const key = ad.ad_name;
     if (!grouped.has(key)) {
       grouped.set(key, []);
     }
     grouped.get(key)!.push(ad);
   }
   
   const blended: BlendedCreative[] = [];
   
   for (const [adName, ads] of grouped) {
     const totalSpend = ads.reduce((sum, a) => sum + a.spend, 0);
     const totalInstalls = ads.reduce((sum, a) => sum + a.installs, 0);
     const avgCtr = ads.length > 0 ? ads.reduce((sum, a) => sum + a.ctr, 0) / ads.length : 0;
     const cpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
     
     blended.push({
       adName,
       metrics: {
         spend: totalSpend,
         installs: totalInstalls,
         ctr: avgCtr,
         cpi,
       },
       parsed: parseCreativeName(adName),
        assetUrl: null,
        assetType: null,
       platformBreakdown: ads.map(a => ({
         platform: a.platform,
         spend: a.spend,
         installs: a.installs,
         ctr: a.ctr,
         cpi: a.cpi,
       })).sort((x, y) => y.spend - x.spend),
       platformCount: ads.length,
     });
   }
   
   return blended;
 }
 
 function computeInsights(creatives: BlendedCreative[], allAds: AdMetric[]): any {
   // Top performing angle
   const angleSpend = new Map<string, number>();
   for (const c of creatives) {
     const angle = c.parsed.angle;
     if (angle) {
       angleSpend.set(angle, (angleSpend.get(angle) || 0) + c.metrics.spend);
     }
   }
   const topAngle = [...angleSpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
   
   // Top performing asset type
   const assetTypeSpend = new Map<string, number>();
   for (const c of creatives) {
     const assetType = c.parsed.assetType;
     if (assetType) {
       assetTypeSpend.set(assetType, (assetTypeSpend.get(assetType) || 0) + c.metrics.spend);
     }
   }
   const topAssetType = [...assetTypeSpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
   
   // Avg CPI by platform
   const platformMetrics = new Map<string, { spend: number; installs: number }>();
   for (const ad of allAds) {
     const current = platformMetrics.get(ad.platform) || { spend: 0, installs: 0 };
     current.spend += ad.spend;
     current.installs += ad.installs;
     platformMetrics.set(ad.platform, current);
   }
   
   const avgCpiByPlatform: Record<string, number> = {};
   for (const [platform, metrics] of platformMetrics) {
     avgCpiByPlatform[platform] = metrics.installs > 0 ? metrics.spend / metrics.installs : 0;
   }
   
   return {
     topPerformingAngle: topAngle,
     topPerformingAssetType: topAssetType,
     avgCpiByPlatform,
   };
 }
 
 // ============ MAIN HANDLER ============
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   const startTime = Date.now();
 
   try {
     const body = await req.json().catch(() => ({}));
     const {
       startDate,
       endDate,
       platforms = ["meta", "snapchat", "tiktok", "google"],
       limit = 50,
       sortBy = "spend",
       includeBreakdown = true,
       minSpend = 0,
      syncAssets = false,
     } = body;
 
     if (!startDate || !endDate) {
       return new Response(
         JSON.stringify({ success: false, error: "startDate and endDate are required" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Validate limit
     const effectiveLimit = Math.min(Math.max(1, limit), 200);
 
     console.log(`Creative Insights API - Date range: ${startDate} to ${endDate}, platforms: ${platforms.join(", ")}`);
 
      // Initialize Supabase client
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Missing Supabase configuration");
      }
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Optionally trigger asset sync first
      if (syncAssets) {
        console.log("Triggering asset sync before fetching data...");
        try {
          const syncResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-creative-assets`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ platforms: ["meta"], forceRefresh: false }),
          });
          if (syncResponse.ok) {
            console.log("Asset sync completed successfully");
          } else {
            console.warn("Asset sync failed, continuing with cached assets");
          }
        } catch (syncError) {
          console.warn("Asset sync error, continuing with cached assets:", syncError);
        }
      }

     const accessToken = await getGoogleAccessToken();
 
     // Fetch all platforms in parallel
     const platformFetchers: Promise<AdMetric[]>[] = [];
     const platformsQueried: string[] = [];
 
     if (platforms.includes("meta")) {
       platformFetchers.push(fetchMetaAds(startDate, endDate, accessToken));
       platformsQueried.push("meta");
     }
     if (platforms.includes("snapchat")) {
       platformFetchers.push(fetchSnapchatAds(startDate, endDate, accessToken));
       platformsQueried.push("snapchat");
     }
     if (platforms.includes("tiktok")) {
       platformFetchers.push(fetchTikTokAds(startDate, endDate, accessToken));
       platformsQueried.push("tiktok");
     }
     if (platforms.includes("google")) {
       platformFetchers.push(fetchGoogleAds(startDate, endDate, accessToken));
       platformsQueried.push("google");
     }
 
     const platformResults = await Promise.all(platformFetchers);
     const allAds = platformResults.flat();
 
     console.log(`Fetched ${allAds.length} total ads across ${platformsQueried.length} platforms`);
 
      // Fetch stored creative assets from database
      const { data: storedAssets, error: assetsError } = await supabase
        .from('creative_assets')
        .select('creative_name, thumbnail_url, asset_type');

      if (assetsError) {
        console.warn("Failed to fetch stored assets:", assetsError.message);
      }

      // Build asset lookup map
      const assetMap = new Map<string, { url: string | null; type: string | null }>(
        (storedAssets || []).map((a: any) => [
          a.creative_name,
          { url: a.thumbnail_url, type: a.asset_type }
        ])
      );

      console.log(`Loaded ${assetMap.size} stored creative assets for matching`);

     // Blend creatives by ad_name
     let blendedCreatives = blendCreatives(allAds);

      // Enrich with asset URLs
      for (const creative of blendedCreatives) {
        const asset = assetMap.get(creative.adName);
        creative.assetUrl = asset?.url || null;
        creative.assetType = asset?.type || null;
      }
 
     // Apply minSpend filter
     if (minSpend > 0) {
       blendedCreatives = blendedCreatives.filter(c => c.metrics.spend >= minSpend);
     }
 
     // Sort
     switch (sortBy) {
       case "installs":
         blendedCreatives.sort((a, b) => b.metrics.installs - a.metrics.installs);
         break;
       case "ctr":
         blendedCreatives.sort((a, b) => b.metrics.ctr - a.metrics.ctr);
         break;
       case "cpi":
         blendedCreatives.sort((a, b) => a.metrics.cpi - b.metrics.cpi); // Lower CPI is better
         break;
       case "spend":
       default:
         blendedCreatives.sort((a, b) => b.metrics.spend - a.metrics.spend);
     }
 
     // Apply limit
     const limitedCreatives = blendedCreatives.slice(0, effectiveLimit);
 
      // Calculate asset coverage
      const creativesWithAssets = blendedCreatives.filter(c => c.assetUrl !== null).length;
      const assetCoverage = blendedCreatives.length > 0 
        ? Math.round((creativesWithAssets / blendedCreatives.length) * 100) / 100 
        : 0;

     // Calculate totals
     const totalSpend = allAds.reduce((sum, a) => sum + a.spend, 0);
     const totalInstalls = allAds.reduce((sum, a) => sum + a.installs, 0);
     const avgCtr = allAds.length > 0 ? allAds.reduce((sum, a) => sum + a.ctr, 0) / allAds.length : 0;
     const avgCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
 
     // Compute insights
     const insights = computeInsights(blendedCreatives, allAds);
 
     // Format response
     const responseCreatives = limitedCreatives.map(c => {
       const base: any = {
         adName: c.adName,
         metrics: c.metrics,
         parsed: c.parsed,
         platformCount: c.platformCount,
          assetUrl: c.assetUrl,
          assetType: c.assetType,
       };
       if (includeBreakdown) {
         base.platformBreakdown = c.platformBreakdown;
       }
       return base;
     });
 
     const durationMs = Date.now() - startTime;
 
     return new Response(
       JSON.stringify({
         success: true,
         meta: {
           dateRange: { startDate, endDate },
           platformsQueried,
           totalCreatives: blendedCreatives.length,
           returnedCreatives: limitedCreatives.length,
            creativesWithAssets,
            assetCoverage,
           generatedAt: new Date().toISOString(),
           durationMs,
         },
         totals: {
           spend: Math.round(totalSpend * 100) / 100,
           installs: totalInstalls,
           avgCtr: Math.round(avgCtr * 10000) / 10000,
           avgCpi: Math.round(avgCpi * 100) / 100,
         },
         creatives: responseCreatives,
         insights,
       }),
       { headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   } catch (error) {
     const errorMessage = error instanceof Error ? error.message : String(error);
     console.error("Creative Insights API error:", errorMessage);
 
     return new Response(
       JSON.stringify({ success: false, error: errorMessage }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });