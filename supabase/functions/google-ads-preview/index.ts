import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split("T")[0];
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google OAuth credentials");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchGoogleAdsData(date: string, accessToken: string): Promise<any[]> {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");

  if (!developerToken || !customerId) {
    throw new Error("Missing Google Ads credentials (GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_CUSTOMER_ID)");
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      segments.date
    FROM campaign
    WHERE segments.date = '${date}'
    AND campaign.status != 'REMOVED'
  `;

  const response = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    
    // Check for scope-related errors
    if (errorText.includes("USER_PERMISSION_DENIED") || errorText.includes("OAUTH_TOKEN_INVALID")) {
      throw new Error(
        `Google Ads API access denied. Your GOOGLE_REFRESH_TOKEN may need to be regenerated with the Google Ads API scope (https://www.googleapis.com/auth/adwords). Error: ${errorText}`
      );
    }
    
    throw new Error(`Google Ads API error: ${errorText}`);
  }

  const data = await response.json();
  const results: any[] = [];

  // Google Ads searchStream returns an array of result batches
  if (Array.isArray(data)) {
    for (const batch of data) {
      if (batch.results) {
        for (const result of batch.results) {
          const campaign = result.campaign || {};
          const metrics = result.metrics || {};
          const segments = result.segments || {};

          const costMicros = Number(metrics.costMicros || 0);
          const spend = costMicros / 1_000_000;
          const installs = Number(metrics.conversions || 0);
          const impressions = Number(metrics.impressions || 0);
          const clicks = Number(metrics.clicks || 0);

          results.push({
            campaign_id: campaign.id?.toString() || "",
            campaign_name: campaign.name || "",
            impressions,
            clicks,
            cost_micros: costMicros,
            spend: spend.toFixed(2),
            installs: Math.round(installs),
            cpi: installs > 0 ? (spend / installs).toFixed(2) : "0.00",
            ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0.00",
            date: segments.date || date,
          });
        }
      }
    }
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    let targetDate = getYesterdayDate();

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.date) {
          targetDate = body.date;
        }
      } catch {
        // Use default date if body parsing fails
      }
    }

    console.log(`Fetching Google Ads data for ${targetDate}`);

    const accessToken = await getAccessToken();
    const data = await fetchGoogleAdsData(targetDate, accessToken);

    const durationMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        data,
        rowCount: data.length,
        durationMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error:", err);
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        durationMs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
