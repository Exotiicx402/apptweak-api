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
    const { appId, country = 'us', device = 'iphone', metrics = 'downloads', startDate, endDate } = await req.json();
    
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

    // Default to last 7 days if no dates provided
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Checking database for ${appId} downloads from ${start} to ${end}`);

    // Query existing data from database
    const { data: existingData, error: dbError } = await supabase
      .from('app_downloads_history')
      .select('date, downloads')
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

    let newData: { date: string; downloads: number }[] = [];

    // Only call API if we have missing dates
    if (missingDates.length > 0) {
      const missingStart = missingDates[0];
      const missingEnd = missingDates[missingDates.length - 1];
      
      console.log(`Fetching from API for dates ${missingStart} to ${missingEnd}`);
      
      const url = `https://public-api.apptweak.com/api/public/store/apps/metrics/history.json?apps=${appId}&metrics=${metrics}&country=${country}&device=${device}&start_date=${missingStart}&end_date=${missingEnd}`;
      
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
      console.log('App metrics history response:', JSON.stringify(data).substring(0, 500));

      // Extract downloads from API response
      const apiDownloads = data?.result?.[appId]?.downloads || [];
      
      // Store new data in database
      const recordsToInsert = apiDownloads
        .filter((d: { value: number | null; date: string }) => d.value !== null)
        .map((d: { value: number; date: string }) => ({
          app_id: appId,
          date: d.date,
          downloads: d.value,
          country,
          device,
        }));

      if (recordsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('app_downloads_history')
          .upsert(recordsToInsert, { onConflict: 'app_id,date,country,device' });

        if (insertError) {
          console.error('Failed to cache data:', insertError);
        } else {
          console.log(`Cached ${recordsToInsert.length} new records`);
        }
      }

      newData = apiDownloads.map((d: { value: number; date: string }) => ({
        date: d.date,
        downloads: d.value,
      }));
    }

    // Combine existing and new data
    const allDownloads = [
      ...(existingData?.map(d => ({ date: d.date, downloads: d.downloads })) || []),
      ...newData.filter(d => !existingDates.has(d.date)),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Format response to match the original API format
    const formattedResponse = {
      result: {
        [appId]: {
          downloads: allDownloads.map(d => ({
            value: d.downloads,
            date: d.date,
            precision: 1,
          })),
        },
      },
    };

    return new Response(JSON.stringify(formattedResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in apptweak-metrics-history:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
