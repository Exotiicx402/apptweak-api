import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const SLACK_BOT_TOKEN = Deno.env.get("POLYMARKET_SLACK_BOT_TOKEN");
  if (!SLACK_BOT_TOKEN) return new Response("No token", { status: 500 });

  // Get list items to see the field structure
  const resp = await fetch("https://slack.com/api/slackLists.items.list", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ list_id: "F09R4RD9G5D", limit: 1 }),
  });

  const data = await resp.json();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
