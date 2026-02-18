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

    const params = new URLSearchParams({
      q: query.trim(),
      fields: 'id,name,category,fan_count,verification_status,picture',
      access_token: accessToken,
      limit: '8',
    });

    const url = `https://graph.facebook.com/v19.0/pages/search?${params}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Meta API error:', data.error);
      return new Response(JSON.stringify({ error: data.error.message, results: [] }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = (data.data || []).map((page: any) => ({
      id: page.id,
      name: page.name,
      category: page.category || null,
      fanCount: page.fan_count || 0,
      verified: page.verification_status === 'blue_verified' || page.verification_status === 'gray_verified',
      pictureUrl: page.picture?.data?.url || null,
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
