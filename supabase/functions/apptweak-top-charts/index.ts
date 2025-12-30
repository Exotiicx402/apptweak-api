import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchMetadataFromApi(apiKey: string, appIds: string[], country: string, device: string) {
  const appsParam = appIds.join(',');
  const metadataUrl = `https://public-api.apptweak.com/api/public/store/apps/metadata.json?apps=${appsParam}&country=${country}&device=${device}`;
  
  const response = await fetch(metadataUrl, {
    headers: { 'X-Apptweak-Key': apiKey },
  });
  
  if (!response.ok) {
    console.error('Metadata API error:', await response.text());
    return {};
  }
  
  const data = await response.json();
  return data.result || {};
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('APPTWEAK_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!apiKey) {
      throw new Error('APPTWEAK_API_KEY not configured');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Database not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const country = url.searchParams.get('country') || 'us';
    const device = url.searchParams.get('device') || 'iphone';
    const category = url.searchParams.get('category') || '6004';

    console.log(`Fetching top charts for category ${category} in ${country} on ${device}`);

    // Fetch top charts (this always needs to be current, so we fetch from API)
    const chartsUrl = `https://public-api.apptweak.com/api/public/store/charts/top-results/current.json?categories=${category}&types=free&country=${country}&device=${device}`;
    const chartsResponse = await fetch(chartsUrl, {
      headers: { 'X-Apptweak-Key': apiKey },
    });

    if (!chartsResponse.ok) {
      const errorText = await chartsResponse.text();
      console.error('AppTweak API error:', errorText);
      throw new Error(`AppTweak API error: ${chartsResponse.status}`);
    }

    const chartsData = await chartsResponse.json();
    console.log('AppTweak top charts response received');

    // Extract app IDs from top charts
    const categoryData = chartsData.result?.[category]?.free;
    const appIds: string[] = categoryData?.value?.map((id: number) => String(id)) || [];
    
    // Only process first 50 apps to limit API calls
    const idsToProcess = appIds.slice(0, 50);
    
    // Check which apps we already have metadata for
    const { data: cachedMetadata, error: dbError } = await supabase
      .from('app_metadata')
      .select('app_id, title, icon')
      .in('app_id', idsToProcess);

    if (dbError) {
      console.error('Database query error:', dbError);
    }

    const cachedMap = new Map<string, { title: string; icon: string }>();
    for (const m of cachedMetadata || []) {
      cachedMap.set(m.app_id, { title: m.title, icon: m.icon });
    }

    // Find apps that need metadata fetched
    const uncachedIds = idsToProcess.filter(id => !cachedMap.has(id));
    
    console.log(`Found ${cachedMap.size} cached, need to fetch ${uncachedIds.length} from API`);

    // Fetch metadata for uncached apps
    const metadataMap: Record<string, { title: string; icon: string }> = {};
    
    // Add cached metadata to result
    for (const [appId, data] of cachedMap) {
      metadataMap[appId] = data;
    }

    if (uncachedIds.length > 0) {
      // Batch by 5 (API limit)
      const batches: string[][] = [];
      for (let i = 0; i < uncachedIds.length; i += 5) {
        batches.push(uncachedIds.slice(i, i + 5));
      }
      
      console.log(`Fetching metadata for ${uncachedIds.length} apps in ${batches.length} batches`);
      
      // Fetch all batches in parallel
      const metadataResults = await Promise.all(
        batches.map(batch => fetchMetadataFromApi(apiKey, batch, country, device))
      );
      
      // Merge results and prepare for database insert
      const recordsToInsert: { app_id: string; title: string; icon: string }[] = [];
      
      for (const result of metadataResults) {
        for (const [appId, data] of Object.entries(result)) {
          const metadata = (data as any)?.metadata;
          if (metadata) {
            const title = metadata.title || `App ${appId}`;
            const icon = metadata.icon || '';
            
            metadataMap[appId] = { title, icon };
            recordsToInsert.push({ app_id: appId, title, icon });
          }
        }
      }
      
      // Cache the new metadata
      if (recordsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('app_metadata')
          .upsert(recordsToInsert, { onConflict: 'app_id' });

        if (insertError) {
          console.error('Failed to cache metadata:', insertError);
        } else {
          console.log(`Cached metadata for ${recordsToInsert.length} apps`);
        }
      }
    }
    
    console.log(`Returning metadata for ${Object.keys(metadataMap).length} apps`);

    return new Response(JSON.stringify({
      result: chartsData.result,
      metadata: metadataMap,
    }), {
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
