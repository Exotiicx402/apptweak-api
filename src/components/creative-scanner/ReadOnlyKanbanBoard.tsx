import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, User, Monitor, Maximize } from "lucide-react";

interface CreativeRequest {
  id: string;
  description: string;
  requester: string | null;
  platform: string | null;
  format: string | null;
  priority: string | null;
  message_ts: string | null;
  source_channel: string | null;
  status: string | null;
  created_at: string;
}

const SOURCE_CHANNEL = "C09HBDKSUGH";

const COLUMNS = [
  { key: "new", label: "New", color: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500" },
  { key: "in_progress", label: "In Progress", color: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-500" },
  { key: "done", label: "Done", color: "bg-green-500/10 border-green-500/30", dot: "bg-green-500" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

function getMessageDate(messageTs: string | null): string {
  if (!messageTs) return "Unknown";
  const ts = parseFloat(messageTs);
  if (isNaN(ts)) return "Unknown";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " EST";
}

function getPermalink(messageTs: string | null) {
  if (!messageTs) return null;
  return `https://slack.com/archives/${SOURCE_CHANNEL}/p${messageTs.replace(".", "")}`;
}

export default function ReadOnlyKanbanBoard({ requests }: { requests: CreativeRequest[] }) {
  const grouped: Record<ColumnKey, CreativeRequest[]> = {
    new: [],
    in_progress: [],
    done: [],
  };

  requests.forEach((r) => {
    const status = (r.status as ColumnKey) || "new";
    if (grouped[status]) grouped[status].push(r);
    else grouped.new.push(r);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map((col) => (
        <div key={col.key} className={`rounded-xl border-2 ${col.color} p-3`}>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
            <h3 className="font-semibold text-sm text-foreground">{col.label}</h3>
            <Badge variant="secondary" className="text-xs ml-auto">
              {grouped[col.key].length}
            </Badge>
          </div>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-2.5 pr-2 pb-2 min-h-[200px]">
              {grouped[col.key].length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No requests</p>
              )}
              {grouped[col.key].map((req) => (
                <Card key={req.id} className="p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <Badge
                      variant={req.priority === "High" ? "destructive" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {req.priority === "High" ? "🔴 High" : "Normal"}
                    </Badge>
                    <div className="ml-auto">
                      {req.message_ts && (
                        <a
                          href={getPermalink(req.message_ts)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          title="View in Slack"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="text-xs font-medium text-foreground mb-2 line-clamp-3">
                    {req.description}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span>{getMessageDate(req.message_ts)}</span>
                    {req.requester && (
                      <span className="flex items-center gap-0.5">
                        <User className="h-2.5 w-2.5" />
                        {req.requester}
                      </span>
                    )}
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
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}
