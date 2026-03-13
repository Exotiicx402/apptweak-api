import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SLACK_BOT_TOKEN = Deno.env.get("POLYMARKET_SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) throw new Error("POLYMARKET_SLACK_BOT_TOKEN is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get last scanned timestamp
    const { data: stateRow } = await supabase
      .from("scanner_state")
      .select("last_scanned_ts")
      .eq("id", "slack-creative-scanner")
      .single();

    const lastTs = stateRow?.last_scanned_ts || "0";
    const now = Math.floor(Date.now() / 1000);

    console.log(`Scanning messages since ts=${lastTs}`);

    const slackHeaders = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    // Scan all source channels and collect messages
    let allEnrichedMessages: { text: string; user: string; ts: string; thread_texts: string[]; channel: string }[] = [];
    let allRawMessages: any[] = [];

    for (const channel of SOURCE_CHANNELS) {
      const historyUrl = `${SLACK_API}/conversations.history?channel=${channel}&oldest=${lastTs}&limit=100`;
      const historyResp = await fetch(historyUrl, { headers: slackHeaders });
      const historyData = await historyResp.json();

      if (!historyData.ok) {
        console.error(`Slack conversations.history failed for ${channel}: ${JSON.stringify(historyData)}`);
        continue;
      }

      const messages = historyData.messages || [];
      console.log(`Found ${messages.length} new messages in ${channel}`);
      allRawMessages.push(...messages);

      for (const msg of messages) {
        if (msg.subtype && msg.subtype !== "thread_broadcast") continue;

        const threadTexts: string[] = [];

        if (msg.thread_ts && msg.reply_count > 0) {
          try {
            const repliesUrl = `${SLACK_API}/conversations.replies?channel=${channel}&ts=${msg.thread_ts}&limit=50`;
            const repliesResp = await fetch(repliesUrl, { headers: slackHeaders });
            const repliesData = await repliesResp.json();
            if (repliesData.ok && repliesData.messages) {
              for (const reply of repliesData.messages) {
                if (reply.ts !== msg.ts) {
                  threadTexts.push(reply.text || "");
                }
              }
            }
          } catch (e) {
            console.error("Error fetching thread replies:", e);
          }
        }

        allEnrichedMessages.push({
          text: msg.text || "",
          user: msg.user || "unknown",
          ts: msg.ts,
          thread_texts: threadTexts,
          channel,
        });
      }
    }

    if (allEnrichedMessages.length === 0) {
      await supabase
        .from("scanner_state")
        .update({ last_scanned_ts: String(now), updated_at: new Date().toISOString() })
        .eq("id", "slack-creative-scanner");

      return new Response(JSON.stringify({ success: true, requests_found: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build AI prompt
    const messagesForAI = allEnrichedMessages.map((m, i) => {
      let content = `Message ${i + 1} (from <@${m.user}>, ts=${m.ts}, channel=${m.channel}):\n${m.text}`;
      if (m.thread_texts.length > 0) {
        content += `\n\nThread replies:\n${m.thread_texts.join("\n---\n")}`;
      }
      return content;
    }).join("\n\n========\n\n");

    // Build a lookup from ts to channel
    const tsToChannel = new Map(allEnrichedMessages.map(m => [m.ts, m.channel]));

    const systemPrompt = `You are a creative request detector for an ad operations team. You analyze Slack messages from channels where people request new ad creatives or modifications to existing ones.

Your job is to identify messages that are creative requests — even informal ones. Look for:
- Requests for new ad creatives (images, videos, banners)
- Requests to modify existing creatives (resize, change copy, update branding)
- Requests mentioning specific platforms (Meta, TikTok, Snapchat, Unity, Google, etc.)
- Requests mentioning sizes/formats (1080x1080, 9:16, landscape, etc.)
- Requests referencing concepts, themes, or briefs
- Even casual messages like "can we get a version of X with Y" or "need creatives for Z campaign"

Messages that are NOT requests: status updates, general chat, reactions, questions about metrics/performance, approvals of existing work.

For each request found, extract:
- description: What's being requested (1-2 sentences)
- requester: The Slack user ID (format: <@USERID>)
- platform: Target platform if mentioned (or "Not specified")
- format: Size/format if mentioned (or "Not specified")  
- priority: "High" if urgent language used, otherwise "Normal"
- deadline: Deadline or due date if mentioned (e.g. "Noon Friday 3/13", "EOD tomorrow"). Null if not mentioned.
- message_ts: The timestamp of the message`;

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
          { role: "user", content: `Analyze these Slack messages and identify any creative requests:\n\n${messagesForAI}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_creative_requests",
              description: "Report all creative requests found in the messages",
              parameters: {
                type: "object",
                properties: {
                  requests: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        requester: { type: "string" },
                        platform: { type: "string" },
                        format: { type: "string" },
                        priority: { type: "string", enum: ["High", "Normal"] },
                        message_ts: { type: "string" },
                      },
                      required: ["description", "requester", "platform", "format", "priority", "message_ts"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["requests"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_creative_requests" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway error [${aiResponse.status}]: ${errText}`);
    }

    const aiData = await aiResponse.json();
    let requests: any[] = [];

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        requests = parsed.requests || [];
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    console.log(`AI identified ${requests.length} creative requests`);

    // Persist requests to database (deduplicate by message_ts)
    if (requests.length > 0) {
      const tsList = requests.map((r: any) => r.message_ts).filter(Boolean);
      const { data: existing } = await supabase
        .from("creative_requests")
        .select("message_ts")
        .in("message_ts", tsList);
      const existingTs = new Set((existing || []).map((e: any) => e.message_ts));

      const newRequests = requests.filter((r: any) => !existingTs.has(r.message_ts));
      console.log(`${requests.length} requests from AI, ${newRequests.length} are new (${existingTs.size} already exist)`);

      if (newRequests.length > 0) {
        const rows = newRequests.map((r: any) => ({
          description: r.description,
          requester: r.requester,
          platform: r.platform,
          format: r.format,
          priority: r.priority,
          message_ts: r.message_ts,
          source_channel: tsToChannel.get(r.message_ts) || SOURCE_CHANNELS[0],
        }));
        const { error: insertError, data: insertedRows } = await supabase
          .from("creative_requests")
          .insert(rows)
          .select("id, message_ts");
        if (insertError) {
          console.error("Failed to insert creative_requests:", insertError);
        }

        // Build a map from message_ts to DB id for storing slack_list_item_id
        const tsToDbId = new Map((insertedRows || []).map((r: any) => [r.message_ts, r.id]));

        // Add new requests to Slack List "PM: Creative Tracker"
        for (const r of newRequests) {
          const title = generateTitle(r.description || "");
          const initialFields = [
            { column_id: COL_NAME, rich_text: toRichText(title) },
            { column_id: COL_DESCRIPTION, rich_text: toRichText(r.description || "") },
            { column_id: COL_PLATFORM, rich_text: toRichText(r.platform || "Not specified") },
            { column_id: COL_FORMAT, rich_text: toRichText(r.format || "Not specified") },
            { column_id: COL_STATUS, select: [OPT_NEW] },
          ];

          try {
            let slackListItemId: string | null = null;

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
              if (fallbackData.ok && fallbackData.item?.id) {
                slackListItemId = fallbackData.item.id;
                await fetch(`${SLACK_API}/slackLists.items.update`, {
                  method: "POST",
                  headers: slackHeaders,
                  body: JSON.stringify({
                    list_id: SLACK_LIST_ID,
                    cells: [{ row_id: slackListItemId, column_id: COL_STATUS, select: [OPT_NEW] }],
                  }),
                });
                console.log("Added to Slack List (fallback):", slackListItemId, "title:", title);
              } else {
                console.error("Fallback also failed:", fallbackData);
              }
            } else {
              slackListItemId = listData.item?.id;
              console.log("Added to Slack List:", slackListItemId, "title:", title);
            }

            // Store slack_list_item_id back on the DB row
            if (slackListItemId) {
              const dbId = tsToDbId.get(r.message_ts);
              if (dbId) {
                await supabase
                  .from("creative_requests")
                  .update({ slack_list_item_id: slackListItemId })
                  .eq("id", dbId);
              }
            }
          } catch (e) {
            console.error("Error adding to Slack List:", e);
          }
        }
      }
    }

    // Post to target channel if requests found
    if (requests.length > 0) {
      const MAX_REQUESTS_PER_MESSAGE = 22;
      const chunks: any[][] = [];
      for (let i = 0; i < requests.length; i += MAX_REQUESTS_PER_MESSAGE) {
        chunks.push(requests.slice(i, i + MAX_REQUESTS_PER_MESSAGE));
      }

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];
        const partLabel = chunks.length > 1 ? ` (Part ${chunkIdx + 1}/${chunks.length})` : "";

        const blocks: any[] = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `🎨 ${requests.length} New Creative Request${requests.length > 1 ? "s" : ""} Detected${partLabel}`,
              emoji: true,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Scanned from multiple channels • ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} EST`,
              },
            ],
          },
          { type: "divider" },
        ];

        for (const req of chunk) {
          const reqChannel = tsToChannel.get(req.message_ts) || SOURCE_CHANNELS[0];
          const permalink = `https://slack.com/archives/${reqChannel}/p${req.message_ts.replace(".", "")}`;
          const priorityEmoji = req.priority === "High" ? "🔴" : "🟡";

          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `${priorityEmoji} *${req.description}*`,
                `👤 Requester: ${req.requester}`,
                `📱 Platform: ${req.platform}`,
                `📐 Format: ${req.format}`,
                `<${permalink}|View original message>`,
              ].join("\n"),
            },
          });
          blocks.push({ type: "divider" });
        }

        const postResp = await fetch(`${SLACK_API}/chat.postMessage`, {
          method: "POST",
          headers: slackHeaders,
          body: JSON.stringify({
            channel: TARGET_CHANNEL,
            text: `<!channel> 🎨 ${requests.length} new creative request(s) detected${partLabel}`,
            blocks,
          }),
        });

        const postData = await postResp.json();
        if (!postData.ok) {
          console.error("Failed to post to Slack:", postData);
          throw new Error(`Slack chat.postMessage failed: ${JSON.stringify(postData)}`);
        }
      }

      console.log(`Posted creative request summary in ${chunks.length} message(s)`);
    }

    // Update last scanned timestamp
    const latestTs = allRawMessages.reduce((max: string, m: any) => (m.ts > max ? m.ts : max), lastTs);
    await supabase
      .from("scanner_state")
      .update({ last_scanned_ts: latestTs, updated_at: new Date().toISOString() })
      .eq("id", "slack-creative-scanner");

    return new Response(
      JSON.stringify({ success: true, messages_scanned: allEnrichedMessages.length, requests_found: requests.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in slack-creative-scanner:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
