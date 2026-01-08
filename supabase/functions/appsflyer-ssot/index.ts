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

    console.log(`Fetching AppsFlyer iOS installs for ${APPSFLYER_APP_ID} from ${startDate} to ${endDate}`);

    // Use aggregate daily_report which gives us Date and Installs by media source
    const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${APPSFLYER_APP_ID}/daily_report/v5`;
    
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

    // Parse headers - handle potential quoted values
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    console.log('CSV headers:', headers);
    
    // Find date and installs columns (case-insensitive, partial match)
    const dateIndex = headers.findIndex(h => h === 'date');
    const installsIndex = headers.findIndex(h => h === 'installs');

    if (dateIndex === -1 || installsIndex === -1) {
      console.error('Could not find date or installs columns in CSV. Headers:', headers);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid CSV format - missing date or installs column',
          headers: headers 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found date at index ${dateIndex}, installs at index ${installsIndex}`);

    // Aggregate installs by date (summing across all media sources)
    const downloadsByDate: Record<string, number> = {};
    
    for (let i = 1; i < lines.length; i++) {
      // Simple CSV parsing - split by comma
      const values = lines[i].split(',');
      const date = values[dateIndex]?.trim().replace(/"/g, '');
      const installsStr = values[installsIndex]?.trim().replace(/"/g, '') || '0';
      const installs = parseInt(installsStr, 10) || 0;
      
      if (date && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        downloadsByDate[date] = (downloadsByDate[date] || 0) + installs;
      }
    }

    const downloads = Object.entries(downloadsByDate)
      .map(([date, downloads]) => ({ date, downloads }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`Parsed ${downloads.length} days of iOS install data:`, downloads);

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
