import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import type { DiagnosticsResponse } from "@/hooks/useSnapchatDiagnostics";

interface SnapchatDiagnosticsProps {
  result: DiagnosticsResponse;
  targetInstalls?: number;
}

function formatNumber(value: number): string {
  if (value < 0) return 'Error';
  return new Intl.NumberFormat('en-US').format(value);
}

export default function SnapchatDiagnostics({ result, targetInstalls }: SnapchatDiagnosticsProps) {
  const { results, date, durationMs } = result;

  // Sort by total_installs descending to see highest values first
  const sortedResults = [...results].sort((a, b) => b.total_installs - a.total_installs);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Attribution Window Diagnostics</span>
          <span className="text-sm font-normal text-muted-foreground">
            Date: {date} • Tested in {durationMs}ms
          </span>
        </CardTitle>
        <CardDescription>
          Compare install counts across different attribution window settings.
          {targetInstalls && (
            <span className="ml-2 font-medium text-foreground">
              Looking for: {formatNumber(targetInstalls)} installs
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Swipe Window</TableHead>
              <TableHead>View Window</TableHead>
              <TableHead>Report Time</TableHead>
              <TableHead className="text-right">Total Installs</TableHead>
              <TableHead className="text-right">iOS</TableHead>
              <TableHead className="text-right">Android</TableHead>
              <TableHead className="text-center">Match?</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedResults.map((row, idx) => {
              const isMatch = targetInstalls && row.total_installs === targetInstalls;
              const isClose = targetInstalls && Math.abs(row.total_installs - targetInstalls) <= 10;
              
              return (
                <TableRow 
                  key={idx} 
                  className={isMatch ? 'bg-green-500/10' : isClose ? 'bg-yellow-500/10' : ''}
                >
                  <TableCell>
                    <Badge variant="outline">{row.swipe_up_attribution_window}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.view_attribution_window}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.action_report_time === 'conversion' ? 'default' : 'secondary'}>
                      {row.action_report_time}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {formatNumber(row.total_installs)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatNumber(row.ios_installs)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatNumber(row.android_installs)}
                  </TableCell>
                  <TableCell className="text-center">
                    {isMatch && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
