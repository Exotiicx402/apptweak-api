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

    // Fetch ALL in-app events (no media source filter) to discover sources
    const url = `https://hq1.appsflyer.com/api/raw-data/export/app/${appId}/in_app_events_report/v5?from=${from}&to=${to}&timezone=America%2FNew_York&maximum_rows=100`;
    
    console.log(`Fetching ALL AppsFlyer events for Moloco: ${from} to ${to}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/csv',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ success: false, error: `${response.status}: ${errorText.substring(0, 300)}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) || [];
    
    // Find event name and media source columns
    const eventNameIdx = headers.findIndex(h => h === 'Event Name');
    const mediaSourceIdx = headers.findIndex(h => h === 'Media Source');
    
    // Collect unique event names and media sources
    const eventCounts = new Map<string, number>();
    const mediaSources = new Map<string, number>();
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const eventName = eventNameIdx >= 0 ? values[eventNameIdx] : 'unknown';
      const mediaSource = mediaSourceIdx >= 0 ? values[mediaSourceIdx] : 'unknown';
      eventCounts.set(eventName, (eventCounts.get(eventName) || 0) + 1);
      mediaSources.set(mediaSource, (mediaSources.get(mediaSource) || 0) + 1);
    }

    return new Response(JSON.stringify({ 
      success: true,
      totalRows: lines.length - 1,
      eventCounts: Object.fromEntries(eventCounts),
      mediaSources: Object.fromEntries(mediaSources),
      sampleHeaders: headers.slice(0, 15),
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
