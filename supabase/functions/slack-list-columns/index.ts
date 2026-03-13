import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SLACK_BOT_TOKEN = Deno.env.get("POLYMARKET_SLACK_BOT_TOKEN");
  const SLACK_LIST_ID = "F09R4RD9G5D";

  // Try to get list info/items to see column structure
  const resp = await fetch(`https://slack.com/api/slackLists.items.list`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ list_id: SLACK_LIST_ID, limit: 1 }),
  });
  const data = await resp.json();

  // Extract column info from the response
  return new Response(JSON.stringify({
    ok: data.ok,
    columns: data.columns || null,
    column_order: data.column_order || null,
    // If items have fields, show the first item's field keys
    sample_item_fields: data.items?.[0]?.fields ? Object.keys(data.items[0].fields) : null,
    raw_keys: data ? Object.keys(data) : null,
    error: data.error || null,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
