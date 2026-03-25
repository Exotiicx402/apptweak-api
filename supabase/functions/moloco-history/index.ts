import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOLOCO_AUTH_URL = 'https://api.moloco.cloud/cm/v1/auth/tokens';
const MOLOCO_REPORTS_URL = 'https://api.moloco.cloud/cm/v1/reports';

// Get today's date in EST timezone
function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const BACKFILL_WINDOW_DAYS = 14;

function isWithinLastNDays(dateStr: string, n: number): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
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

function getMissingDates(requestedDates: string[], existingDates: Set<string>): string[] {
  return requestedDates.filter(d => !existingDates.has(d));
}

function getBackfillableDates(missingDates: string[]): string[] {
  return missingDates.filter(d => isWithinLastNDays(d, BACKFILL_WINDOW_DAYS));
}

interface MolocoRow {
  date: string;
  campaign?: {
    id: string;
    title: string;
    country?: string;
  };
  ad_group?: {
    id: string;
    title: string;
  };
  metric?: {
    impressions: string;
    clicks: string;
    installs: string;
    spend: number;
    conversions: string;
    target_actions: string;
  };
}

interface ProcessedRow {
  date: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
  installs: number;
  impressions: number;
  clicks: number;
  ftds: number;
}

// ============ BigQuery Helper Functions ============

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google OAuth credentials");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get Google access token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

function resolveMolocoBigQueryTarget(): { projectId: string; datasetId: string; tableId: string } {
  const tableId = Deno.env.get("MOLOCO_BQ_TABLE_ID");
  if (!tableId) {
    throw new Error("Missing MOLOCO_BQ_TABLE_ID environment variable");
  }

  const parts = tableId.split(".");
  if (parts.length !== 3) {
    throw new Error(`Invalid MOLOCO_BQ_TABLE_ID format: ${tableId}. Expected: project.dataset.table`);
  }

  return {
    projectId: parts[0],
    datasetId: parts[1],
    tableId: parts[2],
  };
}

