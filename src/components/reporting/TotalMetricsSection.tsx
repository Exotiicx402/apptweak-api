import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, UserPlus, CreditCard, Target } from "lucide-react";
import { PercentChange } from "./PercentChange";

interface TotalMetricsSectionProps {
  spend: number;
  cpi: number;
  cps: number;
  ftds: number;
  cftd: number;
  previousSpend?: number;
  previousCpi?: number;
  previousCps?: number;
  previousFtds?: number;
  previousCftd?: number;
  loading?: boolean;
}

export function TotalMetricsSection({
  spend, cpi, cps, ftds, cftd,
  previousSpend = 0, previousCpi = 0, previousCps = 0,
  previousFtds = 0, previousCftd = 0,
  loading,
}: TotalMetricsSectionProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

  const metrics = [
    { icon: DollarSign, label: "Total Spend", value: formatCurrency(spend), current: spend, previous: previousSpend, invertColor: false },
    { icon: TrendingUp, label: "CPI", value: formatCurrency(cpi), current: cpi, previous: previousCpi, invertColor: true },
    { icon: UserPlus, label: "CPS", value: formatCurrency(cps), current: cps, previous: previousCps, invertColor: true },
    { icon: CreditCard, label: "Total FTD", value: formatNumber(ftds), current: ftds, previous: previousFtds, invertColor: false },
    { icon: Target, label: "CFTD", value: formatCurrency(cftd), current: cftd, previous: previousCftd, invertColor: true },
  ];

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Total (All Channels)</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-5 pb-4">
                <div className="h-3 bg-muted rounded w-16 mb-2" />
                <div className="h-7 bg-muted rounded w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6 mb-8">
      <h2 className="text-lg font-semibold mb-4 text-foreground">Total (All Channels)</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {metrics.map(({ icon: Icon, label, value, current, previous }) => (
          <Card key={label} className="bg-background/80 backdrop-blur">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <div className="text-2xl font-bold text-foreground">{value}</div>
              <PercentChange current={current} previous={previous} className="mt-1.5" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
