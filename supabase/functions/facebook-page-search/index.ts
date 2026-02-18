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
    const { query } = await req.json();

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = Deno.env.get('META_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'META_ACCESS_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The Ad Library API uses `search_terms` (not `q`) and only supports
    // KEYWORD_UNORDERED / KEYWORD_EXACT_PHRASE for search_type.
    // We search ads by the brand name as a keyword, then deduplicate by page_id
    // to surface a list of matching advertiser pages.
    const params = new URLSearchParams({
      search_terms: query.trim(),
      search_type: 'KEYWORD_UNORDERED',
      ad_reached_countries: '["US"]',
      ad_active_status: 'ALL',
      fields: 'page_id,page_name',
      access_token: accessToken,
      limit: '50',
    });

    const url = `https://graph.facebook.com/v19.0/ads_archive?${params}`;
    console.log('Calling Meta Ad Library:', url.replace(accessToken, '[REDACTED]'));

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Meta Ad Library error:', JSON.stringify(data.error));
      return new Response(JSON.stringify({ error: data.error.message, results: [] }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduplicate pages by page_id, keep first occurrence
    const seen = new Set<string>();
    const results = (data.data || [])
      .filter((ad: any) => {
        if (!ad.page_id || seen.has(ad.page_id)) return false;
        seen.add(ad.page_id);
        return true;
      })
      .slice(0, 8)
      .map((ad: any) => ({
        id: ad.page_id,
        name: ad.page_name,
        category: null,
        fanCount: 0,
        verified: false,
        pictureUrl: null,
      }));

    console.log(`Found ${results.length} unique pages for query: "${query}"`);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err), results: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
