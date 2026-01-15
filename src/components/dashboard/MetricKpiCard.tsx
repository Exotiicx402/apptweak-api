import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricKpiCardProps {
  title: string;
  value: string | number;
  previousValue?: number;
  currentValue?: number;
  format?: "currency" | "number" | "percent";
  icon?: React.ReactNode;
  loading?: boolean;
}

export function MetricKpiCard({
  title,
  value,
  previousValue,
  currentValue,
  format = "number",
  icon,
  loading = false,
}: MetricKpiCardProps) {
  const formatValue = (val: number | string): string => {
    if (typeof val === "string") return val;
    
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(val);
      case "percent":
        return `${val.toFixed(2)}%`;
      case "number":
      default:
        return new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 2,
        }).format(val);
    }
  };

  const calculateChange = (): { percent: number; direction: "up" | "down" | "neutral" } => {
    if (previousValue === undefined || currentValue === undefined || previousValue === 0) {
      return { percent: 0, direction: "neutral" };
    }
    
    const change = ((currentValue - previousValue) / previousValue) * 100;
    return {
      percent: Math.abs(change),
      direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
    };
  };

  const { percent, direction } = calculateChange();

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-4 bg-muted rounded w-24" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-muted rounded w-32 mb-2" />
          <div className="h-4 bg-muted rounded w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {previousValue !== undefined && currentValue !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {direction === "up" && (
              <ArrowUp className="h-4 w-4 text-green-500" />
            )}
            {direction === "down" && (
              <ArrowDown className="h-4 w-4 text-red-500" />
            )}
            {direction === "neutral" && (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
            <span
              className={cn(
                "text-sm",
                direction === "up" && "text-green-500",
                direction === "down" && "text-red-500",
                direction === "neutral" && "text-muted-foreground"
              )}
            >
              {percent.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">vs previous period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
