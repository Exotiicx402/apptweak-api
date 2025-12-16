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
    const apiKey = Deno.env.get('APPTWEAK_API_KEY');
    if (!apiKey) {
      throw new Error('APPTWEAK_API_KEY not configured');
    }

    const url = new URL(req.url);
    const country = url.searchParams.get('country') || 'us';
    const device = url.searchParams.get('device') || 'iphone';
    const category = url.searchParams.get('category') || '6004';

    console.log(`Fetching top charts for category ${category} in ${country} on ${device}`);

    const apiUrl = `https://public-api.apptweak.com/api/public/store/charts/top-results/current.json?categories=${category}&types=free&country=${country}&device=${device}`;

    const response = await fetch(apiUrl, {
      headers: {
        'X-Apptweak-Key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AppTweak API error:', errorText);
      throw new Error(`AppTweak API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AppTweak top charts response received');

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in apptweak-top-charts function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
