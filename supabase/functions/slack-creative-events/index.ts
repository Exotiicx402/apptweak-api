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

// Slack List column IDs for PM: Creative Tracker
const COL = {
  NAME:        "Col09RPRVKYUC",
  DESCRIPTION: "Col09R4RW383Z",
  PLATFORM:    "Col09RJ7Z6V70",
  FORMAT:      "Col09RZ6VGHB3",
  STATUS:      "Col09RJ959822",
  PRIORITY:    "Col09RL9W6L5Q",
  INSPIRATION: "Col09RPSKU48L",
  SUBMITTED_BY:"Col09RGRF5DHB",
  DATE:        "Col09SEJ8H16C",
  ASSIGNED:    "Col09TE2S3NG0",
};
const OPT_NEW = "Opt1IOIRNGD";

const toRichText = (text: string) => [
  {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  },
];

// Build rich_text with clickable link elements for Slack Lists
const toRichTextLinks = (urls: string[]) => {
  const elements: any[] = [];
  urls.forEach((url, i) => {
    if (i > 0) elements.push({ type: "text", text: "\n\n" });
    elements.push({ type: "link", url, text: url });
  });
  return [
    {
      type: "rich_text",
      elements: [{ type: "rich_text_section", elements }],
    },
  ];
};

const generateTitle = (description: string): string => {
  if (!description) return "Creative Request";
  const firstLine = description.split("\n")[0].trim();
  if (firstLine.length <= 70) return firstLine;
  return firstLine.substring(0, 67) + "...";
};

