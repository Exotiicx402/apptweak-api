import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import SlackMessageCard, { type CreativeRequest } from "./SlackMessageCard";

const COLUMNS = [
  { key: "new", label: "New", color: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-500" },
  { key: "in_progress", label: "In Progress", color: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-500" },
  { key: "done", label: "Done", color: "bg-green-500/10 border-green-500/30", dot: "bg-green-500" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

export default function ReadOnlyKanbanBoard({ requests }: { requests: CreativeRequest[] }) {
  const grouped: Record<ColumnKey, CreativeRequest[]> = { new: [], in_progress: [], done: [] };
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
                <SlackMessageCard key={req.id} req={req} />
              ))}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}
