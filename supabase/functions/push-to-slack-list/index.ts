import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_API = "https://slack.com/api";
const SLACK_LIST_ID = "F09R4RD9G5D";

// Column IDs
const COL_NAME = "Col09RPRVKYUC";
const COL_DESCRIPTION = "Col09R4RW383Z";
const COL_PLATFORM = "Col09RJ7Z6V70";
const COL_FORMAT = "Col09RZ6VGHB3";
const COL_STATUS = "Col09RJ959822";
const OPT_NEW = "Opt1IOIRNGD";

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

const generateTitle = (description: string): string => {
  if (!description) return "Creative Request";
  const firstLine = description.split("\n")[0].trim();
  if (firstLine.length <= 70) return firstLine;
  return firstLine.substring(0, 67) + "...";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("POLYMARKET_SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) throw new Error("POLYMARKET_SLACK_BOT_TOKEN is not configured");

    const { request_id, debug } = await req.json();

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

    const title = generateTitle(request.description || "");

    const initialFields = [
      { column_id: COL_NAME, rich_text: toRichText(title) },
      { column_id: COL_DESCRIPTION, rich_text: toRichText(request.description || "") },
      { column_id: COL_PLATFORM, rich_text: toRichText(request.platform || "Not specified") },
      { column_id: COL_FORMAT, rich_text: toRichText(request.format || "Not specified") },
      { column_id: COL_STATUS, select: [OPT_NEW] },
    ];

    console.log("Creating list item:", title);

    const listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify({
        list_id: SLACK_LIST_ID,
        initial_fields: initialFields,
      }),
    });

    const listData = await listResp.json();
    console.log("Create response:", JSON.stringify(listData));

    if (!listData.ok) {
      // Fallback: create without status, then update status via cells API
      console.warn("Create with status failed, trying without status...");
      const fallbackResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
        method: "POST",
        headers: slackHeaders,
        body: JSON.stringify({
          list_id: SLACK_LIST_ID,
          initial_fields: initialFields.filter(f => f.column_id !== COL_STATUS),
        }),
      });
      const fallbackData = await fallbackResp.json();

      if (!fallbackData.ok) {
        throw new Error(`Slack List error: ${fallbackData.error || JSON.stringify(fallbackData)}`);
      }

      const itemId = fallbackData.item?.id;
      if (itemId) {
        // Set status via update cells API
        const updateResp = await fetch(`${SLACK_API}/slackLists.items.update`, {
          method: "POST",
          headers: slackHeaders,
          body: JSON.stringify({
            list_id: SLACK_LIST_ID,
            cells: [
              { row_id: itemId, column_id: COL_STATUS, select: [OPT_NEW] },
            ],
          }),
        });
        const updateData = await updateResp.json();
        console.log("Status update:", updateData.ok ? "success" : JSON.stringify(updateData));
      }

      return new Response(
        JSON.stringify({ success: true, item_id: itemId, title, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const itemId = listData.item?.id;
    console.log("Item created:", itemId, "title:", title);

    return new Response(
      JSON.stringify({ success: true, item_id: itemId, title }),
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
