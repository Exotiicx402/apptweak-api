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

    // Search ads by keyword, extract unique pages from results
    // (Meta Ad Library doesn't support PAGES search_type — only KEYWORD_UNORDERED / KEYWORD_EXACT_PHRASE)
    const params = new URLSearchParams({
      search_type: 'KEYWORD_UNORDERED',
      q: query.trim(),
      ad_reached_countries: '["US"]',
      ad_active_status: 'ALL',
      fields: 'page_id,page_name',
      access_token: accessToken,
      limit: '50',
    });

    const url = `https://graph.facebook.com/v19.0/ads_archive?${params}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Meta Ad Library search error:', data.error);
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
