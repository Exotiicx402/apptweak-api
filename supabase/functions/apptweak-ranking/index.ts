import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!apiKey) {
      console.error('APPTWEAK_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Database not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const today = new Date().toISOString().split('T')[0];
    
    console.log(`Checking database for ${appId} current ranking on ${today}`);

    // Check if we have today's ranking in the database
    const { data: existingData, error: dbError } = await supabase
      .from('app_rankings_history')
      .select('date, rank, category, category_name, chart_type')
      .eq('app_id', appId)
      .eq('country', country)
      .eq('device', device)
      .eq('date', today);

    if (dbError) {
      console.error('Database query error:', dbError);
    }

    // If we have today's data, return it from cache
    if (existingData && existingData.length > 0) {
      console.log(`Returning ${existingData.length} cached rankings for today`);
      
      const formattedResponse = {
        result: {
          [appId]: {
            ranking: existingData.map(d => ({
              value: d.rank,
              date: d.date,
              category: d.category,
              category_name: d.category_name,
              chart_type: d.chart_type,
              fetch_depth: 200,
            })),
          },
        },
      };

      return new Response(
        JSON.stringify(formattedResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No cached data for today, fetch from API
    console.log(`No cache for today, fetching from API for app ${appId}`);

    const url = new URL(BASE_URL);
    url.searchParams.set('apps', appId);
    url.searchParams.set('country', country);
    url.searchParams.set('device', device);

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
    console.log('AppTweak response:', JSON.stringify(data).substring(0, 500));

    // Store new rankings in database
    const rankings = data?.result?.[appId]?.ranking || [];
    const recordsToInsert = rankings.map((r: {
      value: number;
      date: string;
      category: string;
      category_name: string;
      chart_type: string;
    }) => ({
      app_id: appId,
      date: r.date,
      rank: r.value,
      category: r.category,
      category_name: r.category_name,
      chart_type: r.chart_type,
      country,
      device,
    }));

    if (recordsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('app_rankings_history')
        .upsert(recordsToInsert, { onConflict: 'app_id,date,category,chart_type,country,device' });

      if (insertError) {
        console.error('Failed to cache rankings:', insertError);
      } else {
        console.log(`Cached ${recordsToInsert.length} rankings for today`);
      }
    }

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
