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
    const { appId, country = 'us', device = 'iphone', startDate, endDate } = await req.json();
    
    const apiKey = Deno.env.get('APPTWEAK_API_KEY');
    if (!apiKey) {
      console.error('APPTWEAK_API_KEY not configured');
      throw new Error('API key not configured');
    }

    // Default to last 30 days if no dates provided
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const url = `https://public-api.apptweak.com/api/public/store/apps/category-rankings/history.json?apps=${appId}&country=${country}&device=${device}&start_date=${start}&end_date=${end}`;
    
    console.log('Fetching ranking history:', url);

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-apptweak-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AppTweak API error:', response.status, errorText);
      throw new Error(`AppTweak API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Ranking history response:', JSON.stringify(data).substring(0, 500));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in apptweak-ranking-history:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
