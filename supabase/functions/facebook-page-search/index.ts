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

    // Use Ad Library's advertiser/page search — works with the same token as ads_archive
    const params = new URLSearchParams({
      search_type: 'PAGES',
      q: query.trim(),
      fields: 'id,name,page_categories,page_like_count,verification_status,page_profile_picture_url',
      access_token: accessToken,
      limit: '8',
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

    const results = (data.data || []).map((page: any) => ({
      id: page.id,
      name: page.name,
      category: page.page_categories ? Object.values(page.page_categories)[0] : null,
      fanCount: page.page_like_count || 0,
      verified: page.verification_status === 'blue_verified' || page.verification_status === 'gray_verified',
      pictureUrl: page.page_profile_picture_url || null,
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
