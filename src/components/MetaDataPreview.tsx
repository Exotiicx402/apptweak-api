import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, DollarSign, Eye, Users, MousePointerClick, Percent, TrendingUp, Smartphone } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";

interface MetaCampaignData {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  cpm: string;
  cpc: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface MetaDataPreviewProps {
  data: MetaCampaignData[] | null;
  isLoading: boolean;
  error: string | null;
  previewDate: string | null;
  durationMs?: number | null;
}

const formatNumber = (value: string | number) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? "0" : num.toLocaleString();
};

const formatCurrency = (value: string | number) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? "$0.00" : `$${num.toFixed(2)}`;
};

const formatPercent = (value: string | number) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? "0.00%" : `${num.toFixed(2)}%`;
};

const getAppInstalls = (actions?: Array<{ action_type: string; value: string }>) => {
  if (!actions || actions.length === 0) return 0;
  const installs = actions.find((a) => a.action_type === "mobile_app_install");
  return parseInt(installs?.value || "0", 10);
};

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function MetaDataPreview({ data, isLoading, error, previewDate, durationMs }: MetaDataPreviewProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading Meta data...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Data</CardTitle>
          <CardDescription>
            No campaign data found for {previewDate || "the selected date"}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Calculate summary metrics
  const totalSpend = data.reduce((sum, c) => sum + parseFloat(c.spend || "0"), 0);
  const totalImpressions = data.reduce((sum, c) => sum + parseFloat(c.impressions || "0"), 0);
  const totalReach = data.reduce((sum, c) => sum + parseFloat(c.reach || "0"), 0);
  const totalClicks = data.reduce((sum, c) => sum + parseFloat(c.clicks || "0"), 0);
  const totalInstalls = data.reduce((sum, c) => sum + getAppInstalls(c.actions), 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;

  // Prepare chart data - top 8 campaigns by spend
  const chartData = [...data]
    .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, 8)
    .map((c) => ({
      name: c.campaign_name.length > 25 ? c.campaign_name.slice(0, 25) + "..." : c.campaign_name,
      spend: parseFloat(c.spend || "0"),
      fullName: c.campaign_name,
    }));

  const chartConfig = {
    spend: {
      label: "Spend",
      color: "hsl(var(--chart-1))",
    },
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSpend)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalImpressions)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reach</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalReach)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clicks</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalClicks)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg CTR</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(avgCtr)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg CPC</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgCpc)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Installs</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalInstalls)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg CPI</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgCpi)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Spend by Campaign Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Spend by Campaign</CardTitle>
            <CardDescription>Top {chartData.length} campaigns by spend</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" tickFormatter={(value) => `$${value.toFixed(0)}`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, props) => [
                        `$${Number(value).toFixed(2)}`,
                        props.payload?.fullName || "Spend",
                      ]}
                    />
                  }
                />
                <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>
                {previewDate && `Data for ${previewDate}`}
                {durationMs && ` • Fetched in ${(durationMs / 1000).toFixed(2)}s`}
              </CardDescription>
            </div>
            <Badge variant="secondary">{data.length} campaigns</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px] sticky left-0 bg-background">Campaign</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">CPM</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">App Installs</TableHead>
                    <TableHead className="text-right">CPI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((campaign) => (
                    <TableRow key={campaign.campaign_id}>
                      <TableCell className="font-medium sticky left-0 bg-background">
                        <div>
                          <div className="truncate max-w-[200px]" title={campaign.campaign_name}>
                            {campaign.campaign_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{campaign.campaign_id}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(campaign.impressions)}</TableCell>
                      <TableCell className="text-right">{formatNumber(campaign.reach)}</TableCell>
                      <TableCell className="text-right">{formatNumber(campaign.clicks)}</TableCell>
                      <TableCell className="text-right">{formatPercent(campaign.ctr)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(campaign.spend)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(campaign.cpm)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(campaign.cpc)}</TableCell>
                      <TableCell className="text-right">{formatNumber(getAppInstalls(campaign.actions))}</TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const installs = getAppInstalls(campaign.actions);
                          const spend = parseFloat(campaign.spend || "0");
                          return installs > 0 ? formatCurrency(spend / installs) : "-";
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
          {data.length > 100 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Showing first 100 of {data.length} rows
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
