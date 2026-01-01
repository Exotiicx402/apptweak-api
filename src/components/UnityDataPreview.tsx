import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DollarSign, Users, MousePointerClick, TrendingUp, Database } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import type { UnityPreviewResult } from "@/hooks/useUnityPreview";

interface UnityDataPreviewProps {
  result: UnityPreviewResult;
}

const COLORS = ['hsl(220, 84%, 50%)', 'hsl(180, 70%, 45%)', 'hsl(280, 65%, 55%)', 'hsl(40, 90%, 50%)', 'hsl(350, 70%, 55%)', 'hsl(120, 50%, 45%)'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export default function UnityDataPreview({ result }: UnityDataPreviewProps) {
  const { summary, data, date, durationMs } = result;

  // Prepare chart data - limit to top entries
  const campaignChartData = summary.campaigns.slice(0, 8).map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '...' : c.name,
    spend: c.spend,
  }));

  const countryChartData = summary.countries.slice(0, 6).map(c => ({
    name: c.name,
    installs: c.installs,
  }));

  const platformChartData = summary.platforms.map(p => ({
    name: p.name,
    spend: p.spend,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Installs</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatNumber(summary.totalInstalls)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Clicks</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatNumber(summary.totalClicks)}</p>
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
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Rows</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatNumber(summary.rowCount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Spend by Campaign */}
        {campaignChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend by Campaign</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignChartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="spend" fill="hsl(220, 84%, 50%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Installs by Country (Pie) */}
        {countryChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Installs by Country</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={countryChartData}
                      dataKey="installs"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {countryChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatNumber(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Spend by Platform */}
      {platformChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformChartData} margin={{ left: 20, right: 20 }}>
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="spend" fill="hsl(180, 70%, 45%)" radius={[4, 4, 0, 0]} />
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
                  <TableHead>Country</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Installs</TableHead>
                  <TableHead className="text-right">CPI</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CVR</TableHead>
                  <TableHead className="text-right">D0 ROAS</TableHead>
                  <TableHead className="text-right">D7 ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 100).map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="sticky left-0 bg-background font-medium max-w-[200px] truncate">
                      {row.campaign_name || row.campaign_id}
                    </TableCell>
                    <TableCell>{row.country}</TableCell>
                    <TableCell>{row.platform}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.spend)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.installs)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.cpi)}</TableCell>
                    <TableCell className="text-right">{(row.ctr * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{(row.cvr * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{(row.d0_total_roas * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{(row.d7_total_roas * 100).toFixed(1)}%</TableCell>
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
