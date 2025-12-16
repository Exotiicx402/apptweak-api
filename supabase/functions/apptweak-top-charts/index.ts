import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchMetadata(apiKey: string, appIds: string[], country: string, device: string) {
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
    if (!apiKey) {
      throw new Error('APPTWEAK_API_KEY not configured');
    }

    const url = new URL(req.url);
    const country = url.searchParams.get('country') || 'us';
    const device = url.searchParams.get('device') || 'iphone';
    const category = url.searchParams.get('category') || '6004';

    console.log(`Fetching top charts for category ${category} in ${country} on ${device}`);

    // Fetch top charts
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
    
    // Fetch metadata for apps (batch by 5 - API limit)
    const metadataMap: Record<string, { title: string; icon: string }> = {};
    
    // Only fetch metadata for first 50 apps to limit API calls
    const idsToFetch = appIds.slice(0, 50);
    const batches: string[][] = [];
    
    for (let i = 0; i < idsToFetch.length; i += 5) {
      batches.push(idsToFetch.slice(i, i + 5));
    }
    
    console.log(`Fetching metadata for ${idsToFetch.length} apps in ${batches.length} batches`);
    
    // Fetch all batches in parallel
    const metadataResults = await Promise.all(
      batches.map(batch => fetchMetadata(apiKey, batch, country, device))
    );
    
    // Merge results
    for (const result of metadataResults) {
      for (const [appId, data] of Object.entries(result)) {
        const metadata = (data as any)?.metadata;
        if (metadata) {
          metadataMap[appId] = {
            title: metadata.title || `App ${appId}`,
            icon: metadata.icon || '',
          };
        }
      }
    }
    
    console.log(`Fetched metadata for ${Object.keys(metadataMap).length} apps`);

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
