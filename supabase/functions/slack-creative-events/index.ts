import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLACK_API = "https://slack.com/api";
const SOURCE_CHANNELS = ["C0AL5KYSXQT"];
const TARGET_CHANNEL = "C0ALEBYFJNQ";
const SLACK_LIST_ID = "F09R4RD9G5D";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Handle Slack URL verification challenge
    if (body.type === "url_verification") {
      console.log("Received url_verification challenge");
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only process event_callback
    if (body.type !== "event_callback") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = body.event;
    if (!event || event.type !== "message") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ignore bot messages, edits, deletions, and messages from other channels
    if (
      event.bot_id ||
      event.subtype === "message_changed" ||
      event.subtype === "message_deleted" ||
      event.subtype === "bot_message" ||
      !SOURCE_CHANNELS.includes(event.channel)
    ) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SLACK_BOT_TOKEN = Deno.env.get("POLYMARKET_SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) throw new Error("POLYMARKET_SLACK_BOT_TOKEN is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const messageTs = event.ts;
    const threadTs = event.thread_ts;
    const messageText = event.text || "";
    const userId = event.user || "unknown";

    // Extract file/image URLs from attachments
    const fileUrls: string[] = [];
    if (event.files && Array.isArray(event.files)) {
      for (const file of event.files) {
        if (file.url_private) {
          fileUrls.push(file.url_private);
        } else if (file.permalink) {
          fileUrls.push(file.permalink);
        }
      }
    }

    // Deduplicate: check if this message_ts already exists
    const { data: existing } = await supabase
      .from("creative_requests")
      .select("id, message_ts")
      .eq("message_ts", messageTs)
      .maybeSingle();

    if (existing) {
      console.log(`Message ts=${messageTs} already processed, skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If this is a thread reply, check if the parent thread is an existing request
    if (threadTs && threadTs !== messageTs) {
      const { data: parentRequest } = await supabase
        .from("creative_requests")
        .select("id, thread_context")
        .eq("message_ts", threadTs)
        .maybeSingle();

      if (parentRequest) {
        // This is a comment on an existing request — update thread_context
        const existingContext = parentRequest.thread_context || "";
        const newContext = existingContext
          ? `${existingContext}\n---\n<@${userId}>: ${messageText}`
          : `<@${userId}>: ${messageText}`;

        await supabase
          .from("creative_requests")
          .update({
            thread_context: newContext,
            ...(fileUrls.length > 0 ? { inspiration_url: fileUrls.join(", ") } : {}),
          })
          .eq("id", parentRequest.id);

        console.log(`Updated thread_context for request ${parentRequest.id}`);
        return new Response(JSON.stringify({ ok: true, action: "comment_on_existing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Thread reply but parent isn't a known request — fall through to classify
    }

    // Classify the message using AI
    const systemPrompt = `You are a creative request detector for an ad operations team. You analyze a single Slack message to determine if it's a creative request.

A creative request is when someone asks for:
- New ad creatives (images, videos, banners)
- Modifications to existing creatives (resize, change copy, update branding)
- Creatives for specific platforms (Meta, TikTok, Snapchat, Unity, Google, etc.)
- Specific sizes/formats (1080x1080, 9:16, landscape, etc.)
- Concepts, themes, or briefs for ad creatives
- Even casual requests like "can we get a version of X with Y" or "need creatives for Z campaign"

NOT requests: status updates, general chat, reactions, questions about metrics/performance, approvals of existing work, scheduling discussions.

Classify the message and extract details if it's a request.`;

    const userContent = `Message from <@${userId}> (ts=${messageTs}):\n${messageText}${fileUrls.length > 0 ? `\n\nAttached files: ${fileUrls.join(", ")}` : ""}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_message",
              description: "Classify the Slack message",
              parameters: {
                type: "object",
                properties: {
                  classification: {
                    type: "string",
                    enum: ["new_request", "not_a_request"],
                  },
                  description: {
                    type: "string",
                    description: "What's being requested (1-2 sentences). Only for new_request.",
                  },
                  platform: {
                    type: "string",
                    description: "Target platform if mentioned, or 'Not specified'",
                  },
                  format: {
                    type: "string",
                    description: "Size/format if mentioned, or 'Not specified'",
                  },
                  priority: {
                    type: "string",
                    enum: ["High", "Normal"],
                    description: "High if urgent language used, otherwise Normal",
                  },
                },
                required: ["classification"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_message" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway error [${aiResponse.status}]: ${errText}`);
    }

    const aiData = await aiResponse.json();
    let classification: any = {};

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        classification = JSON.parse(toolCall.function.arguments);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    console.log(`Classification: ${classification.classification}`);

    if (classification.classification !== "new_request") {
      return new Response(JSON.stringify({ ok: true, action: "not_a_request" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert new creative request
    const { error: insertError } = await supabase.from("creative_requests").insert({
      description: classification.description || messageText,
      requester: `<@${userId}>`,
      platform: classification.platform || "Not specified",
      format: classification.format || "Not specified",
      priority: classification.priority || "Normal",
      message_ts: messageTs,
      source_channel: event.channel,
      inspiration_url: fileUrls.length > 0 ? fileUrls.join(", ") : null,
    });

    if (insertError) {
      console.error("Failed to insert creative_request:", insertError);
    }

    // Post to #ad-review-pipeline
    const slackHeaders = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    const permalink = `https://slack.com/archives/${event.channel}/p${messageTs.replace(".", "")}`;
    const priorityEmoji = classification.priority === "High" ? "🔴" : "🟡";

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🎨 New Creative Request Detected",
          emoji: true,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `From <#${event.channel}> • ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} EST`,
          },
        ],
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `${priorityEmoji} *${classification.description || messageText}*`,
            `👤 Requester: <@${userId}>`,
            `📱 Platform: ${classification.platform || "Not specified"}`,
            `📐 Format: ${classification.format || "Not specified"}`,
            fileUrls.length > 0 ? `🖼️ Reference image attached` : "",
            `<${permalink}|View original message>`,
          ].filter(Boolean).join("\n"),
        },
      },
    ];

    const postResp = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify({
        channel: TARGET_CHANNEL,
        text: `<!channel> 🎨 New creative request detected from <@${userId}>`,
        blocks,
      }),
    });

    const postData = await postResp.json();
    if (!postData.ok) {
      console.error("Failed to post to Slack:", postData);
    }

    console.log("New creative request processed and posted");

    // Add to Slack List "PM: Creative Tracker"
    const richText = (text: string) => [{
      type: "rich_text",
      elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
    }];

    const initialFields = [
      { column_id: "Col09RPRVKYUC", rich_text: richText((classification.description || messageText).slice(0, 80)) },
      { column_id: "Col09R4RW383Z", rich_text: richText(classification.description || messageText) },
      { column_id: "Col09RJ7Z6V70", rich_text: richText(classification.platform || "Not specified") },
      { column_id: "Col09RZ6VGHB3", rich_text: richText(classification.format || "Not specified") },
      { column_id: "Col09RL9W6L5Q", rich_text: richText(classification.priority || "Normal") },
      { column_id: "Col09SEJ8H16C", timestamp: [Math.floor(Date.now() / 1000)] },
      { column_id: "Col09RGRF5DHB", user: [userId] },
    ];

    const listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify({
        list_id: SLACK_LIST_ID,
        initial_fields: initialFields,
      }),
    });

    const listData = await listResp.json();
    if (!listData.ok) {
      console.error("Failed to add to Slack List:", listData);
    } else {
      console.log("Added item to Slack List:", listData.item?.id);
    }

    return new Response(
      JSON.stringify({ ok: true, action: "new_request", description: classification.description }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in slack-creative-events:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
