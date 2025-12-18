import { Download, TrendingUp, DollarSign } from "lucide-react";
import { useAppTweakMetrics } from "@/hooks/useAppTweakMetrics";
import { Skeleton } from "@/components/ui/skeleton";

interface DownloadsCardProps {
  appId: string;
  appName: string;
}

export const DownloadsCard = ({ appId, appName }: DownloadsCardProps) => {
  const { data: metrics, isLoading, error } = useAppTweakMetrics(appId);

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <Skeleton className="h-4 w-24 mb-4" />
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-card border border-destructive/20 p-6">
        <p className="text-sm text-destructive">Failed to load metrics</p>
      </div>
    );
  }

  const formatNumber = (num: number | null) => {
    if (num === null) return "N/A";
    return num.toLocaleString();
  };

  const formatCurrency = (num: number | null, currency: string | null) => {
    if (num === null) return "N/A";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <h3 className="font-semibold text-foreground">{appName} Metrics</h3>
        <p className="text-xs text-muted-foreground mt-1">App ID: {appId}</p>
      </div>
      
      <div className="grid grid-cols-3 divide-x divide-border">
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Download className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Downloads</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatNumber(metrics?.downloads ?? null)}
          </p>
          {metrics?.downloadsDate && (
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.downloadsDate}
            </p>
          )}
        </div>
        
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Revenue</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(metrics?.revenues ?? null, metrics?.revenuesCurrency ?? null)}
          </p>
        </div>
        
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">App Power</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {metrics?.appPower !== null ? metrics.appPower.toFixed(1) : "N/A"}
          </p>
        </div>
      </div>
    </div>
  );
};
