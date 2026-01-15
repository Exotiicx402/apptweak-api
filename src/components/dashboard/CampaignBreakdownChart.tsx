import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CampaignBreakdownChartProps {
  title: string;
  data: Array<{ name: string; value: number; [key: string]: any }>;
  dataKey?: string;
  format?: "currency" | "number" | "percent";
  loading?: boolean;
  height?: number;
  layout?: "horizontal" | "vertical";
}

const COLORS = [
  "hsl(224, 100%, 59%)",
  "hsl(224, 100%, 70%)",
  "hsl(224, 100%, 80%)",
  "hsl(142, 76%, 36%)",
  "hsl(142, 76%, 50%)",
  "hsl(48, 96%, 53%)",
  "hsl(48, 96%, 70%)",
  "hsl(0, 72%, 51%)",
  "hsl(0, 72%, 65%)",
  "hsl(280, 67%, 50%)",
];

export function CampaignBreakdownChart({
  title,
  data,
  dataKey = "value",
  format = "number",
  loading = false,
  height = 300,
  layout = "horizontal",
}: CampaignBreakdownChartProps) {
  const formatValue = (val: number): string => {
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(val);
      case "percent":
        return `${val.toFixed(2)}%`;
      case "number":
      default:
        return new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 0,
        }).format(val);
    }
  };

  const truncateName = (name: string, maxLength: number = 20): string => {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + "...";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse bg-muted rounded" style={{ height }} />
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
          <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedData = [...data].sort((a, b) => b.value - a.value).slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {layout === "horizontal" ? (
            <BarChart
              data={sortedData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickFormatter={formatValue}
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickFormatter={(val) => truncateName(val)}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                formatter={(value: number) => [formatValue(value), title]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
                {sortedData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              data={sortedData}
              margin={{ top: 5, right: 10, left: 10, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" vertical={false} />
              <XAxis
                dataKey="name"
                tickFormatter={(val) => truncateName(val, 10)}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                angle={-45}
                textAnchor="end"
              />
              <YAxis
                tickFormatter={formatValue}
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number) => [formatValue(value), title]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
                {sortedData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
