import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_ID = "6648798962";
const BASE_URL = "https://public-api.apptweak.com/api/public/store/apps/category-rankings/current.json";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('APPTWEAK_API_KEY');
    
    if (!apiKey) {
      console.error('APPTWEAK_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for optional parameters
    let appId = APP_ID;
    let country = 'us';
    let device = 'iphone';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        appId = body.appId || APP_ID;
        country = body.country || 'us';
        device = body.device || 'iphone';
      } catch {
        // Use defaults if body parsing fails
      }
    }

    const url = new URL(BASE_URL);
    url.searchParams.set('apps', appId);
    url.searchParams.set('country', country);
    url.searchParams.set('device', device);

    console.log(`Fetching rankings for app ${appId} in ${country} on ${device}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-apptweak-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AppTweak API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `AppTweak API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AppTweak response:', JSON.stringify(data));

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in apptweak-ranking function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
