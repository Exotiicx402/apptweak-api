import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CreativeReportingTableProps {
  title: string;
  data: Array<{
    name: string;
    spend: number;
    installs: number;
    cpi: number;
    clicks: number;
    impressions: number;
    ctr?: number;
    cvr?: number;
  }>;
  loading?: boolean;
}

export function CreativeReportingTable({
  title,
  data,
  loading = false,
}: CreativeReportingTableProps) {
  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatNumber = (val: number): string => {
    return new Intl.NumberFormat("en-US").format(val);
  };

  const formatPercent = (val: number): string => {
    return `${(val * 100).toFixed(2)}%`;
  };

  const getHeatmapColor = (value: number, max: number, type: "spend" | "installs"): string => {
    if (max === 0) return "";
    const intensity = value / max;
    
    if (type === "spend") {
      // Blue gradient for spend
      if (intensity > 0.7) return "bg-primary/20";
      if (intensity > 0.4) return "bg-primary/10";
      return "";
    } else {
      // Green gradient for installs
      if (intensity > 0.7) return "bg-green-500/20";
      if (intensity > 0.4) return "bg-green-500/10";
      return "";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedData = [...data].sort((a, b) => b.spend - a.spend);
  const maxSpend = Math.max(...sortedData.map((d) => d.spend));
  const maxInstalls = Math.max(...sortedData.map((d) => d.installs));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Campaign</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Installs</TableHead>
                <TableHead className="text-right">CPI</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CVR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium max-w-[200px] truncate" title={row.name}>
                    {row.name}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      getHeatmapColor(row.spend, maxSpend, "spend")
                    )}
                  >
                    {formatCurrency(row.spend)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      getHeatmapColor(row.installs, maxInstalls, "installs")
                    )}
                  >
                    {formatNumber(row.installs)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.cpi)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.clicks)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(row.impressions)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.ctr !== undefined ? formatPercent(row.ctr) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.cvr !== undefined ? formatPercent(row.cvr) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
