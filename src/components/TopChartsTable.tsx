import { useAppTweakTopCharts } from '@/hooks/useAppTweakTopCharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';

const POLYMARKET_APP_ID = '6648798962';

export const TopChartsTable = () => {
  const { data, isLoading, error } = useAppTweakTopCharts();

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-destructive text-sm">Failed to load top charts</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Top Free Sports Apps (US)</h3>
        </div>
        {data?.date && (
          <p className="text-xs text-muted-foreground mt-1">
            Updated: {new Date(data.date).toLocaleDateString()}
          </p>
        )}
      </div>
      
      <div className="max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>App ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                </TableRow>
              ))
            ) : data?.apps.length ? (
              data.apps.map((app) => (
                <TableRow 
                  key={app.id}
                  className={app.id === POLYMARKET_APP_ID ? 'bg-primary/10 border-l-2 border-l-primary' : ''}
                >
                  <TableCell className="font-medium">
                    #{app.rank}
                  </TableCell>
                  <TableCell className={app.id === POLYMARKET_APP_ID ? 'font-semibold text-primary' : ''}>
                    {app.id}
                    {app.id === POLYMARKET_APP_ID && (
                      <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                        Polymarket
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No apps found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
