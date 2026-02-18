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

function mapAds(rawAds: any[]): CompetitorAd[] {
  return rawAds.map((ad) => {
    const bodies = ad.ad_creative_bodies as string[] | null;
    const body = Array.isArray(bodies) ? bodies[0] || '' : '';
    return {
      id: ad.id as string,
      pageId: ad.page_id as string,
      pageName: (ad.page_name as string) || '',
      body: body.slice(0, 300),
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
    };
  });
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

    const fields = [
      'id',
      'ad_creative_bodies',
      'ad_snapshot_url',
      'page_id',
      'page_name',
      'publisher_platforms',
      'ad_delivery_date_start',
      'ad_delivery_date_stop',
      'impressions',
    ].join(',');

    const allAds: CompetitorAd[] = [];

    // Strategy 1: search_page_ids — catches ads Meta classifies as special category (financial, political, etc.)
    const BATCH_SIZE = 10;
    for (let i = 0; i < pageIds.length; i += BATCH_SIZE) {
      const batch = pageIds.slice(i, i + BATCH_SIZE);
      for (const adType of ['ALL', 'FINANCIAL_PRODUCTS_AND_SERVICES_ADS']) {
        const params = new URLSearchParams({
          search_page_ids: batch.join(','),
          ad_type: adType,
          ad_reached_countries: '["US"]',
          ad_active_status: adActiveStatus,
          fields,
          access_token: accessToken,
          limit: String(Math.min(limit, 50)),
        });
        const res = await fetch(`https://graph.facebook.com/v19.0/ads_archive?${params}`);
        const data = await res.json();
        if (!data.error && data.data) {
          console.log(`search_page_ids (${adType}): ${data.data.length} ads`);
          allAds.push(...mapAds(data.data));
        } else if (data.error) {
          console.error(`search_page_ids error (${adType}):`, data.error.message);
        }
      }
    }

    // Strategy 2: keyword search by page name — catches regular (non-special-category) ads
    // Collect page names from strategy 1 results or use a fallback keyword search per page
    const pageIdSet = new Set(pageIds);
    // Build page name map from what we got so far
    const pageNameMap = new Map<string, string>();
    allAds.forEach((ad) => { if (ad.pageName && pageIdSet.has(ad.pageId)) pageNameMap.set(ad.pageId, ad.pageName); });

    // For pages we found names for, do a keyword search to find non-special-category ads
    for (const [pageId, pageName] of pageNameMap.entries()) {
      // Use first meaningful word (skip generic words)
      const words = pageName.split(/\s+/).filter(w => w.length > 3);
      const keyword = words[0] || pageName.split(' ')[0];
      if (!keyword) continue;

      const params = new URLSearchParams({
        search_terms: keyword,
        search_type: 'KEYWORD_UNORDERED',
        ad_reached_countries: '["US"]',
        ad_active_status: adActiveStatus,
        fields,
        access_token: accessToken,
        limit: '50',
      });
      const res = await fetch(`https://graph.facebook.com/v19.0/ads_archive?${params}`);
      const data = await res.json();
      if (!data.error && data.data) {
        // Only keep ads that belong to this specific page
        const pageAds = (data.data as any[]).filter((ad: any) => ad.page_id === pageId);
        console.log(`keyword "${keyword}" for page ${pageId}: ${pageAds.length}/${data.data.length} ads matched`);
        allAds.push(...mapAds(pageAds));
      }
    }

    // Deduplicate by ad id
    const seen = new Set<string>();
    const uniqueAds = allAds.filter((ad) => {
      if (seen.has(ad.id)) return false;
      seen.add(ad.id);
      return true;
    });

    uniqueAds.sort((a, b) => (b.daysRunning ?? 0) - (a.daysRunning ?? 0));
    console.log(`Returning ${uniqueAds.length} unique ads total`);

    return new Response(JSON.stringify({ success: true, ads: uniqueAds, total: uniqueAds.length }), {
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
