import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GripVertical, Trash2, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SlackMessageCard, { type CreativeRequest } from "./SlackMessageCard";

const COLUMNS = [
  { key: "new", label: "New", color: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500" },
  { key: "in_progress", label: "In Progress", color: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-500" },
  { key: "done", label: "Done", color: "bg-green-500/10 border-green-500/30", dot: "bg-green-500" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

interface KanbanBoardProps {
  requests: CreativeRequest[];
  onStatusChange: () => void;
}

export default function KanbanBoard({ requests, onStatusChange }: KanbanBoardProps) {
  const [localRequests, setLocalRequests] = useState<CreativeRequest[]>(requests);
  const [pushingIds, setPushingIds] = useState<Set<string>>(new Set());

  const requestsKey = requests.map((r) => `${r.id}:${r.status}`).join(",");
  const [lastKey, setLastKey] = useState(requestsKey);
  if (requestsKey !== lastKey) {
    setLocalRequests(requests);
    setLastKey(requestsKey);
  }

  const grouped: Record<ColumnKey, CreativeRequest[]> = { new: [], in_progress: [], done: [] };
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
    setLocalRequests((prev) => prev.map((r) => (r.id === draggableId ? { ...r, status: newStatus } : r)));
    const { error } = await supabase.from("creative_requests").update({ status: newStatus }).eq("id", draggableId);
    if (error) {
      toast.error("Failed to update status");
      setLocalRequests((prev) => prev.map((r) => (r.id === draggableId ? { ...r, status: item.status } : r)));
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
      const { data, error } = await supabase.functions.invoke("push-to-slack-list", { body: { request_id: id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Pushed to PM: Creative Tracker list!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to push to Slack List");
    } finally {
      setPushingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
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
                  className={`min-h-[200px] rounded-lg transition-colors ${snapshot.isDraggingOver ? "bg-accent/40" : ""}`}
                >
                  <ScrollArea className="h-[calc(100vh-380px)]">
                    <div className="space-y-2.5 pr-2 pb-2">
                      {grouped[col.key].length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-muted-foreground text-center py-8">Drop requests here</p>
                      )}
                      {grouped[col.key].map((req, index) => (
                        <Draggable key={req.id} draggableId={req.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={snapshot.isDragging ? "ring-2 ring-primary/20 rounded-lg" : ""}
                            >
                              <SlackMessageCard
                                req={req}
                                className={snapshot.isDragging ? "shadow-lg" : ""}
                                actions={
                                  <>
                                    <div
                                      {...provided.dragHandleProps}
                                      className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                                    >
                                      <GripVertical className="h-3.5 w-3.5" />
                                    </div>
                                    <button
                                      onClick={() => handlePushToSlackList(req.id)}
                                      disabled={pushingIds.has(req.id)}
                                      className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                                      title="Push to PM: Creative Tracker"
                                    >
                                      {pushingIds.has(req.id) ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Send className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => handleDelete(req.id)}
                                      className="text-muted-foreground/40 hover:text-destructive transition-colors"
                                      title="Delete request"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                }
                              />
                            </div>
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
