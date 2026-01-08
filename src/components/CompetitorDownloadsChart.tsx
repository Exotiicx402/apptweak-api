import { TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCompetitorDownloadsHistory, COMPETITOR_APPS } from "@/hooks/useCompetitorDownloadsHistory";
import { Skeleton } from "@/components/ui/skeleton";

export const CompetitorDownloadsChart = () => {
  const { data: chartData, isLoading, isError } = useCompetitorDownloadsHistory(8);

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <Skeleton className="h-4 w-64 mb-4" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (isError || !chartData || chartData.length === 0) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Competitor Downloads (Last 7 Days)</h3>
        </div>
        <p className="text-sm text-muted-foreground">No competitor data available</p>
      </div>
    );
  }

  // Calculate totals for each competitor
  const totals = COMPETITOR_APPS.map(app => {
    const total = chartData.reduce((sum, point) => sum + (Number(point[app.name]) || 0), 0);
    return { name: app.name, total, color: app.color };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Competitor Downloads (Last 7 Days)</h3>
          </div>
        </div>
      </div>
      
      {/* Legend with totals */}
      <div className="px-4 py-3 border-b border-border flex flex-wrap gap-4">
        {totals.map(({ name, total, color }) => (
          <div key={name} className="flex items-center gap-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: color }}
            />
            <span className="text-muted-foreground">{name}:</span>
            <span className="font-medium text-foreground">{total.toLocaleString()}</span>
          </div>
        ))}
      </div>
      
      <div className="p-4">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                formatter={(value: number, name: string) => [value.toLocaleString(), name]}
              />
              {COMPETITOR_APPS.map(app => (
                <Line
                  key={app.id}
                  type="monotone"
                  dataKey={app.name}
                  stroke={app.color}
                  strokeWidth={2}
                  dot={{ fill: app.color, strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, fill: app.color }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
