import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const POLYMARKET_APP_ID = "6648798962";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const appTweakApiKey = Deno.env.get('APPTWEAK_API_KEY');
    const googleSheetsUrl = Deno.env.get('GOOGLE_SHEETS_WEB_APP_URL');

    if (!appTweakApiKey) {
      throw new Error('Missing APPTWEAK_API_KEY');
    }
    if (!googleSheetsUrl) {
      throw new Error('Missing GOOGLE_SHEETS_WEB_APP_URL');
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`Fetching Polymarket rank for ${today}`);

    // Fetch ranking from AppTweak
    const appTweakUrl = `https://public-api.apptweak.com/api/public/store/apps/category-rankings/history.json?apps=${POLYMARKET_APP_ID}&country=us&device=iphone&start_date=${today}&end_date=${today}`;
    
    const response = await fetch(appTweakUrl, {
      headers: {
        'X-Apptweak-Key': appTweakApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AppTweak API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Parse the response to find rank for category 6004 (All) and chart_type free
    const appData = data?.result?.[POLYMARKET_APP_ID];
    if (!appData?.rankings) {
      console.log('No ranking data found for today');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No ranking data available for today yet',
        date: today 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the ranking for category 6004 and chart_type free
    let targetRank = null;
    for (const ranking of appData.rankings) {
      for (const value of ranking.value) {
        if (value.category === "6004" && value.chart_type === "free") {
          targetRank = {
            date: value.fetch_date,
            app_id: POLYMARKET_APP_ID,
            category: value.category,
            category_name: value.category_name,
            rank: value.rank,
            chart_type: value.chart_type,
            country: 'us',
            device: 'iphone',
          };
          break;
        }
      }
      if (targetRank) break;
    }

    if (!targetRank) {
      console.log('No rank found for category 6004 (All) with chart_type free');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No rank found for category All (6004) today',
        date: today 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found rank: ${targetRank.rank} for category ${targetRank.category_name}`);

    // Format row for Google Sheets
    const row = [
      targetRank.date,
      targetRank.app_id,
      targetRank.category,
      targetRank.category_name,
      targetRank.rank,
      targetRank.chart_type,
      targetRank.country,
      targetRank.device,
    ];

    // Send to Google Sheets
    const sheetsResponse = await fetch(googleSheetsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows: [row] }),
    });

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text();
      throw new Error(`Google Sheets error: ${sheetsResponse.status} - ${errorText}`);
    }

    const sheetsResult = await sheetsResponse.json();
    
    console.log('Successfully synced Polymarket rank to Google Sheets:', targetRank);

    return new Response(JSON.stringify({
      success: true,
      message: 'Polymarket rank synced to Google Sheets',
      data: targetRank,
      sheetsResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error syncing Polymarket rank:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
