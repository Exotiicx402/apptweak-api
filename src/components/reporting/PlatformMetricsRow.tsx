import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, DollarSign, Download, TrendingUp } from "lucide-react";
import { PercentChange } from "./PercentChange";

interface PlatformMetricsRowProps {
  platform: string;
  logo?: string;
  spend: number;
  installs: number;
  cpi: number;
  previousSpend?: number;
  previousInstalls?: number;
  previousCpi?: number;
  loading?: boolean;
  error?: string | null;
}

export function PlatformMetricsRow({
  platform,
  logo,
  spend,
  installs,
  cpi,
  previousSpend = 0,
  previousInstalls = 0,
  previousCpi = 0,
  loading,
  error,
}: PlatformMetricsRowProps) {
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
      <div className="mb-6">
        <h3 className="text-md font-medium mb-3 flex items-center gap-2 text-foreground">
          {logo && <img src={logo} alt={platform} className="h-5 w-auto object-contain" />}
          {platform}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-4 pb-4">
                <div className="h-3 bg-muted rounded w-16 mb-2" />
                <div className="h-6 bg-muted rounded w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6">
        <h3 className="text-md font-medium mb-3 flex items-center gap-2 text-foreground">
          {logo && <img src={logo} alt={platform} className="h-5 w-auto object-contain" />}
          {platform}
        </h3>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load: {error}</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h3 className="text-md font-medium mb-3 flex items-center gap-2 text-foreground">
        {logo && <img src={logo} alt={platform} className="h-5 w-auto object-contain" />}
        {platform}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" />
              Spend
            </div>
            <div className="text-xl font-semibold text-foreground">{formatCurrency(spend)}</div>
            <PercentChange current={spend} previous={previousSpend} className="mt-1" />
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Download className="h-3 w-3" />
              Installs
            </div>
            <div className="text-xl font-semibold text-foreground">{formatNumber(installs)}</div>
            <PercentChange current={installs} previous={previousInstalls} className="mt-1" />
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              CPI
            </div>
            <div className="text-xl font-semibold text-foreground">{formatCurrency(cpi)}</div>
            <PercentChange current={cpi} previous={previousCpi} className="mt-1" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
