import { RefreshCw, AlertCircle, Settings, Database, BarChart3, Apple } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAppTweakRanking } from "@/hooks/useAppTweakRanking";
import { RankingCard } from "./RankingCard";
import { TopChartsTable } from "./TopChartsTable";
import { RankingHistoryChart } from "./RankingHistoryChart";
import { DownloadsHistoryChart } from "./DownloadsHistoryChart";
import { CompetitorDownloadsChart } from "./CompetitorDownloadsChart";
import { AppsFlyerDownloadsChart } from "./AppsFlyerDownloadsChart";
import { ASCDownloadsChart } from "./ASCDownloadsChart";
import { AppSectionHeader } from "./AppSectionHeader";

// App Store icon URLs
const POLYMARKET_ICON = "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a8/b2/d2/a8b2d29c-9278-62d8-348e-a04ac433ebde/AppIcon1-0-1x_U007ephone-0-1-0-sRGB-85-220-0.png/100x100bb.jpg";

export const Dashboard = () => {
  const queryClient = useQueryClient();
  const { data: rankings, isLoading, error, isFetching } = useAppTweakRanking();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["apptweak-ranking"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-ranking-history"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-top-charts"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-metrics-history"] });
    queryClient.invalidateQueries({ queryKey: ["competitor-downloads-history"] });
    queryClient.invalidateQueries({ queryKey: ["appsflyer-downloads"] });
    queryClient.invalidateQueries({ queryKey: ["asc-downloads"] });
  };

  return (
    <div className="min-h-screen bg-background">
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(160 84% 40% / 0.1), transparent)",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="pulse-dot" />
            <span className="text-sm text-muted-foreground">
              Live data from AppTweak API
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/controls"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              Controls
            </Link>
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3 animate-fade-in">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Failed to fetch rankings</p>
              <p className="text-sm text-muted-foreground mt-1">
                {error instanceof Error ? error.message : "CORS may be blocking the request. Consider using a backend proxy."}
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-card border border-border animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Polymarket Section */}
        <AppSectionHeader 
          appName="Polymarket" 
          appId="6648798962" 
          iconUrl={POLYMARKET_ICON}
        />

        {rankings && rankings.filter(r => r.value !== null && r.value !== undefined).length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 mb-8">
            {rankings
              .filter(r => r.value !== null && r.value !== undefined)
              .map((ranking, index) => (
                <RankingCard key={`${ranking.category}-${index}`} ranking={ranking} />
              ))}
          </div>
        )}

        {rankings && rankings.length === 0 && (
          <div className="mb-8 p-8 rounded-xl bg-card border border-border text-center">
            <p className="text-muted-foreground">
              No rankings found. The app may not be in any category top charts.
            </p>
          </div>
        )}

        <div className="mb-8">
          <RankingHistoryChart />
        </div>

        {/* AppTweak Data Section */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            AppTweak Data
          </h3>
          <DownloadsHistoryChart appId="6648798962" appName="Polymarket" dataSource="AppTweak" />
        </div>

        {/* App Store Connect Section */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Apple className="w-4 h-4" />
            App Store Connect (Official)
          </h3>
          <ASCDownloadsChart appName="Polymarket" />
        </div>

        {/* AppsFlyer SSOT Section */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Database className="w-4 h-4" />
            AppsFlyer SSOT
          </h3>
          <AppsFlyerDownloadsChart appName="Polymarket" />
        </div>

        <div className="mb-12">
          <CompetitorDownloadsChart />
        </div>

        {/* Top Charts Section */}
        <div className="mb-8">
          <TopChartsTable />
        </div>

        <div className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Data provided by AppTweak API • App ID: 6648798962
          </p>
        </div>
      </div>
    </div>
  );
};
