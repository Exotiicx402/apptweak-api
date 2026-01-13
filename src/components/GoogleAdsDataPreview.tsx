import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, DollarSign, MousePointer, Eye, Download, TrendingUp, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { GoogleAdsCampaignData } from "@/hooks/useGoogleAdsPreview";

interface GoogleAdsDataPreviewProps {
  data: GoogleAdsCampaignData[] | null;
  isLoading: boolean;
  error: string | null;
  previewDate: string | null;
  durationMs: number | null;
}

function formatNumber(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  return num.toLocaleString();
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function formatPercent(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00%";
  return `${num.toFixed(2)}%`;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function GoogleAdsDataPreview({
  data,
  isLoading,
  error,
  previewDate,
  durationMs,
}: GoogleAdsDataPreviewProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Preview...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No Google Ads data available for the selected date.</AlertDescription>
      </Alert>
    );
  }

  // Calculate totals
  const totalSpend = data.reduce((sum, c) => sum + parseFloat(c.spend), 0);
  const totalImpressions = data.reduce((sum, c) => sum + c.impressions, 0);
  const totalClicks = data.reduce((sum, c) => sum + c.clicks, 0);
  const totalInstalls = data.reduce((sum, c) => sum + c.installs, 0);
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCPI = totalInstalls > 0 ? totalSpend / totalInstalls : 0;

  // Top campaigns by spend for chart
  const topCampaigns = [...data]
    .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, 8)
    .map((c) => ({
      name: c.campaign_name.length > 20 ? c.campaign_name.slice(0, 20) + "..." : c.campaign_name,
      spend: parseFloat(c.spend),
    }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Google Ads Preview - {previewDate}</CardTitle>
          <CardDescription>
            {data.length} campaigns found • Fetched in {durationMs}ms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Spend</span>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Installs</span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(totalInstalls)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg CPI</span>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(avgCPI)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Impressions</span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(totalImpressions)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <MousePointer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Clicks</span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(totalClicks)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg CTR</span>
                </div>
                <p className="text-2xl font-bold">{formatPercent(avgCTR)}</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {topCampaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Campaigns by Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCampaigns} layout="vertical" margin={{ left: 20, right: 20 }}>
                <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Spend"]} />
                <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                  {topCampaigns.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Installs</TableHead>
                  <TableHead className="text-right">CPI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((campaign, idx) => (
                  <TableRow key={`${campaign.campaign_id}-${idx}`}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {campaign.campaign_name}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(campaign.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(campaign.clicks)}</TableCell>
                    <TableCell className="text-right">{formatPercent(campaign.ctr)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(campaign.spend)}</TableCell>
                    <TableCell className="text-right">{formatNumber(campaign.installs)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(campaign.cpi)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
