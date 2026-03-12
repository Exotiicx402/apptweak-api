import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, User, Monitor, Maximize, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  { key: "new", label: "New", color: "bg-blue-500/10 border-blue-500/30" },
  { key: "in_progress", label: "In Progress", color: "bg-yellow-500/10 border-yellow-500/30" },
  { key: "done", label: "Done", color: "bg-green-500/10 border-green-500/30" },
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

interface KanbanBoardProps {
  requests: CreativeRequest[];
  onStatusChange: () => void;
}

export default function KanbanBoard({ requests, onStatusChange }: KanbanBoardProps) {
  const [updating, setUpdating] = useState<string | null>(null);

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

  const moveRequest = async (id: string, newStatus: ColumnKey) => {
    setUpdating(id);
    const { error } = await supabase
      .from("creative_requests")
      .update({ status: newStatus })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`Moved to ${COLUMNS.find((c) => c.key === newStatus)?.label}`);
      onStatusChange();
    }
    setUpdating(null);
  };

  const colIndex = (key: ColumnKey) => COLUMNS.findIndex((c) => c.key === key);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map((col) => (
        <div key={col.key} className={`rounded-xl border-2 ${col.color} p-3`}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-semibold text-sm text-foreground">{col.label}</h3>
            <Badge variant="secondary" className="text-xs">
              {grouped[col.key].length}
            </Badge>
          </div>
          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="space-y-2.5 pr-2">
              {grouped[col.key].length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No requests</p>
              )}
              {grouped[col.key].map((req) => (
                <Card
                  key={req.id}
                  className={`p-3 transition-opacity ${updating === req.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Badge
                      variant={req.priority === "High" ? "destructive" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {req.priority === "High" ? "🔴 High" : "Normal"}
                    </Badge>
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
                  <p className="text-xs font-medium text-foreground mb-2 line-clamp-3">
                    {req.description}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground mb-2.5">
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
                  <div className="flex gap-1">
                    {colIndex(col.key) > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={updating === req.id}
                        onClick={() => moveRequest(req.id, COLUMNS[colIndex(col.key) - 1].key)}
                      >
                        <ChevronLeft className="h-3 w-3 mr-0.5" />
                        {COLUMNS[colIndex(col.key) - 1].label}
                      </Button>
                    )}
                    {colIndex(col.key) < COLUMNS.length - 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] ml-auto"
                        disabled={updating === req.id}
                        onClick={() => moveRequest(req.id, COLUMNS[colIndex(col.key) + 1].key)}
                      >
                        {COLUMNS[colIndex(col.key) + 1].label}
                        <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Button>
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
