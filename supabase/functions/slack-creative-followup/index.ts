import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLACK_API = "https://slack.com/api";
const TARGET_CHANNEL = "C0ALEBYFJNQ"; // #pm-internal-creative-notifications

// Creative team members who should respond to requests
const CREATIVE_TEAM_NAMES = ["nikos", "matthis", "erick", "roberto", "dylan"];

// Cache user ID lookup for the lifetime of a single invocation
let cachedTeamUserIds: Set<string> | null = null;

async function getCreativeTeamUserIds(slackHeaders: Record<string, string>): Promise<Set<string>> {
  if (cachedTeamUserIds) return cachedTeamUserIds;

  const userIds = new Set<string>();
  let cursor = "";

  do {
    const url = `${SLACK_API}/users.list?limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const resp = await fetch(url, { headers: slackHeaders });
    const data = await resp.json();

    if (!data.ok) {
      console.error("users.list failed:", data.error);
      break;
    }

    for (const member of data.members || []) {
      const displayName = (member.profile?.display_name || "").toLowerCase();
      const realName = (member.profile?.real_name || "").toLowerCase();
      const firstName = realName.split(" ")[0];

      if (CREATIVE_TEAM_NAMES.some(name => 
        firstName === name || displayName.toLowerCase().startsWith(name)
      )) {
        userIds.add(member.id);
        console.log(`Matched team member: ${member.profile?.real_name} (${member.id})`);
      }
    }

    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  cachedTeamUserIds = userIds;
  console.log(`Found ${userIds.size} creative team member IDs`);
  return userIds;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("POLYMARKET_SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) throw new Error("POLYMARKET_SLACK_BOT_TOKEN is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const slackHeaders = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    // Find requests created ~45 minutes ago that haven't had a followup sent
    const now = new Date();
    const minutesAgo50 = new Date(now.getTime() - 50 * 60 * 1000).toISOString();
    const minutesAgo40 = new Date(now.getTime() - 40 * 60 * 1000).toISOString();

    const { data: pendingRequests, error: queryError } = await supabase
      .from("creative_requests")
      .select("id, message_ts, source_channel, requester, name, description")
      .eq("followup_sent", false)
      .not("message_ts", "is", null)
      .gte("created_at", minutesAgo50)
      .lte("created_at", minutesAgo40);

    if (queryError) {
      console.error("Query error:", queryError);
      throw new Error(`Failed to query creative_requests: ${queryError.message}`);
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log("No requests in the 45-minute followup window");
      return new Response(JSON.stringify({ success: true, checked: 0, reminded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${pendingRequests.length} requests to check for responses`);

    // Get creative team user IDs
    const teamUserIds = await getCreativeTeamUserIds(slackHeaders);

    let remindedCount = 0;

    for (const request of pendingRequests) {
      const { message_ts, source_channel } = request;
      if (!message_ts || !source_channel) continue;

      // Check thread replies
      const repliesUrl = `${SLACK_API}/conversations.replies?channel=${source_channel}&ts=${message_ts}&limit=50`;
      const repliesResp = await fetch(repliesUrl, { headers: slackHeaders });
      const repliesData = await repliesResp.json();

      let teamResponded = false;

      if (repliesData.ok && repliesData.messages) {
        // Skip the first message (the original), check replies only
        for (const reply of repliesData.messages) {
          if (reply.ts === message_ts) continue; // skip original
          if (teamUserIds.has(reply.user)) {
            teamResponded = true;
            break;
          }
        }
      }

      if (teamResponded) {
        console.log(`Request ${request.id} already responded to, marking followup_sent`);
        await supabase
          .from("creative_requests")
          .update({ followup_sent: true })
          .eq("id", request.id);
        continue;
      }

      // No team response — send reminder to internal notifications channel
      const permalink = `https://slack.com/archives/${source_channel}/p${message_ts.replace(".", "")}`;
      const title = request.name || request.description?.substring(0, 80) || "Creative Request";

      const blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⏰ *Unresponded Creative Request (45 min)*\n\n*${title}*\nRequested by: ${request.requester || "Unknown"}\n\n<${permalink}|View original message>`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "No response from the creative team yet. Please reply to the requester.",
            },
          ],
        },
      ];

      const postResp = await fetch(`${SLACK_API}/chat.postMessage`, {
        method: "POST",
        headers: slackHeaders,
        body: JSON.stringify({
          channel: TARGET_CHANNEL,
          text: `⏰ Unresponded creative request from ${request.requester || "someone"}: ${title}`,
          blocks,
        }),
      });

      const postData = await postResp.json();
      if (!postData.ok) {
        console.error("Failed to post reminder:", postData);
      } else {
        console.log(`Sent followup reminder for request ${request.id}`);
        remindedCount++;
      }

      // Mark followup as sent regardless to avoid repeated pings
      await supabase
        .from("creative_requests")
        .update({ followup_sent: true })
        .eq("id", request.id);
    }

    return new Response(
      JSON.stringify({ success: true, checked: pendingRequests.length, reminded: remindedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in slack-creative-followup:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
