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
    return new Response(JSON.stringify({ error: "Missing credentials" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { startDate, endDate } = await req.json();
    const from = startDate || "2026-03-24";
    const to = endDate || "2026-03-24";

    // Try partners_by_date_report - aggregate report filtered by moloco
    const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/partners_by_date_report/v5?from=${from}&to=${to}&timezone=America%2FNew_York&media_source=moloco_int&groupings=date,campaign&kpis=installs,first_time_deposit_unique_users,first_time_deposit_event_counter,total_revenue`;
    
    console.log(`Fetching AppsFlyer partners_by_date for moloco: ${from} to ${to}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/csv',
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      // Try alternate: daily report
      const url2 = `https://hq1.appsflyer.com/api/agg-data/export/app/${appId}/daily_report/v5?from=${from}&to=${to}&timezone=America%2FNew_York&media_source=moloco_int&groupings=date&kpis=installs,total_revenue`;
      
      console.log(`Trying daily_report endpoint...`);
      const resp2 = await fetch(url2, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'text/csv' },
      });
      const text2 = await resp2.text();

      return new Response(JSON.stringify({ 
        success: false,
        partnersError: `${response.status}: ${responseText.substring(0, 300)}`,
        dailyStatus: resp2.status,
        dailyResponse: text2.substring(0, 1000),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      rawCsv: responseText.substring(0, 2000),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
