import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ExternalLink,
  User,
  Monitor,
  Maximize,
  Calendar,
  Figma,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface CreativeRequest {
  id: string;
  description: string;
  raw_message?: string | null;
  requester: string | null;
  platform: string | null;
  format: string | null;
  priority: string | null;
  message_ts: string | null;
  source_channel: string | null;
  status: string | null;
  created_at: string;
  inspiration_url: string | null;
  deadline: string | null;
  figma_url: string | null;
  thread_context: string | null;
}

const SOURCE_CHANNEL = "C09HBDKSUGH";

export function getMessageDate(messageTs: string | null): string {
  if (!messageTs) return "Unknown";
  const ts = parseFloat(messageTs);
  if (isNaN(ts)) return "Unknown";
  return (
    new Date(ts * 1000).toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " EST"
  );
}

export function getPermalink(messageTs: string | null) {
  if (!messageTs) return null;
  return `https://slack.com/archives/${SOURCE_CHANNEL}/p${messageTs.replace(".", "")}`;
}

function parseInspirationUrls(url: string | null): string[] {
  if (!url) return [];
  return url
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

function isImageUrl(url: string): boolean {
  // Match common image extensions OR Supabase storage URLs in creative-assets/slack-attachments
  return /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(url) ||
    /\/storage\/v1\/object\/public\/creative-assets\/slack-attachments\//i.test(url);
}

function getThreadReplyCount(threadContext: string | null): number {
  if (!threadContext) return 0;
  return threadContext.split("\n---\n").length;
}

interface SlackMessageCardProps {
  req: CreativeRequest;
  /** Extra elements rendered in the top-right corner (drag handle, action buttons, etc.) */
  actions?: React.ReactNode;
  className?: string;
}

export default function SlackMessageCard({ req, actions, className }: SlackMessageCardProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);

  const displayText = req.raw_message || req.description;
  const attachmentUrls = parseInspirationUrls(req.inspiration_url);
  const imageUrls = attachmentUrls.filter(isImageUrl);
  const linkUrls = attachmentUrls.filter((u) => !isImageUrl(u));
  const threadCount = getThreadReplyCount(req.thread_context);

  return (
    <>
      <Card className={`p-3 ${className || ""}`}>
        {/* Header: requester + time + priority + actions */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-bold text-foreground truncate flex items-center gap-1">
            <User className="h-3 w-3 text-muted-foreground shrink-0" />
            {req.requester || "Unknown"}
          </span>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {getMessageDate(req.message_ts)}
          </span>
          <Badge
            variant={req.priority === "High" ? "destructive" : "secondary"}
            className="text-[10px] shrink-0 ml-auto"
          >
            {req.priority === "High" ? "🔴 High" : "Normal"}
          </Badge>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </div>

        {/* Message body */}
        <p className="text-xs text-foreground whitespace-pre-wrap mb-2 leading-relaxed">
          {displayText}
        </p>

        {/* Image attachments */}
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {imageUrls.map((url, i) => (
              <button
                key={i}
                onClick={() => setExpandedImage(expandedImage === url ? null : url)}
                className="rounded-md overflow-hidden border border-border hover:border-primary/50 transition-colors"
              >
                <img
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="h-16 w-auto object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Expanded image */}
        {expandedImage && (
          <div className="mb-2 rounded-md overflow-hidden border border-border">
            <img
              src={expandedImage}
              alt="Expanded attachment"
              className="w-full h-auto max-h-64 object-contain bg-muted"
            />
          </div>
        )}

        {/* Link attachments */}
        {linkUrls.length > 0 && (
          <div className="flex flex-col gap-0.5 mb-2">
            {linkUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline truncate flex items-center gap-0.5"
              >
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                {url.length > 60 ? url.substring(0, 57) + "..." : url}
              </a>
            ))}
          </div>
        )}

        {/* Metadata pills */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {req.platform && req.platform !== "Not specified" && (
            <span className="flex items-center gap-0.5">
              <Monitor className="h-2.5 w-2.5" />
              {req.platform}
            </span>
          )}
          {req.format && req.format !== "Not specified" && (
            <span className="flex items-center gap-0.5">
              <Maximize className="h-2.5 w-2.5" />
              {req.format}
            </span>
          )}
          {req.deadline && (
            <span className="flex items-center gap-0.5 text-destructive font-medium">
              <Calendar className="h-2.5 w-2.5" />
              {req.deadline}
            </span>
          )}
          {req.figma_url && (
            <a
              href={req.figma_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-primary hover:underline"
            >
              <Figma className="h-2.5 w-2.5" />
              Figma
            </a>
          )}
          {req.message_ts && (
            <a
              href={getPermalink(req.message_ts)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 hover:text-primary transition-colors"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Slack
            </a>
          )}
        </div>

        {/* Thread replies */}
        {threadCount > 0 && (
          <Collapsible open={threadOpen} onOpenChange={setThreadOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 mt-2 text-[10px] text-primary hover:underline cursor-pointer">
              <MessageSquare className="h-2.5 w-2.5" />
              {threadCount} thread {threadCount === 1 ? "reply" : "replies"}
              {threadOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 pl-2 border-l-2 border-muted text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {req.thread_context}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </Card>
    </>
  );
}
