import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLACK_API = "https://slack.com/api";
const SLACK_LIST_ID = "F09R4RD9G5D";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("POLYMARKET_SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) throw new Error("POLYMARKET_SLACK_BOT_TOKEN is not configured");

    const { request_id } = await req.json();
    if (!request_id) throw new Error("request_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: r, error } = await supabase
      .from("creative_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (error || !r) throw new Error("Request not found");

    const slackHeaders = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    const richText = (text: string) => JSON.stringify([{
      type: "rich_text",
      block_id: crypto.randomUUID().slice(0, 5),
      elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
    }]);

    const priorityRichText = JSON.stringify([{
      type: "rich_text",
      block_id: crypto.randomUUID().slice(0, 5),
      elements: [{
        type: "rich_text_section",
        elements: r.priority === "High"
          ? [{ type: "emoji", name: "red_circle", unicode: "1f534" }, { type: "text", text: " High" }]
          : [{ type: "emoji", name: "large_yellow_circle", unicode: "1f7e1" }, { type: "text", text: " Normal" }],
      }],
    }]);

    const shortDesc = (r.description || "").slice(0, 60);
    const userIdClean = (r.requester || "").replace(/<@|>/g, "");

    const initialFields = [
      { key: "name", value: richText(shortDesc) },
      { key: "Col09RPSC7FTN", value: richText(r.description || "") },
      { key: "Col07QP76TBQD", value: richText(r.platform || "Not specified") },
      { key: "Col09RL9S2DNW", value: richText(r.format || "Not specified") },
      { key: "Col09RDTELGN7", value: priorityRichText },
      ...(userIdClean ? [{ key: "Col07R4P97PPB", value: userIdClean }] : []),
      { key: "Col07QKEDLLAJ", value: String(Math.floor(Date.now() / 1000)) },
    ];

    const listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify({ list_id: SLACK_LIST_ID, initial_fields: initialFields }),
    });

    const listData = await listResp.json();
    if (!listData.ok) {
      console.error("Slack List API error:", listData);
      throw new Error(`Slack List error: ${listData.error || JSON.stringify(listData)}`);
    }

    console.log("Added item to Slack List:", listData.item?.id);

    return new Response(
      JSON.stringify({ success: true, item_id: listData.item?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
