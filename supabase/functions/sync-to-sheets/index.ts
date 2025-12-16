import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { data } = await req.json();
    
    const sheetWebAppUrl = Deno.env.get('GOOGLE_SHEETS_WEB_APP_URL');
    if (!sheetWebAppUrl) {
      throw new Error('GOOGLE_SHEETS_WEB_APP_URL not configured');
    }

    if (!data || !Array.isArray(data)) {
      throw new Error('Data array is required');
    }

    console.log('Syncing data to Google Sheets:', data.length, 'rows');

    // Send data to Google Apps Script Web App
    const response = await fetch(sheetWebAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Apps Script error:', errorText);
      throw new Error(`Failed to sync to sheet: ${response.status}`);
    }

    const result = await response.json();
    console.log('Sync result:', result);

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in sync-to-sheets:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
