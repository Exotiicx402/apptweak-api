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

    const { request_id, debug, debug_options } = await req.json();

    const slackHeaders = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    // Debug mode: discover list schema or try updating an item
    if (debug) {
      if (debug_options) {
        // Try to create a temporary item with each possible status to discover option IDs
        // Or update existing item
        const { action, item_id, select_value } = debug_options;
        
        if (action === "update_select" && item_id && select_value) {
          const updateResp = await fetch(`${SLACK_API}/slackLists.items.update`, {
            method: "POST",
            headers: slackHeaders,
            body: JSON.stringify({
              list_id: SLACK_LIST_ID,
              row_id: item_id,
              cells: [
                { column_id: COL_STATUS, select: [select_value] },
              ],
            }),
          });
          const updateData = await updateResp.json();
          return new Response(JSON.stringify({ debug: true, update_result: updateData }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (action === "update_name" && item_id) {
          const updateResp = await fetch(`${SLACK_API}/slackLists.items.update`, {
            method: "POST",
            headers: slackHeaders,
            body: JSON.stringify({
              list_id: SLACK_LIST_ID,
              row_id: item_id,
              cells: [
                { column_id: COL_NAME, rich_text: toRichText("Test Name from Bot") },
              ],
            }),
          });
          const updateData = await updateResp.json();
          return new Response(JSON.stringify({ debug: true, update_result: updateData }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (action === "create_with_status" && select_value) {
          const createResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
            method: "POST",
            headers: slackHeaders,
            body: JSON.stringify({
              list_id: SLACK_LIST_ID,
              initial_fields: [
                { column_id: COL_NAME, rich_text: toRichText("Status Test Item") },
                { column_id: COL_STATUS, select: [select_value] },
              ],
            }),
          });
          const createData = await createResp.json();
          return new Response(JSON.stringify({ debug: true, create_result: createData }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Default debug: list items
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
    ];

    console.log("Creating list item with fields:", JSON.stringify(initialFields.map(f => ({ col: f.column_id }))));

    let listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify({
        list_id: SLACK_LIST_ID,
        initial_fields: initialFields,
      }),
    });

    let listData = await listResp.json();
    console.log("Create response:", JSON.stringify(listData));

    if (!listData.ok) {
      throw new Error(`Slack List error: ${listData.error || JSON.stringify(listData)}`);
    }

    const itemId = listData.item?.id;

    // Try to set status to "New" via update (status select may not work in initial_fields)
    if (itemId) {
      // We'll need to discover the "New" option ID - placeholder for now
      // Known options: Opt180YZZPU (In progress), OptBFTZT5CG (Complete)
      console.log("Item created:", itemId);
    }

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
