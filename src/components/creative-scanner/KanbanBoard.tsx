import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, User, Monitor, Maximize, GripVertical, Trash2, Send, Loader2 } from "lucide-react";
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

interface KanbanBoardProps {
  requests: CreativeRequest[];
  onStatusChange: () => void;
}

export default function KanbanBoard({ requests, onStatusChange }: KanbanBoardProps) {
  const [localRequests, setLocalRequests] = useState<CreativeRequest[]>(requests);
  const [pushingIds, setPushingIds] = useState<Set<string>>(new Set());

  // Keep local state in sync when props change (but not during drag)
  const requestsKey = requests.map((r) => `${r.id}:${r.status}`).join(",");
  const [lastKey, setLastKey] = useState(requestsKey);
  if (requestsKey !== lastKey) {
    setLocalRequests(requests);
    setLastKey(requestsKey);
  }

  const grouped: Record<ColumnKey, CreativeRequest[]> = {
    new: [],
    in_progress: [],
    done: [],
  };

  localRequests.forEach((r) => {
    const status = (r.status as ColumnKey) || "new";
    if (grouped[status]) grouped[status].push(r);
    else grouped.new.push(r);
  });

  const onDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    const newStatus = destination.droppableId as ColumnKey;
    const item = localRequests.find((r) => r.id === draggableId);
    if (!item || item.status === newStatus) return;

    // Optimistic update
    setLocalRequests((prev) =>
      prev.map((r) => (r.id === draggableId ? { ...r, status: newStatus } : r))
    );

    const { error } = await supabase
      .from("creative_requests")
      .update({ status: newStatus })
      .eq("id", draggableId);

    if (error) {
      toast.error("Failed to update status");
      setLocalRequests((prev) =>
        prev.map((r) => (r.id === draggableId ? { ...r, status: item.status } : r))
      );
    } else {
      onStatusChange();
    }
  };

  const handleDelete = async (id: string) => {
    setLocalRequests((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("creative_requests").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete request");
      setLocalRequests(requests);
    } else {
      toast.success("Request deleted");
      onStatusChange();
    }
  };

  const handlePushToSlackList = async (id: string) => {
    setPushingIds((prev) => new Set(prev).add(id));
    try {
      const { data, error } = await supabase.functions.invoke("push-to-slack-list", {
        body: { request_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Pushed to PM: Creative Tracker list!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to push to Slack List");
    } finally {
      setPushingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
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
            <Droppable droppableId={col.key}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-h-[200px] rounded-lg transition-colors ${
                    snapshot.isDraggingOver ? "bg-accent/40" : ""
                  }`}
                >
                  <ScrollArea className="h-[calc(100vh-380px)]">
                    <div className="space-y-2.5 pr-2 pb-2">
                      {grouped[col.key].length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          Drop requests here
                        </p>
                      )}
                      {grouped[col.key].map((req, index) => (
                        <Draggable key={req.id} draggableId={req.id} index={index}>
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`p-3 transition-shadow ${
                                snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
                              }`}
                            >
                              <div className="flex items-start gap-2 mb-2">
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                                <Badge
                                  variant={req.priority === "High" ? "destructive" : "secondary"}
                                  className="text-[10px] shrink-0"
                                >
                                  {req.priority === "High" ? "🔴 High" : "Normal"}
                                </Badge>
                                <div className="ml-auto flex items-center gap-1.5">
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
                                  <button
                                    onClick={() => handleDelete(req.id)}
                                    className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors"
                                    title="Delete request"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
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
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
