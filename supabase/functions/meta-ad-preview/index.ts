import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { creativeId, adFormat } = await req.json();

    if (!creativeId) {
      throw new Error('creativeId is required');
    }

    const accessToken = Deno.env.get('META_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('META_ACCESS_TOKEN not configured');
    }

    // Meta Ad Preview API - fetch iframe preview for an ad creative
    // ad_format options: DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD, INSTAGRAM_STANDARD, etc.
    const format = adFormat || 'MOBILE_FEED_STANDARD';
    const url = `https://graph.facebook.com/v19.0/${creativeId}/previews?ad_format=${format}&access_token=${accessToken}`;

    console.log(`Fetching Meta preview for creative ${creativeId} (format: ${format})`);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Meta preview API error:', response.status, errorText);
      throw new Error(`Meta API error: ${response.status}`);
    }

    const data = await response.json();
    const previewData = data.data?.[0];

    if (!previewData?.body) {
      throw new Error('No preview available for this creative');
    }

    // The body contains an iframe HTML snippet — extract the src URL
    const iframeMatch = previewData.body.match(/src="([^"]+)"/);
    const iframeSrc = iframeMatch ? iframeMatch[1].replace(/&amp;/g, '&') : null;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          body: previewData.body,
          iframeSrc,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in meta-ad-preview:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
