import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdLibraryRequest {
  pageIds: string[];
  adActiveStatus?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  limit?: number;
}

interface CompetitorAd {
  id: string;
  pageId: string;
  pageName: string;
  body: string;
  snapshotUrl: string;
  platforms: string[];
  startDate: string | null;
  stopDate: string | null;
  daysRunning: number | null;
  impressionsRange: string | null;
}

function calcDaysRunning(startDate: string | null, stopDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  const end = stopDate ? new Date(stopDate) : new Date();
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatImpressionsRange(impressions: { lower_bound?: string; upper_bound?: string } | null): string | null {
  if (!impressions) return null;
  const lower = impressions.lower_bound;
  const upper = impressions.upper_bound;
  if (!lower) return null;
  if (!upper) return `${lower}+`;

  const fmt = (n: string) => {
    const num = parseInt(n);
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
    return n;
  };
  return `${fmt(lower)}–${fmt(upper)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('META_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'META_ACCESS_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: AdLibraryRequest = await req.json();
    const { pageIds, adActiveStatus = 'ACTIVE', limit = 20 } = body;

    if (!pageIds || pageIds.length === 0) {
      return new Response(JSON.stringify({ ads: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Meta allows up to 10 page IDs per request — batch them
    const BATCH_SIZE = 10;
    const batches: string[][] = [];
    for (let i = 0; i < pageIds.length; i += BATCH_SIZE) {
      batches.push(pageIds.slice(i, i + BATCH_SIZE));
    }

    const allAds: CompetitorAd[] = [];

    for (const batch of batches) {
      const fields = [
        'id',
        'ad_creative_body',
        'ad_snapshot_url',
        'page_id',
        'page_name',
        'publisher_platforms',
        'ad_delivery_date_start',
        'ad_delivery_date_stop',
        'impressions',
      ].join(',');

      const params = new URLSearchParams({
        search_page_ids: batch.join(','),
        ad_type: 'ALL',
        ad_reached_countries: "['US']",
        ad_active_status: adActiveStatus,
        fields,
        access_token: accessToken,
        limit: String(Math.min(limit, 50)),
      });

      const url = `https://graph.facebook.com/v19.0/ads_archive?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        console.error('Meta API error:', data.error);
        // Continue with other batches even if one fails
        continue;
      }

      const ads: CompetitorAd[] = (data.data || []).map((ad: Record<string, unknown>) => ({
        id: ad.id as string,
        pageId: ad.page_id as string,
        pageName: (ad.page_name as string) || '',
        body: ((ad.ad_creative_body as string) || '').slice(0, 300),
        snapshotUrl: (ad.ad_snapshot_url as string) || '',
        platforms: (ad.publisher_platforms as string[]) || [],
        startDate: (ad.ad_delivery_date_start as string) || null,
        stopDate: (ad.ad_delivery_date_stop as string) || null,
        daysRunning: calcDaysRunning(
          (ad.ad_delivery_date_start as string) || null,
          (ad.ad_delivery_date_stop as string) || null
        ),
        impressionsRange: formatImpressionsRange(
          ad.impressions as { lower_bound?: string; upper_bound?: string } | null
        ),
      }));

      allAds.push(...ads);
    }

    // Sort: longest running first
    allAds.sort((a, b) => (b.daysRunning ?? 0) - (a.daysRunning ?? 0));

    return new Response(JSON.stringify({ success: true, ads: allAds, total: allAds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('competitor-ad-library error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
