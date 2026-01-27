import { Download, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useASCDownloads } from "@/hooks/useASCDownloads";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ASCDownloadsChartProps {
  appName: string;
}

export const ASCDownloadsChart = ({ appName }: ASCDownloadsChartProps) => {
  const { data: result, isLoading, error } = useASCDownloads(7);

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const historyData = result?.data || [];
  const dataDelayed = result?.dataDelayed;
  const message = result?.message;

  if (error || historyData.length === 0 || historyData.every(d => d.downloads === 0)) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">{appName} - Downloads (Last 7 Days)</h3>
          <Badge variant="secondary" className="ml-2 text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
            App Store Connect
          </Badge>
          <Badge variant="outline" className="text-xs">Official</Badge>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
          <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-muted-foreground">
              {message || (dataDelayed 
                ? "Apple reports can lag 24-48 hours. Data will appear once available."
                : error?.message || "No download data available")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formattedData = historyData.map(point => ({
    ...point,
    displayDate: format(new Date(`${point.date}T00:00:00`), "MMM d"),
    formattedDownloads: point.downloads.toLocaleString(),
  }));

  const totalDownloads = historyData.reduce((sum, d) => sum + d.downloads, 0);
  const avgDownloads = Math.round(totalDownloads / historyData.length);

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">{appName} - Downloads (Last 7 Days)</h3>
            <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
              App Store Connect
            </Badge>
            <Badge variant="outline" className="text-xs">Official</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-muted-foreground">
              Total: <span className="font-medium text-foreground">{totalDownloads.toLocaleString()}</span>
            </div>
            <div className="text-muted-foreground">
              Avg: <span className="font-medium text-foreground">{avgDownloads.toLocaleString()}/day</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="displayDate" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [value.toLocaleString(), "Downloads"]}
              />
              <Line
                type="monotone"
                dataKey="downloads"
                stroke="hsl(210 100% 50%)"
                strokeWidth={2}
                dot={{ fill: "hsl(210 100% 50%)", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: "hsl(210 100% 50%)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