// Download a Slack file → upload to Supabase storage → return public URL
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

    const arrayBuf = await resp.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuf);
    console.log(`Downloaded Slack file ${file.id}: ${fileBytes.length} bytes`);

    if (fileBytes.length === 0) {
      console.error(`Slack file ${file.id} downloaded as empty`);
      return null;
    }

    const ext = file.filetype || file.name?.split(".").pop() || "png";
    const fileName = `slack-attachments/${file.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("creative-assets")
      .upload(fileName, fileBytes, {
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

// Push a fully-extracted request to the Slack List with all available columns
async function pushToSlackList(
  slackHeaders: Record<string, string>,
  fields: {
    title: string;
    description: string;
    platform: string;
    format: string;
    priority: string;
    inspirationUrls: string[];
    submitterUserId?: string;
    deadline?: string;
  },
): Promise<string | null> {
  // Build description with deadline if present
  let fullDesc = fields.description;
  if (fields.deadline) {
    fullDesc += `\n\n📅 Deadline: ${fields.deadline}`;
  }

  // Don't include status or user columns on create — they cause "uneditable_column" errors
  // We'll patch them via update after creation
  const initialFields: any[] = [
    { column_id: COL.NAME, rich_text: toRichText(fields.title) },
    { column_id: COL.DESCRIPTION, rich_text: toRichText(fullDesc) },
    { column_id: COL.PLATFORM, rich_text: toRichText(fields.platform) },
    { column_id: COL.FORMAT, rich_text: toRichText(fields.format) },
    { column_id: COL.PRIORITY, rich_text: toRichText(fields.priority) },
  ];

  if (fields.inspirationUrls.length > 0) {
    initialFields.push({
      column_id: COL.INSPIRATION,
      rich_text: toRichTextLinks(fields.inspirationUrls),
    });
  }

  const listResp = await fetch(`${SLACK_API}/slackLists.items.create`, {
    method: "POST",
    headers: slackHeaders,
    body: JSON.stringify({ list_id: SLACK_LIST_ID, initial_fields: initialFields }),
  });
  const listData = await listResp.json();

  if (!listData.ok) {
    console.error("Failed to create Slack List item:", listData);
    return null;
  }

  const itemId = listData.item?.id;
  if (!itemId) return null;

  // Patch status + submitted_by via separate update call
  const patchCells: any[] = [
    { row_id: itemId, column_id: COL.STATUS, select: [OPT_NEW] },
  ];
  if (fields.submitterUserId) {
    patchCells.push({ row_id: itemId, column_id: COL.SUBMITTED_BY, user: [fields.submitterUserId] });
  }

  const patchResp = await fetch(`${SLACK_API}/slackLists.items.update`, {
    method: "POST",
    headers: slackHeaders,
    body: JSON.stringify({ list_id: SLACK_LIST_ID, cells: patchCells }),
  });
  const patchData = await patchResp.json();
  if (!patchData.ok) {
    console.warn("Status/user patch failed:", patchData.error, "— trying status only");
    // Try status alone if user field also fails
    await fetch(`${SLACK_API}/slackLists.items.update`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify({
        list_id: SLACK_LIST_ID,
        cells: [{ row_id: itemId, column_id: COL.STATUS, select: [OPT_NEW] }],
      }),
    });
  }

  console.log("Added to Slack List:", itemId, "title:", fields.title);
  return itemId;
}

// Update an existing Slack List item with new thread info
async function updateSlackListItem(
  slackHeaders: Record<string, string>,
  itemId: string,
  updatedDescription: string,
  allReferenceUrls: string[],
) {
  const cells: any[] = [
    {
      row_id: itemId,
      column_id: COL.DESCRIPTION,
      rich_text: toRichText(updatedDescription),
    },
  ];
  if (allReferenceUrls.length > 0) {
    cells.push({
      row_id: itemId,
      column_id: COL.INSPIRATION,
      rich_text: toRichTextLinks(allReferenceUrls),
    });
  }

  const resp = await fetch(`${SLACK_API}/slackLists.items.update`, {
    method: "POST",
    headers: slackHeaders,
    body: JSON.stringify({ list_id: SLACK_LIST_ID, cells }),
  });
  const data = await resp.json();
  console.log("Slack List update:", data.ok ? "success" : JSON.stringify(data));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Slack URL verification
    if (body.type === "url_verification") {
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

    // Ignore bots, edits, deletes, wrong channels
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

    // Step 1: Download any attached files to storage
    const storedFileUrls: string[] = [];
    if (event.files && Array.isArray(event.files)) {
      for (const file of event.files) {
        const publicUrl = await downloadAndStoreFile(file, SLACK_BOT_TOKEN, supabase);
        if (publicUrl) storedFileUrls.push(publicUrl);
      }
    }

    // Extract inline links from message text — Slack formats links as <URL|display>
    const rawLinks = messageText.match(/<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g) || [];
    const parsedLinks = rawLinks.map((m: string) => {
      const match = m.match(/<(https?:\/\/[^|>]+)/);
      return match ? match[1] : null;
    }).filter(Boolean) as string[];
    // Also grab any bare URLs not wrapped in angle brackets
    const bareLinks = messageText.replace(/<https?:\/\/[^>]+>/g, "").match(/https?:\/\/[^\s]+/g) || [];
    const allReferenceUrls = [...new Set([...storedFileUrls, ...parsedLinks, ...bareLinks])];

    // Step 2: Dedup check
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

    // Step 3: If thread reply, update existing request
    if (threadTs && threadTs !== messageTs) {
      const { data: parentRequest } = await supabase
        .from("creative_requests")
        .select("id, thread_context, slack_list_item_id, description, inspiration_url, platform, format, priority, deadline, figma_url")
        .eq("message_ts", threadTs)
        .maybeSingle();

      if (parentRequest) {
        // Use AI to extract any new structured info from the thread reply
        const updateExtraction = await classifyMessage(
          LOVABLE_API_KEY, messageText, userId, messageTs, allReferenceUrls, true
        );

        const existingContext = parentRequest.thread_context || "";
        const cleanMessage = messageText.replace(/<@([A-Z0-9]+)>/g, '$1');
        const newContext = existingContext
          ? `${existingContext}\n---\n${userId}: ${cleanMessage}`
          : `${userId}: ${cleanMessage}`;

        // Merge URLs
        const existingUrls = parentRequest.inspiration_url
          ? parentRequest.inspiration_url.split(", ").filter(Boolean)
          : [];
        const mergedUrls = [...new Set([...existingUrls, ...allReferenceUrls])].filter(Boolean);

        // Merge fields — thread reply can refine/add to the original request
        const updates: any = {
          thread_context: newContext,
        };
        if (mergedUrls.length > 0) updates.inspiration_url = mergedUrls.join(", ");
        // If thread reply mentions a new platform/format/deadline/figma_url, update
        if (updateExtraction.platform && updateExtraction.platform !== "Not specified" && parentRequest.platform === "Not specified") {
          updates.platform = updateExtraction.platform;
        }
        if (updateExtraction.format && updateExtraction.format !== "Not specified" && parentRequest.format === "Not specified") {
          updates.format = updateExtraction.format;
        }
        if (updateExtraction.deadline && !parentRequest.deadline) {
          updates.deadline = updateExtraction.deadline;
        }
        if (updateExtraction.figma_url && !parentRequest.figma_url) {
          updates.figma_url = updateExtraction.figma_url;
        }

        await supabase
          .from("creative_requests")
          .update(updates)
          .eq("id", parentRequest.id);

        // Update Slack List item with enriched description
        if (parentRequest.slack_list_item_id) {
          const slackHdrs = {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json; charset=utf-8",
          };

          const updatedDesc = [
            parentRequest.description || "",
            parentRequest.deadline || updates.deadline
              ? `\n📅 Deadline: ${updates.deadline || parentRequest.deadline}`
              : "",
            "\n\n---\nThread updates:",
            newContext,
            ...(allReferenceUrls.length > 0 ? [`\n🔗 ${allReferenceUrls.join("\n🔗 ")}`] : []),
          ].filter(Boolean).join("\n");

          await updateSlackListItem(slackHdrs, parentRequest.slack_list_item_id, updatedDesc, mergedUrls);
        }

        console.log(`Updated thread_context for request ${parentRequest.id}`);
        return new Response(JSON.stringify({ ok: true, action: "comment_on_existing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step 4: Classify as new request or not
    const classification = await classifyMessage(
      LOVABLE_API_KEY, messageText, userId, messageTs, allReferenceUrls, false
    );

    console.log(`Classification: ${classification.classification}, deadline: ${classification.deadline || "none"}`);

    if (classification.classification !== "new_request") {
      return new Response(JSON.stringify({ ok: true, action: "not_a_request" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 5: Store everything in DB
    const { error: insertError } = await supabase.from("creative_requests").insert({
      description: classification.description || messageText,
      raw_message: messageText,
      requester: `<@${userId}>`,
      platform: classification.platform || "Not specified",
      format: classification.format || "Not specified",
      priority: classification.priority || "Normal",
      deadline: classification.deadline || null,
      figma_url: classification.figma_url || null,
      message_ts: messageTs,
      source_channel: event.channel,
      inspiration_url: allReferenceUrls.length > 0 ? allReferenceUrls.join(", ") : null,
    });

    if (insertError) {
      console.error("Failed to insert creative_request:", insertError);
    }

    // Step 6: Post notification to #ad-review-pipeline
    const slackHeaders = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    const permalink = `https://slack.com/archives/${event.channel}/p${messageTs.replace(".", "")}`;
    const priorityEmoji = classification.priority === "High" ? "🔴" : classification.priority === "Low" ? "🟢" : "🟡";

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "🎨 New Creative Request Detected", emoji: true },
      },
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `From <#${event.channel}> • ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} EST`,
        }],
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
            `⚡ Priority: ${classification.priority || "Normal"}`,
            classification.deadline ? `📅 Deadline: ${classification.deadline}` : "",
            classification.figma_url ? `🎨 Figma: ${classification.figma_url}` : "",
            storedFileUrls.length > 0 ? `🖼️ ${storedFileUrls.length} reference file(s) attached` : "",
            `<${permalink}|View original message>`,
          ].filter(Boolean).join("\n"),
        },
      },
    ];

    await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: slackHeaders,
      body: JSON.stringify({
        channel: TARGET_CHANNEL,
        text: `<!channel> 🎨 New creative request from <@${userId}>`,
        blocks,
      }),
    });

    // Step 7: Push to Slack List with ALL extracted fields
    const title = generateTitle(classification.description || messageText);
    const slackListItemId = await pushToSlackList(slackHeaders, {
      title,
      description: classification.description || messageText,
      platform: classification.platform || "Not specified",
      format: classification.format || "Not specified",
      priority: classification.priority || "Normal",
      inspirationUrls: allReferenceUrls,
      submitterUserId: userId,
      deadline: classification.deadline,
    });

    // Step 8: Store Slack List item ID
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

