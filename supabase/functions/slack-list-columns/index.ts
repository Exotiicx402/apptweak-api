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

  // Try to create a new column
  const resp = await fetch(`https://slack.com/api/slackLists.columns.create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      list_id: SLACK_LIST_ID,
      column_name: "Source Message",
      column_type: "url",
    }),
  });
  const data = await resp.json();

  // Return full first item to see column structure
  return new Response(JSON.stringify({
    ok: data.ok,
    first_item: data.items?.[0] || null,
    response_metadata: data.response_metadata || null,
    error: data.error || null,
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
