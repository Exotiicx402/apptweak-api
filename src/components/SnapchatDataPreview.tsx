import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DollarSign, Users, MousePointerClick, Eye, TrendingUp, Percent } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { SnapchatPreviewResult } from "@/hooks/useSnapchatPreview";

interface SnapchatDataPreviewProps {
  result: SnapchatPreviewResult;
}

const COLORS = ['hsl(48, 96%, 53%)', 'hsl(280, 65%, 55%)', 'hsl(180, 70%, 45%)', 'hsl(350, 70%, 55%)', 'hsl(120, 50%, 45%)', 'hsl(220, 84%, 50%)'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export default function SnapchatDataPreview({ result }: SnapchatDataPreviewProps) {
  const { summary, data, date, durationMs } = result;

  // Prepare chart data for campaigns
  const campaignChartData = summary.campaigns.slice(0, 8).map((c, idx) => {
    const displayName = c.name || c.id;
    return {
      name: displayName.length > 20 ? displayName.slice(0, 20) + '...' : displayName,
      spend: c.spend,
      fill: COLORS[idx % COLORS.length],
    };
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Spend</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary.totalSpend)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Impressions</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatNumber(summary.totalImpressions)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Swipes</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatNumber(summary.totalSwipes)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Swipe Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatPercent(summary.swipeRate)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Installs</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatNumber(summary.totalInstalls)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Avg CPI</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary.avgCpi)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend by Campaign Chart */}
      {campaignChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by Campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campaignChartData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="spend" fill="hsl(48, 96%, 53%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Raw Data Preview</span>
            <span className="text-sm font-normal text-muted-foreground">
              Date: {date} • Fetched in {durationMs}ms
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Campaign</TableHead>
                  <TableHead>Ad Name</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Swipes</TableHead>
                  <TableHead className="text-right">Installs</TableHead>
                  <TableHead className="text-right">Video Views</TableHead>
                  <TableHead className="text-right">Completions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 100).map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="sticky left-0 bg-background font-medium max-w-[150px] truncate">
                      {row.campaign_name || row.campaign_id}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={row.ad_name || row.ad_id}>
                      {row.ad_name || row.ad_id}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.spend)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.swipes)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.total_installs)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.video_views)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.view_completion)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          {data.length > 100 && (
            <div className="p-3 text-center text-sm text-muted-foreground border-t">
              Showing 100 of {data.length} rows
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
