import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Download, TrendingUp } from "lucide-react";
import { PercentChange } from "./PercentChange";

interface TotalMetricsSectionProps {
  spend: number;
  installs: number;
  cpi: number;
  previousSpend?: number;
  previousInstalls?: number;
  previousCpi?: number;
  loading?: boolean;
}

export function TotalMetricsSection({ 
  spend, 
  installs, 
  cpi, 
  previousSpend = 0,
  previousInstalls = 0,
  previousCpi = 0,
  loading 
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

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Total (All Channels)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-4 bg-muted rounded w-20 mb-2" />
                <div className="h-8 bg-muted rounded w-32" />
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-background/80 backdrop-blur">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total Spend
            </div>
            <div className="text-3xl font-bold text-foreground">{formatCurrency(spend)}</div>
            <PercentChange current={spend} previous={previousSpend} invertColors className="mt-2" />
          </CardContent>
        </Card>
        
        <Card className="bg-background/80 backdrop-blur">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Download className="h-4 w-4" />
              Total Installs
            </div>
            <div className="text-3xl font-bold text-foreground">{formatNumber(installs)}</div>
            <PercentChange current={installs} previous={previousInstalls} className="mt-2" />
          </CardContent>
        </Card>
        
        <Card className="bg-background/80 backdrop-blur">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Blended CPI
            </div>
            <div className="text-3xl font-bold text-foreground">{formatCurrency(cpi)}</div>
            <PercentChange current={cpi} previous={previousCpi} invertColors className="mt-2" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
