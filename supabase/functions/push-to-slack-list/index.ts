import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_API = "https://slack.com/api";
const SLACK_LIST_ID = "F09R4RD9G5D";

const toRichText = (text: string) => [
  {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [{ type: "text", text }],
      },
    ],
  },
];

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

    const { data: request, error } = await supabase
      .from("creative_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (error || !request) throw new Error("Request not found");

    const slackHeaders = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    if (debug) {
      const schemaResp = await fetch(`${SLACK_API}/slackLists.items.list`, {
        method: "POST",
        headers: slackHeaders,
        body: JSON.stringify({ list_id: SLACK_LIST_ID, limit: 10 }),
      });
      const schemaData = await schemaResp.json();
      return new Response(JSON.stringify({ debug: true, schema: schemaData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const initialFields = [
      { column_id: "Col09R4RW383Z", rich_text: toRichText(request.description || "") },
      { column_id: "Col09RJ7Z6V70", rich_text: toRichText(request.platform || "Not specified") },
      { column_id: "Col09RZ6VGHB3", rich_text: toRichText(request.format || "Not specified") },
    ];

    const createWithFieldsBody = {
      list_id: SLACK_LIST_ID,
      initial_fields: initialFields,
    };

    let listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify(createWithFieldsBody),
    });

    let listData = await listResp.json();
    let fallbackUsed = false;
    console.log("Create with fields response:", JSON.stringify(listData));

    if (!listData.ok) {
      fallbackUsed = true;
      console.warn("Falling back to minimal list item create", listData);

      listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
        method: "POST",
        headers: slackHeaders,
        body: JSON.stringify({ list_id: SLACK_LIST_ID }),
      });

      listData = await listResp.json();
      console.log("Fallback minimal create response:", JSON.stringify(listData));
    }

    if (!listData.ok) {
      throw new Error(`Slack List error: ${listData.error || JSON.stringify(listData)}`);
    }

    return new Response(
      JSON.stringify({ success: true, item_id: listData.item?.id, fallback_used: fallbackUsed }),
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
