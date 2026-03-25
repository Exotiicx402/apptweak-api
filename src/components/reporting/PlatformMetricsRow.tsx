import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, DollarSign, Download, TrendingUp, Clock, UserCheck, CreditCard } from "lucide-react";
import { PercentChange } from "./PercentChange";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PlatformMetricsRowProps {
  platform: string;
  logo?: string;
  spend: number;
  installs: number;
  cpi: number;
  registrations?: number;
  cps?: number;
  ftds?: number;
  cftd?: number;
  previousSpend?: number;
  previousInstalls?: number;
  previousCpi?: number;
  previousRegistrations?: number;
  previousCps?: number;
  previousFtds?: number;
  previousCftd?: number;
  loading?: boolean;
  error?: string | null;
  dataUnavailable?: boolean;
  unavailableReason?: string;
}

export function PlatformMetricsRow({
  platform,
  logo,
  spend,
  installs,
  cpi,
  registrations = 0,
  cps = 0,
  ftds = 0,
  cftd = 0,
  previousSpend = 0,
  previousInstalls = 0,
  previousCpi = 0,
  previousRegistrations = 0,
  previousCps = 0,
  previousFtds = 0,
  previousCftd = 0,
  loading,
  error,
  dataUnavailable,
  unavailableReason,
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
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
        {dataUnavailable && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  <Clock className="h-3 w-3" />
                  Partial data
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">{unavailableReason || "Today's data is not yet available"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
            <PercentChange current={cpi} previous={previousCpi} className="mt-1" invertColor />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              CPS
            </div>
            <div className="text-xl font-semibold text-foreground">{formatCurrency(cps)}</div>
            <PercentChange current={cps} previous={previousCps} className="mt-1" invertColor />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <CreditCard className="h-3 w-3" />
              FTDs
            </div>
            <div className="text-xl font-semibold text-foreground">{formatNumber(ftds)}</div>
            <PercentChange current={ftds} previous={previousFtds} className="mt-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              CFTD
            </div>
            <div className="text-xl font-semibold text-foreground">{formatCurrency(cftd)}</div>
            <PercentChange current={cftd} previous={previousCftd} className="mt-1" invertColor />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
