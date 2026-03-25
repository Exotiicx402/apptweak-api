import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PercentChangeProps {
  current: number;
  previous: number;
  className?: string;
  /** When true, an increase is bad (red) and a decrease is good (green). Use for cost metrics like CPI, CPS, CFTD. */
  invertColor?: boolean;
}

export function PercentChange({ current, previous, className, invertColor = false }: PercentChangeProps) {
  if (previous === 0) {
    return (
      <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Minus className="h-3 w-3" />
        <span>-</span>
      </div>
    );
  }

  const change = ((current - previous) / previous) * 100;
  const isPositive = change > 0;
  const isNegative = change < 0;

  // Color based on whether the change is "good" or "bad"
  const isGood = invertColor ? isNegative : isPositive;
  const isBad = invertColor ? isPositive : isNegative;

  const colorClass = isGood
    ? "text-green-600 dark:text-green-400" 
    : isBad 
    ? "text-red-600 dark:text-red-400" 
    : "text-muted-foreground";

  const Icon = isPositive ? ArrowUp : isNegative ? ArrowDown : Minus;
  const sign = isPositive ? "+" : "";

  return (
    <div className={cn("flex items-center gap-1 text-xs", colorClass, className)}>
      <Icon className="h-3 w-3" />
      <span>{sign}{change.toFixed(1)}%</span>
    </div>
  );
}
