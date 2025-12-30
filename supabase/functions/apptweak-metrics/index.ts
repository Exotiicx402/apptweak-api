import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { appId, country = 'us', device = 'iphone', metrics = 'downloads' } = await req.json();
    
    const apiKey = Deno.env.get('APPTWEAK_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!apiKey) {
      console.error('APPTWEAK_API_KEY not configured');
      throw new Error('API key not configured');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not configured');
      throw new Error('Database not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split('T')[0];
    
    console.log(`Checking database for ${appId} metrics on ${today}`);

    // Check if we have today's downloads in the database
    const { data: existingData, error: dbError } = await supabase
      .from('app_downloads_history')
      .select('date, downloads')
      .eq('app_id', appId)
      .eq('country', country)
      .eq('device', device)
      .eq('date', today)
      .maybeSingle();

    if (dbError) {
      console.error('Database query error:', dbError);
    }

    // If we have today's data, return it from cache
    if (existingData) {
      console.log(`Returning cached downloads for ${appId} on ${today}: ${existingData.downloads}`);
      
      const formattedResponse = {
        result: {
          [appId]: {
            downloads: {
              value: existingData.downloads,
              date: existingData.date,
              precision: 1,
            },
          },
        },
      };

      return new Response(JSON.stringify(formattedResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No cached data for today, fetch from API
    console.log(`No cache for today, fetching from API for app ${appId}`);

    const url = `https://public-api.apptweak.com/api/public/store/apps/metrics/current.json?apps=${appId}&metrics=${metrics}&country=${country}&device=${device}`;
    
    console.log('Fetching app metrics:', url);

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
    console.log('App metrics response:', JSON.stringify(data).substring(0, 500));

    // Store downloads in database if available
    const downloads = data?.result?.[appId]?.downloads;
    if (downloads?.value !== undefined && downloads?.date) {
      const { error: insertError } = await supabase
        .from('app_downloads_history')
        .upsert({
          app_id: appId,
          date: downloads.date,
          downloads: downloads.value,
          country,
          device,
        }, { onConflict: 'app_id,date,country,device' });

      if (insertError) {
        console.error('Failed to cache downloads:', insertError);
      } else {
        console.log(`Cached downloads for ${appId} on ${downloads.date}: ${downloads.value}`);
      }
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in apptweak-metrics:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
