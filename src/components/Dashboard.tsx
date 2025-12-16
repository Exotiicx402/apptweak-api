import { RefreshCw, AlertCircle, Smartphone } from "lucide-react";
import { useAppTweakRanking } from "@/hooks/useAppTweakRanking";
import { RankingCard } from "./RankingCard";
import { CurlDisplay } from "./CurlDisplay";
import { TopChartsTable } from "./TopChartsTable";
import { RankingHistoryChart } from "./RankingHistoryChart";

export const Dashboard = () => {
  const { data: rankings, isLoading, error, refetch, isFetching } = useAppTweakRanking();

  return (
    <div className="min-h-screen bg-background">
      {/* Gradient glow effect */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(160 84% 40% / 0.1), transparent)",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Polymarket</h1>
              <p className="text-sm text-muted-foreground">App Store Rankings Dashboard</p>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="pulse-dot" />
            <span className="text-sm text-muted-foreground">
              Live data from AppTweak API
            </span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Error State */}
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

        {/* Loading State */}
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

        {/* Rankings Grid */}
        {rankings && rankings.filter(r => r.value !== null && r.value !== undefined).length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 mb-8">
            {rankings
              .filter(r => r.value !== null && r.value !== undefined)
              .map((ranking, index) => (
                <RankingCard key={`${ranking.category}-${index}`} ranking={ranking} />
              ))}
          </div>
        )}

        {/* No Rankings */}
        {rankings && rankings.length === 0 && (
          <div className="mb-8 p-8 rounded-xl bg-card border border-border text-center">
            <p className="text-muted-foreground">
              No rankings found. The app may not be in any category top charts.
            </p>
          </div>
        )}

        {/* Top Charts Section */}
        <div className="mb-8">
          <TopChartsTable />
        </div>

        {/* Ranking History Chart */}
        <div className="mb-8">
          <RankingHistoryChart />
        </div>

        {/* Curl Display */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">API Request</h2>
          <CurlDisplay />
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Data provided by AppTweak API • App ID: 6648798962
          </p>
        </div>
      </div>
    </div>
  );
};
