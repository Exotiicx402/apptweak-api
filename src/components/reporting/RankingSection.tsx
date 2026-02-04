import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Trophy } from "lucide-react";
import { useRankingHistoryByDateRange } from "@/hooks/useRankingHistoryByDateRange";

interface RankingSectionProps {
  startDate: string;
  endDate: string;
  dataFetched: boolean;
}

export const RankingSection = ({ startDate, endDate, dataFetched }: RankingSectionProps) => {
  const { data: chartData, isLoading, error } = useRankingHistoryByDateRange(startDate, endDate, dataFetched);
  
  const isSingleDay = startDate === endDate;

  if (!dataFetched) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6 mt-8">
        <div className="h-48 animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  if (error || !chartData || chartData.length === 0) {
    return (
      <div className="rounded-xl bg-card border border-border p-6 mt-8 text-center text-muted-foreground">
        No ranking data available for the selected date range
      </div>
    );
  }

  // Single day - show card instead of chart
  if (isSingleDay) {
    const rankData = chartData[0];
    return (
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4 text-foreground">App Store Ranking</h2>
        <div className="rounded-xl bg-card border border-border p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sports Category (Free)</p>
              <p className="text-3xl font-bold text-foreground">#{rankData.rank}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(rankData.date).toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multiple days - show chart
  const formattedData = chartData.map(point => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-4 text-foreground">App Store Ranking</h2>
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-base font-medium">Polymarket - Sports Category (Free)</h3>
        </div>
        
        <div className="h-48">
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
                domain={['dataMin - 2', 'dataMax + 2']}
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
    </div>
  );
};
