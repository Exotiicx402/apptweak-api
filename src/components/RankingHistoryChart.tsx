import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAppTweakRankingHistory } from "@/hooks/useAppTweakRankingHistory";
import { TrendingUp } from "lucide-react";

export const RankingHistoryChart = () => {
  const { data: chartData, isLoading, error } = useAppTweakRankingHistory();

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="h-64 animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  if (error || !chartData || chartData.length === 0) {
    return (
      <div className="rounded-xl bg-card border border-border p-6 text-center text-muted-foreground">
        No ranking history available
      </div>
    );
  }

  // Format data for the chart - invert rank so higher = better visually
  const formattedData = chartData.map(point => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Ranking History (Sports - Free)</h2>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formattedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="displayDate" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              reversed
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              domain={['dataMin - 10', 'dataMax + 10']}
              label={{ 
                value: 'Rank', 
                angle: -90, 
                position: 'insideLeft',
                style: { fill: 'hsl(var(--muted-foreground))' }
              }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--foreground))',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number) => [`#${value}`, 'Rank']}
            />
            <Line 
              type="monotone" 
              dataKey="rank" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <p className="text-xs text-muted-foreground mt-4 text-center">
        Lower rank number = higher position in charts
      </p>
    </div>
  );
};
