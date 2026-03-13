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

// Column IDs for PM: Creative Tracker
const COL_NAME = "Col09RPRVKYUC";
const COL_DESCRIPTION = "Col09R4RW383Z";
const COL_PLATFORM = "Col09RJ7Z6V70";
const COL_FORMAT = "Col09RZ6VGHB3";
const COL_STATUS = "Col09RJ959822";
const COL_REFERENCE = "Col09RPSKU48L";
const OPT_NEW = "Opt1IOIRNGD";

const toRichText = (text: string) => [
  {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  },
];

const generateTitle = (description: string): string => {
  if (!description) return "Creative Request";
  const firstLine = description.split("\n")[0].trim();
  if (firstLine.length <= 70) return firstLine;
  return firstLine.substring(0, 67) + "...";
};

// Download a Slack file and upload to Supabase storage, return public URL
async function downloadAndStoreFile(
  file: any,
  slackToken: string,
  supabase: any,
): Promise<string | null> {
  try {
    const url = file.url_private || file.url_private_download;
    if (!url) return null;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${slackToken}` },
    });
    if (!resp.ok) {
      console.error(`Failed to download Slack file ${file.id}: ${resp.status}`);
      return null;
    }

    const blob = await resp.blob();
    const ext = file.filetype || file.name?.split(".").pop() || "png";
    const fileName = `slack-attachments/${file.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("creative-assets")
      .upload(fileName, blob, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error(`Failed to upload file ${file.id}:`, uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("creative-assets")
      .getPublicUrl(fileName);

    console.log(`Stored Slack file ${file.id} → ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (e) {
    console.error("Error downloading/storing Slack file:", e);
    return null;
  }
}

async function addToSlackList(
  slackHeaders: Record<string, string>,
  title: string,
  description: string,
  platform: string,
  format: string,
  referenceUrls?: string,
) {
  const initialFields = [
    { column_id: COL_NAME, rich_text: toRichText(title) },
    { column_id: COL_DESCRIPTION, rich_text: toRichText(description) },
    { column_id: COL_PLATFORM, rich_text: toRichText(platform) },
    { column_id: COL_FORMAT, rich_text: toRichText(format) },
    { column_id: COL_STATUS, select: [OPT_NEW] },
    ...(referenceUrls ? [{ column_id: COL_REFERENCE, rich_text: toRichText(referenceUrls) }] : []),
  ];

  const listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
    method: "POST",
    headers: slackHeaders,
    body: JSON.stringify({ list_id: SLACK_LIST_ID, initial_fields: initialFields }),
  });
  const listData = await listResp.json();

  if (!listData.ok) {
    console.warn("Create with status failed:", listData.error);
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
      console.error("Failed to add to Slack List:", fallbackData);
      return null;
    }
    const itemId = fallbackData.item?.id;
    if (itemId) {
      const updateResp = await fetch(`${SLACK_API}/slackLists.items.update`, {
        method: "POST",
        headers: slackHeaders,
        body: JSON.stringify({
          list_id: SLACK_LIST_ID,
          cells: [{ row_id: itemId, column_id: COL_STATUS, select: [OPT_NEW] }],
        }),
      });
      const updateData = await updateResp.json();
      console.log("Status update:", updateData.ok ? "success" : JSON.stringify(updateData));
    }
    return itemId;
  }

  console.log("Added to Slack List:", listData.item?.id, "title:", title);
  return listData.item?.id;
}

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

    // Download files from Slack and store in our storage bucket
    const storedFileUrls: string[] = [];
    const slackFileUrls: string[] = [];
    if (event.files && Array.isArray(event.files)) {
      for (const file of event.files) {
        slackFileUrls.push(file.url_private || file.permalink || "");
        const publicUrl = await downloadAndStoreFile(file, SLACK_BOT_TOKEN, supabase);
        if (publicUrl) storedFileUrls.push(publicUrl);
      }
    }

    // Extract links from message text
    const linkMatches = messageText.match(/https?:\/\/[^\s>]+/g) || [];
    const allReferenceUrls = [...storedFileUrls, ...linkMatches];

    // Deduplicate
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

    // Thread reply → update existing request
    if (threadTs && threadTs !== messageTs) {
      const { data: parentRequest } = await supabase
        .from("creative_requests")
        .select("id, thread_context, slack_list_item_id, description, inspiration_url")
        .eq("message_ts", threadTs)
        .maybeSingle();

      if (parentRequest) {
        const existingContext = parentRequest.thread_context || "";
        const cleanMessage = messageText.replace(/<@([A-Z0-9]+)>/g, '$1');
        const newContext = existingContext
          ? `${existingContext}\n---\n${userId}: ${cleanMessage}`
          : `${userId}: ${cleanMessage}`;

        // Merge all URLs (existing + new stored files + new links)
        const existingUrls = parentRequest.inspiration_url
          ? parentRequest.inspiration_url.split(", ").filter(Boolean)
          : [];
        const mergedUrls = [...existingUrls, ...allReferenceUrls].filter(Boolean);

        await supabase
          .from("creative_requests")
          .update({
            thread_context: newContext,
            ...(mergedUrls.length > 0 ? { inspiration_url: mergedUrls.join(", ") } : {}),
          })
          .eq("id", parentRequest.id);

        // Update Slack List item
        if (parentRequest.slack_list_item_id) {
          const slackHdrs = {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json; charset=utf-8",
          };
          const updatedDesc = [
            parentRequest.description || "",
            "\n\n---\nThread updates:",
            newContext,
            ...(allReferenceUrls.length > 0 ? [`\n🔗 ${allReferenceUrls.join("\n🔗 ")}`] : []),
          ].join("\n");

          const cells: any[] = [
            {
              row_id: parentRequest.slack_list_item_id,
              column_id: COL_DESCRIPTION,
              rich_text: toRichText(updatedDesc),
            },
          ];

          // Also update reference column with all URLs
          if (mergedUrls.length > 0) {
            cells.push({
              row_id: parentRequest.slack_list_item_id,
              column_id: COL_REFERENCE,
              rich_text: toRichText(mergedUrls.join("\n")),
            });
          }

          const updateResp = await fetch(`${SLACK_API}/slackLists.items.update`, {
            method: "POST",
            headers: slackHdrs,
            body: JSON.stringify({ list_id: SLACK_LIST_ID, cells }),
          });
          const updateData = await updateResp.json();
          console.log("Slack List update:", updateData.ok ? "success" : JSON.stringify(updateData));
        }

        console.log(`Updated thread_context for request ${parentRequest.id}`);
        return new Response(JSON.stringify({ ok: true, action: "comment_on_existing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

Classify the message and extract details if it's a request. Pay special attention to any deadline or due date mentioned (e.g. "by Friday", "EOD tomorrow", "Deadline: Noon Friday 3/13").`;

    const userContent = `Message from <@${userId}> (ts=${messageTs}):\n${messageText}${slackFileUrls.length > 0 ? `\n\nAttached files: ${slackFileUrls.join(", ")}` : ""}`;

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
                  deadline: {
                    type: "string",
                    description: "Deadline or due date if mentioned (e.g. 'Noon Friday 3/13', 'EOD tomorrow'). Null if not mentioned.",
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

    console.log(`Classification: ${classification.classification}, deadline: ${classification.deadline || "none"}`);

    if (classification.classification !== "new_request") {
      return new Response(JSON.stringify({ ok: true, action: "not_a_request" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build description with deadline if present
    let fullDescription = classification.description || messageText;
    if (classification.deadline) {
      fullDescription += `\n\n📅 Deadline: ${classification.deadline}`;
    }

    // Insert new creative request
    const { error: insertError } = await supabase.from("creative_requests").insert({
      description: classification.description || messageText,
      requester: `<@${userId}>`,
      platform: classification.platform || "Not specified",
      format: classification.format || "Not specified",
      priority: classification.priority || "Normal",
      deadline: classification.deadline || null,
      message_ts: messageTs,
      source_channel: event.channel,
      inspiration_url: allReferenceUrls.length > 0 ? allReferenceUrls.join(", ") : null,
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
            classification.deadline ? `📅 Deadline: ${classification.deadline}` : "",
            storedFileUrls.length > 0 ? `🖼️ Reference image attached` : "",
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
    const title = generateTitle(classification.description || messageText);
    const referenceText = allReferenceUrls.length > 0 ? allReferenceUrls.join("\n") : undefined;
    const slackListItemId = await addToSlackList(
      slackHeaders,
      title,
      fullDescription,
      classification.platform || "Not specified",
      classification.format || "Not specified",
      referenceText,
    );

    // Store the Slack List item ID back on the creative_requests row
    if (slackListItemId) {
      await supabase
        .from("creative_requests")
        .update({ slack_list_item_id: slackListItemId })
        .eq("message_ts", messageTs);
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
