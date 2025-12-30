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
    const { appId, country = 'us', device = 'iphone', startDate, endDate } = await req.json();
    
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

    // Default to last 30 days if no dates provided
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Checking database for ${appId} rankings from ${start} to ${end}`);

    // Query existing data from database
    const { data: existingData, error: dbError } = await supabase
      .from('app_rankings_history')
      .select('date, rank, category, category_name, chart_type')
      .eq('app_id', appId)
      .eq('country', country)
      .eq('device', device)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });

    if (dbError) {
      console.error('Database query error:', dbError);
    }

    // Build a set of dates we already have
    const existingDates = new Set(existingData?.map(d => d.date) || []);
    
    // Generate all dates in range
    const allDates: string[] = [];
    const currentDate = new Date(start);
    const endDateObj = new Date(end);
    while (currentDate <= endDateObj) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Find missing dates
    const missingDates = allDates.filter(d => !existingDates.has(d));
    
    console.log(`Found ${existingData?.length || 0} cached records, missing ${missingDates.length} dates`);

    interface RankingValue {
      rank: number;
      fetch_date: string;
      category: string;
      category_name: string;
      chart_type: string;
      fetch_depth: number;
    }

    let newData: RankingValue[] = [];

    // Only call API if we have missing dates
    if (missingDates.length > 0) {
      const missingStart = missingDates[0];
      const missingEnd = missingDates[missingDates.length - 1];
      
      console.log(`Fetching from API for dates ${missingStart} to ${missingEnd}`);
      
      const url = `https://public-api.apptweak.com/api/public/store/apps/category-rankings/history.json?apps=${appId}&country=${country}&device=${device}&start_date=${missingStart}&end_date=${missingEnd}`;
      
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

      // Extract rankings from API response
      const apiRankings = data?.result?.[appId]?.rankings || [];
      
      // Flatten and store new data in database
      const recordsToInsert: {
        app_id: string;
        date: string;
        rank: number;
        category: string;
        category_name: string;
        chart_type: string;
        country: string;
        device: string;
      }[] = [];
      
      for (const ranking of apiRankings) {
        for (const value of ranking.value || []) {
          if (value.rank && !existingDates.has(value.fetch_date)) {
            recordsToInsert.push({
              app_id: appId,
              date: value.fetch_date,
              rank: value.rank,
              category: value.category,
              category_name: value.category_name,
              chart_type: value.chart_type,
              country,
              device,
            });
            newData.push(value);
          }
        }
      }

      if (recordsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('app_rankings_history')
          .upsert(recordsToInsert, { onConflict: 'app_id,date,category,chart_type,country,device' });

        if (insertError) {
          console.error('Failed to cache data:', insertError);
        } else {
          console.log(`Cached ${recordsToInsert.length} new records`);
        }
      }
    }

    // Combine existing and new data - group by date
    const rankingsByDate = new Map<string, RankingValue[]>();
    
    // Add existing data
    for (const d of existingData || []) {
      const values = rankingsByDate.get(d.date) || [];
      values.push({
        rank: d.rank,
        fetch_date: d.date,
        category: d.category,
        category_name: d.category_name,
        chart_type: d.chart_type,
        fetch_depth: 200,
      });
      rankingsByDate.set(d.date, values);
    }
    
    // Add new data
    for (const d of newData) {
      if (!existingDates.has(d.fetch_date)) {
        const values = rankingsByDate.get(d.fetch_date) || [];
        values.push(d);
        rankingsByDate.set(d.fetch_date, values);
      }
    }

    // Sort and format response to match the original API format
    const sortedDates = Array.from(rankingsByDate.keys()).sort();
    const formattedRankings = sortedDates.map(date => ({
      value: rankingsByDate.get(date) || [],
    }));

    const formattedResponse = {
      result: {
        [appId]: {
          rankings: formattedRankings,
        },
      },
    };

    return new Response(JSON.stringify(formattedResponse), {
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
