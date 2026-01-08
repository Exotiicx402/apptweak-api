import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const APPSFLYER_API_TOKEN = Deno.env.get('APPSFLYER_API_TOKEN');
    const APPSFLYER_APP_ID = Deno.env.get('APPSFLYER_APP_ID');

    if (!APPSFLYER_API_TOKEN || !APPSFLYER_APP_ID) {
      console.error('Missing AppsFlyer credentials');
      return new Response(
        JSON.stringify({ error: 'Missing AppsFlyer credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: 'startDate and endDate are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching AppsFlyer SSOT iOS data for ${APPSFLYER_APP_ID} from ${startDate} to ${endDate}`);

    // AppsFlyer Pull API - installs_report for aggregated install data
    // The app ID prefix 'id' indicates iOS App Store app
    const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${APPSFLYER_APP_ID}/installs_report/v5`;
    
    const params = new URLSearchParams({
      from: startDate,
      to: endDate,
      timezone: 'UTC',
    });

    console.log(`Calling AppsFlyer API: ${url}?${params.toString()}`);

    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${APPSFLYER_API_TOKEN}`,
        'Accept': 'text/csv',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AppsFlyer API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `AppsFlyer API error: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const csvData = await response.text();
    console.log('AppsFlyer CSV response (first 500 chars):', csvData.substring(0, 500));

    // Parse CSV to JSON
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      console.log('No data rows in CSV response');
      return new Response(
        JSON.stringify({ downloads: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIndex = headers.findIndex(h => h === 'date');
    const installsIndex = headers.findIndex(h => h === 'installs');

    if (dateIndex === -1 || installsIndex === -1) {
      console.error('Could not find date or installs columns in CSV', headers);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid CSV format',
          headers: headers 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Aggregate installs by date
    const downloadsByDate: Record<string, number> = {};
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const date = values[dateIndex]?.trim();
      const installs = parseInt(values[installsIndex]?.trim() || '0', 10);
      
      if (date) {
        downloadsByDate[date] = (downloadsByDate[date] || 0) + installs;
      }
    }

    const downloads = Object.entries(downloadsByDate)
      .map(([date, downloads]) => ({ date, downloads }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`Parsed ${downloads.length} days of download data`);

    return new Response(
      JSON.stringify({ downloads }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in appsflyer-ssot function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});