async function queryBigQuery(query: string, accessToken: string): Promise<any[]> {
  const { projectId } = resolveMolocoBigQueryTarget();
  
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
    throw new Error(`BigQuery query error: ${errorText}`);
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

async function mergeIntoBigQuery(rows: ProcessedRow[], accessToken: string): Promise<number> {
  if (rows.length === 0) return 0;

  const { projectId, datasetId, tableId } = resolveMolocoBigQueryTarget();
  const fullTableId = `${projectId}.${datasetId}.${tableId}`;

  const valuesClause = rows
    .map((row) => {
      const escapedName = row.campaign_name.replace(/'/g, "\\'");
      return `(
        DATE('${row.date}'),
        '${row.campaign_id}',
        '${escapedName}',
        ${row.spend},
        ${row.installs},
        ${row.impressions},
        ${row.clicks},
        CURRENT_TIMESTAMP()
      )`;
    })
    .join(",\n");

  const mergeQuery = `
    MERGE \`${fullTableId}\` AS target
    USING (
      SELECT * FROM UNNEST([
        STRUCT<date DATE, campaign_id STRING, campaign_name STRING, spend FLOAT64, installs INT64, impressions INT64, clicks INT64, fetched_at TIMESTAMP>
        ${valuesClause}
      ])
    ) AS source
    ON target.date = source.date AND target.campaign_id = source.campaign_id
    WHEN MATCHED THEN
      UPDATE SET
        campaign_name = source.campaign_name,
        spend = source.spend,
        installs = source.installs,
        impressions = source.impressions,
        clicks = source.clicks,
        fetched_at = source.fetched_at
    WHEN NOT MATCHED THEN
      INSERT (date, campaign_id, campaign_name, spend, installs, impressions, clicks, fetched_at)
      VALUES (source.date, source.campaign_id, source.campaign_name, source.spend, source.installs, source.impressions, source.clicks, source.fetched_at)
  `;

  console.log(`Merging ${rows.length} rows into BigQuery...`);

  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: mergeQuery,
        useLegacySql: false,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BigQuery merge error: ${errorText}`);
  }

  const result = await response.json();
  console.log(`Merged ${rows.length} rows into BigQuery`);
  return result.numDmlAffectedRows ? Number(result.numDmlAffectedRows) : rows.length;
}

// ============ Moloco API Functions ============

async function getMolocoAccessToken(apiKey: string): Promise<string> {
  console.log('Fetching Moloco access token...');
  
  const response = await fetch(MOLOCO_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Auth error:', response.status, errorText);
    throw new Error(`Failed to get Moloco access token: ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

async function createReport(
  token: string,
  adAccountId: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = ['DATE', 'CAMPAIGN']
): Promise<string> {
  console.log(`Creating Moloco report for ${startDate} to ${endDate} with dimensions ${dimensions.join(',')}...`);
  
  const response = await fetch(MOLOCO_REPORTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ad_account_id: adAccountId,
      date_range: {
        start: startDate,
        end: endDate,
      },
      dimensions,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Create report error:', response.status, errorText);
    throw new Error(`Failed to create Moloco report: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('Report created:', data.id);
  return data.id;
}

async function waitForReport(
  token: string,
  reportId: string,
  maxAttempts = 30,
  delayMs = 2000
): Promise<string> {
  console.log(`Waiting for report ${reportId} to be ready...`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${MOLOCO_REPORTS_URL}/${reportId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Status check error:', response.status, errorText);
      throw new Error(`Failed to check report status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Attempt ${attempt + 1}: Status = ${data.status}`);

    if (data.status === 'READY') {
      return data.location_json;
    }

    if (data.status === 'FAILED') {
      throw new Error('Report generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('Report generation timed out');
}

async function downloadReport(jsonUrl: string): Promise<MolocoRow[]> {
  console.log('Downloading report from:', jsonUrl);
  
  const response = await fetch(jsonUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`);
  }

  const data = await response.json();
  return data.rows || [];
}

function processRows(rows: MolocoRow[]): ProcessedRow[] {
  return rows.map(row => ({
    date: row.date,
    campaign_id: row.campaign?.id || '',
    campaign_name: row.campaign?.title || 'Unknown',
    spend: row.metric?.spend || 0,
    installs: parseInt(row.metric?.installs || '0', 10),
    impressions: parseInt(row.metric?.impressions || '0', 10),
    clicks: parseInt(row.metric?.clicks || '0', 10),
    ftds: parseInt(row.metric?.target_actions || '0', 10),
  }));
}

interface AdGroupRow {
  date: string;
  ad_group_id: string;
  ad_group_name: string;
  spend: number;
  installs: number;
  impressions: number;
  clicks: number;
}

function processAdGroupRows(rows: MolocoRow[]): AdGroupRow[] {
  return rows.map(row => ({
    date: row.date,
    ad_group_id: row.ad_group?.id || '',
    ad_group_name: row.ad_group?.title || 'Unknown',
    spend: row.metric?.spend || 0,
    installs: parseInt(row.metric?.installs || '0', 10),
    impressions: parseInt(row.metric?.impressions || '0', 10),
    clicks: parseInt(row.metric?.clicks || '0', 10),
  }));
}

function aggregateAdGroups(rows: AdGroupRow[]): any[] {
  const map = new Map<string, any>();
  for (const row of rows) {
    const key = row.ad_group_name;
    const existing = map.get(key) || {
      ad_id: row.ad_group_id,
      ad_name: row.ad_group_name,
      spend: 0,
      installs: 0,
      impressions: 0,
      clicks: 0,
    };
    existing.spend += row.spend;
    existing.installs += row.installs;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    map.set(key, existing);
  }
  return Array.from(map.values()).map(a => ({
    ...a,
    ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
    cpi: a.installs > 0 ? a.spend / a.installs : 0,
  })).sort((a, b) => b.spend - a.spend);
}

// Fetch live Moloco data from API (campaign level)
async function fetchMolocoLiveData(startDate: string, endDate: string): Promise<ProcessedRow[]> {
  const apiKey = Deno.env.get('MOLOCO_API_KEY');
  const adAccountId = Deno.env.get('MOLOCO_AD_ACCOUNT_ID');

  if (!apiKey || !adAccountId) {
    throw new Error('Moloco credentials not configured');
  }

  const token = await getMolocoAccessToken(apiKey);
  const reportId = await createReport(token, adAccountId, startDate, endDate);
  const jsonUrl = await waitForReport(token, reportId);
  const rawRows = await downloadReport(jsonUrl);
  return processRows(rawRows);
}

// Fetch live Moloco data from API (ad group level)
async function fetchMolocoAdGroupData(startDate: string, endDate: string): Promise<AdGroupRow[]> {
  const apiKey = Deno.env.get('MOLOCO_API_KEY');
  const adAccountId = Deno.env.get('MOLOCO_AD_ACCOUNT_ID');

  if (!apiKey || !adAccountId) {
    throw new Error('Moloco credentials not configured');
  }

  const token = await getMolocoAccessToken(apiKey);
  const reportId = await createReport(token, adAccountId, startDate, endDate);
  const jsonUrl = await waitForReport(token, reportId);
  const rawRows = await downloadReport(jsonUrl);
  return processAdGroupRows(rawRows);
}

// ============ Aggregation Functions ============

function aggregateByDate(rows: ProcessedRow[]): any[] {
  const dateMap = new Map<string, any>();
  
  for (const row of rows) {
    const existing = dateMap.get(row.date) || {
      date: row.date,
      spend: 0,
      installs: 0,
      impressions: 0,
      clicks: 0,
    };
    existing.spend += row.spend;
    existing.installs += row.installs;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    dateMap.set(row.date, existing);
  }
  
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByCampaign(rows: ProcessedRow[]): any[] {
  const campaignMap = new Map<string, any>();
  
  for (const row of rows) {
    const key = row.campaign_id;
    const existing = campaignMap.get(key) || {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: 0,
      installs: 0,
      impressions: 0,
      clicks: 0,
    };
    existing.spend += row.spend;
    existing.installs += row.installs;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    campaignMap.set(key, existing);
  }
  
  return Array.from(campaignMap.values())
    .map(c => ({
      ...c,
      cpi: c.installs > 0 ? c.spend / c.installs : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

function calculateTotals(rows: ProcessedRow[]): any {
  const totals = rows.reduce(
    (acc, row) => ({
      spend: acc.spend + row.spend,
      installs: acc.installs + row.installs,
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
    }),
    { spend: 0, installs: 0, impressions: 0, clicks: 0 }
  );

  return {
    ...totals,
    cpi: totals.installs > 0 ? totals.spend / totals.installs : 0,
  };
}

// ============ Main Handler ============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    console.log(`Moloco query: ${startDate} to ${endDate}`);

    const today = getTodayDate();
    const requestedDates = getDatesBetween(startDate, endDate);
    
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

    console.log(`Query range: ${startDate} to ${endDate}, today: ${today}`);
    console.log(`Previous period: ${prevStartStr} to ${prevEndStr}`);

    // Get Google access token for BigQuery
    let googleAccessToken: string;
    try {
      googleAccessToken = await getGoogleAccessToken();
    } catch (err) {
      console.error('Failed to get Google access token:', err);
      throw new Error('BigQuery authentication failed');
    }

    const { projectId, datasetId, tableId } = resolveMolocoBigQueryTarget();
    const fullTable = `\`${projectId}.${datasetId}.${tableId}\``;

    // Try to query BigQuery for current and previous period
    let bqCurrentRows: any[] = [];
    let bqPrevRows: any[] = [];
    let bqQueryFailed = false;

    try {
      const currentPeriodQuery = `
        SELECT 
          date,
          campaign_id,
          campaign_name,
          spend,
          installs,
          impressions,
          clicks
        FROM ${fullTable}
        WHERE date BETWEEN '${startDate}' AND '${endDate}'
        ORDER BY date, campaign_id
      `;

      const prevPeriodQuery = `
        SELECT 
          date,
          campaign_id,
          campaign_name,
          spend,
          installs,
          impressions,
          clicks
        FROM ${fullTable}
        WHERE date BETWEEN '${prevStartStr}' AND '${prevEndStr}'
        ORDER BY date, campaign_id
      `;

      [bqCurrentRows, bqPrevRows] = await Promise.all([
        queryBigQuery(currentPeriodQuery, googleAccessToken),
        queryBigQuery(prevPeriodQuery, googleAccessToken),
      ]);

      console.log(`BigQuery returned ${bqCurrentRows.length} current rows, ${bqPrevRows.length} previous rows`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('BigQuery query failed:', errorMessage);
      
      // Check if it's a schema error - if so, we can try live API fallback
      if (errorMessage.includes('schema') || errorMessage.includes('does not exist')) {
        console.log('BigQuery table may not have schema - will attempt live API fallback');
        bqQueryFailed = true;
      } else {
        throw err;
      }
    }

    // Parse BigQuery rows
    let currentRows: ProcessedRow[] = bqCurrentRows.map((row: any) => ({
      date: typeof row.date === 'string' && row.date.includes('T') 
        ? row.date.split('T')[0] 
        : String(row.date),
      campaign_id: row.campaign_id || '',
      campaign_name: row.campaign_name || 'Unknown',
      spend: parseFloat(row.spend) || 0,
      installs: parseInt(row.installs) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
    }));

    let prevRows: ProcessedRow[] = bqPrevRows.map((row: any) => ({
      date: typeof row.date === 'string' && row.date.includes('T') 
        ? row.date.split('T')[0] 
        : String(row.date),
      campaign_id: row.campaign_id || '',
      campaign_name: row.campaign_name || 'Unknown',
      spend: parseFloat(row.spend) || 0,
      installs: parseInt(row.installs) || 0,
      impressions: parseInt(row.impressions) || 0,
      clicks: parseInt(row.clicks) || 0,
    }));

    // Identify which dates we have from BigQuery
    const existingDates = new Set(currentRows.map(r => r.date));
    
    // Determine which dates are missing and backfillable (within 14 days)
    const missingDates = getMissingDates(requestedDates, existingDates);
    const backfillableDates = getBackfillableDates(missingDates);

    console.log(`Missing dates: ${missingDates.length}, Backfillable (within ${BACKFILL_WINDOW_DAYS} days): ${backfillableDates.length}`);

    // Also check previous period for missing dates
    const prevRequestedDates = getDatesBetween(prevStartStr, prevEndStr);
    const existingPrevDates = new Set(prevRows.map(r => r.date));
    const missingPrevDates = getMissingDates(prevRequestedDates, existingPrevDates);
    const backfillablePrevDates = getBackfillableDates(missingPrevDates);

    console.log(`Previous period missing dates: ${missingPrevDates.length}, Backfillable: ${backfillablePrevDates.length}`);

    // Fetch live data for backfillable dates (or if BQ query failed entirely)
    let liveRows: ProcessedRow[] = [];
    
    if (backfillableDates.length > 0 || bqQueryFailed) {
      const fetchStart = bqQueryFailed 
        ? (isWithinLastNDays(startDate, BACKFILL_WINDOW_DAYS) ? startDate : addDays(today, -BACKFILL_WINDOW_DAYS))
        : backfillableDates.sort()[0];
      const fetchEnd = bqQueryFailed
        ? (endDate > today ? today : endDate)
        : backfillableDates.sort().slice(-1)[0];

      console.log(`Fetching live Moloco data from ${fetchStart} to ${fetchEnd}...`);
      
      try {
        liveRows = await fetchMolocoLiveData(fetchStart, fetchEnd);
        console.log(`Fetched ${liveRows.length} live rows from Moloco API`);

        // Cache live data to BigQuery (if we have valid schema)
        if (liveRows.length > 0 && !bqQueryFailed) {
          try {
            await mergeIntoBigQuery(liveRows, googleAccessToken);
            console.log(`Cached ${liveRows.length} rows to BigQuery`);
          } catch (cacheErr) {
            console.error('Failed to cache to BigQuery (non-blocking):', cacheErr);
          }
        }
      } catch (liveErr) {
        console.error('Failed to fetch live Moloco data:', liveErr);
      }
    }

    // Fetch live data for missing previous period dates
    let livePrevRows: ProcessedRow[] = [];

    if (backfillablePrevDates.length > 0) {
      const prevFetchStart = backfillablePrevDates.sort()[0];
      const prevFetchEnd = backfillablePrevDates.sort().slice(-1)[0];

      console.log(`Fetching live Moloco previous period data from ${prevFetchStart} to ${prevFetchEnd}...`);
      
      try {
        livePrevRows = await fetchMolocoLiveData(prevFetchStart, prevFetchEnd);
        console.log(`Fetched ${livePrevRows.length} live previous period rows from Moloco API`);

        // Cache to BigQuery
        if (livePrevRows.length > 0 && !bqQueryFailed) {
          try {
            await mergeIntoBigQuery(livePrevRows, googleAccessToken);
            console.log(`Cached ${livePrevRows.length} previous period rows to BigQuery`);
          } catch (cacheErr) {
            console.error('Failed to cache previous period to BigQuery (non-blocking):', cacheErr);
          }
        }
      } catch (liveErr) {
        console.error('Failed to fetch live Moloco previous period data:', liveErr);
      }
    }

    // Merge BigQuery data with live data (live data takes precedence for overlapping dates)
    const liveDataDates = new Set(liveRows.map(r => r.date));
    const filteredBqRows = currentRows.filter(r => !liveDataDates.has(r.date));
    const mergedRows = [...filteredBqRows, ...liveRows];

    // Merge previous period data
    const livePrevDataDates = new Set(livePrevRows.map(r => r.date));
    const filteredBqPrevRows = prevRows.filter(r => !livePrevDataDates.has(r.date));
    const mergedPrevRows = [...filteredBqPrevRows, ...livePrevRows];

    console.log(`Final merged rows: ${mergedRows.length} (${filteredBqRows.length} from BQ + ${liveRows.length} from live)`);
    console.log(`Final merged previous rows: ${mergedPrevRows.length}`);

    // Calculate results
    const totals = calculateTotals(mergedRows);
    const previousTotals = calculateTotals(mergedPrevRows);

    console.log(`Totals: spend=${totals.spend.toFixed(2)}, installs=${totals.installs}`);

    // Fetch ad-group level data for creative reporting (sequential to respect rate limits)
    let ads: any[] = [];
    try {
      // Use the full requested range — ad-group data is always fetched live (not cached in BQ)
      const adFetchStart = isWithinLastNDays(startDate, BACKFILL_WINDOW_DAYS) ? startDate : addDays(today, -BACKFILL_WINDOW_DAYS);
      const adFetchEnd = endDate > today ? today : endDate;
      
      if (adFetchStart <= adFetchEnd) {
        console.log(`Fetching Moloco ad-group data from ${adFetchStart} to ${adFetchEnd}...`);
        const adGroupRows = await fetchMolocoAdGroupData(adFetchStart, adFetchEnd);
        ads = aggregateAdGroups(adGroupRows);
        console.log(`Aggregated ${ads.length} ad groups from ${adGroupRows.length} rows`);
      }
    } catch (adErr) {
      console.error('Failed to fetch ad-group data (non-blocking):', adErr);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        data: { 
          daily: aggregateByDate(mergedRows),
          campaigns: aggregateByCampaign(mergedRows),
          totals,
          previousTotals,
          ads,
          dateRange: { startDate, endDate },
          previousDateRange: { startDate: prevStartStr, endDate: prevEndStr },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in moloco-history:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
