import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useSyncLogs, SyncLog } from "@/hooks/useSyncLogs";
import { format, formatDistanceToNow } from "date-fns";

interface SyncLogTableProps {
  source?: 'unity' | 'snapchat';
  limit?: number;
}

export default function SyncLogTable({ source, limit = 20 }: SyncLogTableProps) {
  const { data: logs, isLoading, error } = useSyncLogs(source, limit);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading sync logs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Failed to load sync logs
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No sync logs yet
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">Status</TableHead>
            {!source && <TableHead>Source</TableHead>}
            <TableHead>Date Synced</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>
                {log.status === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-primary" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
              </TableCell>
              {!source && (
                <TableCell>
                  <Badge variant={log.source === 'unity' ? 'default' : 'secondary'}>
                    {log.source}
                  </Badge>
                </TableCell>
              )}
              <TableCell className="font-mono text-sm">{log.sync_date}</TableCell>
              <TableCell className="text-right">
                {log.rows_affected !== null ? log.rows_affected.toLocaleString() : '-'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {log.duration_ms !== null ? `${(log.duration_ms / 1000).toFixed(1)}s` : '-'}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm" title={format(new Date(log.created_at), 'PPpp')}>
                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
