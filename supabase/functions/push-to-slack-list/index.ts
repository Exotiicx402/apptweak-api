import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { request_id, debug } = await req.json();
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

    // If debug mode, fetch list schema first
    if (debug) {
      const schemaResp = await fetch(`${SLACK_API}/slackLists.items.list?list_id=${SLACK_LIST_ID}&limit=1`, {
        headers: slackHeaders,
      });
      const schemaData = await schemaResp.json();
      console.log("List schema response:", JSON.stringify(schemaData, null, 2));
      return new Response(
        JSON.stringify({ debug: true, schema: schemaData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const richText = (text: string) => [{
      type: "rich_text",
      block_id: crypto.randomUUID().slice(0, 5),
      elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
    }];

    const priorityRichText = [{
      type: "rich_text",
      block_id: crypto.randomUUID().slice(0, 5),
      elements: [{
        type: "rich_text_section",
        elements: r.priority === "High"
          ? [{ type: "emoji", name: "red_circle", unicode: "1f534" }, { type: "text", text: " High" }]
          : [{ type: "emoji", name: "large_yellow_circle", unicode: "1f7e1" }, { type: "text", text: " Normal" }],
      }],
    }];

    const shortDesc = (r.description || "").slice(0, 60);
    const userIdClean = (r.requester || "").replace(/<@|>/g, "");

    // Try as object map instead of array
    const initialFields: Record<string, any> = {
      name: richText(shortDesc),
      Col09RPSC7FTN: richText(r.description || ""),
      Col07QP76TBQD: richText(r.platform || "Not specified"),
      Col09RL9S2DNW: richText(r.format || "Not specified"),
      Col09RDTELGN7: priorityRichText,
      Col07QKEDLLAJ: String(Math.floor(Date.now() / 1000)),
    };

    if (userIdClean) {
      initialFields["Col07R4P97PPB"] = userIdClean;
    }

    const requestBody = { list_id: SLACK_LIST_ID, initial_fields: initialFields };
    console.log("Sending to Slack Lists API:", JSON.stringify(requestBody, null, 2));

    const listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify(requestBody),
    });

    const listData = await listResp.json();
    console.log("Slack Lists API response:", JSON.stringify(listData, null, 2));

    if (!listData.ok) {
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