// ──────────────────────────────────────────────
// AI Classification
// ──────────────────────────────────────────────

async function classifyMessage(
  apiKey: string,
  messageText: string,
  userId: string,
  messageTs: string,
  referenceUrls: string[],
  isThreadReply: boolean,
): Promise<any> {
  const nowEST = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" });

  const systemPrompt = `You are a creative request detector for an ad operations team. You analyze Slack messages to determine if they contain creative requests and extract ALL available information.

CURRENT DATE/TIME (EST): ${nowEST}

A creative request is when someone asks for:
- New ad creatives (images, videos, banners, email headers)
- Modifications to existing creatives (resize, change copy, update branding)
- Creatives for specific platforms (Meta, TikTok, Snapchat, Unity, Google, Email, Display, etc.)
- Specific sizes/formats (1080x1080, 9:16, 300x250, landscape, etc.)
- Concepts, themes, or briefs for ad creatives
- Even casual requests like "can we get a version of X with Y"

NOT requests: status updates, general chat, reactions, questions about metrics/performance, approvals of existing work.

Extract EVERY piece of information you can find:
- Name: a short, punchy title for this request (max 60 chars). Think ticket title, e.g. "March Madness Email Header" or "TikTok 9:16 Promo Video"
- Description: comprehensive summary of what's being requested
- Platform: the target platform or channel (Meta, TikTok, Email, Display, Esports site, etc.)
- Format: ALL dimensions/sizes/formats mentioned (e.g. "1000x347", "9:16 and 1:1", "300x250 & 320x250")
- Priority: Use the current date/time to judge urgency:
  - "High" if deadline is within 24 hours, or urgent/ASAP language is used
  - "Normal" if deadline is 1-7 days away or no urgency signals
  - "Low" if explicitly "no rush" or "whenever" or deadline is >7 days away
- Deadline: exact deadline text if mentioned (e.g. "Noon Friday 3/13", "EOD tomorrow", "by next week")
- Figma URL: any Figma link if present
- Inspiration notes: any reference to style, competitors, examples, or attached images

${isThreadReply ? "This is a THREAD REPLY adding info to an existing request. Extract any new details being added." : ""}`;

  const userContent = `Message from user ${userId} (ts=${messageTs}):\n${messageText}${referenceUrls.length > 0 ? `\n\nAttached/referenced URLs: ${referenceUrls.join(", ")}` : ""}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
            description: "Classify the Slack message and extract all creative request details",
            parameters: {
              type: "object",
              properties: {
                classification: {
                  type: "string",
                  enum: ["new_request", "additional_info", "not_a_request"],
                  description: "new_request = fresh creative ask, additional_info = adds detail to an existing thread, not_a_request = unrelated",
                },
                description: {
                  type: "string",
                  description: "Comprehensive description of what's being requested (include all details about style, copy, branding requirements)",
                },
                platform: {
                  type: "string",
                  description: "Target platform/channel: Meta, TikTok, Snapchat, Unity, Google, Email, Display, Esports, etc. or 'Not specified'",
                },
                format: {
                  type: "string",
                  description: "ALL sizes/formats/dimensions mentioned, comma-separated. e.g. '1000x347' or '1920x1080, 1920x180, 300x600' or 'Not specified'",
                },
                priority: {
                  type: "string",
                  enum: ["High", "Normal", "Low"],
                  description: "High if urgent/ASAP, Low if 'no rush'/'whenever', otherwise Normal",
                },
                deadline: {
                  type: "string",
                  description: "Exact deadline text if mentioned (e.g. 'Noon Friday 3/13'). Empty string if none.",
                },
                figma_url: {
                  type: "string",
                  description: "Figma URL if present in the message. Empty string if none.",
                },
                inspiration_notes: {
                  type: "string",
                  description: "Any style references, competitor mentions, or notes about attached reference images. Empty string if none.",
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

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI gateway error:", response.status, errText);
    throw new Error(`AI gateway error [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  try {
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      return JSON.parse(toolCall.function.arguments);
    }
  } catch (e) {
    console.error("Failed to parse AI response:", e);
  }
  return { classification: "not_a_request" };
}
