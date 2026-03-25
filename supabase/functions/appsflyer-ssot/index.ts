import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("APPSFLYER_API_TOKEN");
  const appId = Deno.env.get("APPSFLYER_APP_ID");

  if (!token || !appId) {
    return new Response(JSON.stringify({ error: "Missing APPSFLYER_API_TOKEN or APPSFLYER_APP_ID" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { startDate, endDate, mediaSource, testOnly } = await req.json();
    
    const from = startDate || "2026-03-24";
    const to = endDate || "2026-03-24";
    const source = mediaSource || "moloco_int";

    // Use AppsFlyer Pull API - Aggregate Performance Report
    const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/partners_report/v5?api_token=${token}&from=${from}&to=${to}&timezone=America%2FNew_York&media_source=${source}&groupings=date,media_source,campaign&kpis=installs,total_revenue,event_counter,unique_users`;
    
    console.log(`Fetching AppsFlyer data: ${from} to ${to}, source: ${source}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AppsFlyer API error [${response.status}]:`, errorText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `AppsFlyer API returned ${response.status}`,
        details: errorText.substring(0, 500),
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const csvText = await response.text();
    console.log(`AppsFlyer response (first 500 chars):`, csvText.substring(0, 500));
    
    // Parse CSV
    const lines = csvText.trim().split('\n');
    const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) || [];
    
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });

    return new Response(JSON.stringify({ 
      success: true,
      headers,
      rowCount: rows.length,
      rows: rows.slice(0, 20), // Return first 20 rows for inspection
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("AppsFlyer error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
