import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Zap, Upload, RefreshCw, Database, Loader2, Camera, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAppTweakRankingHistory } from "@/hooks/useAppTweakRankingHistory";

const Controls = () => {
  const queryClient = useQueryClient();
  const { data: historyData } = useAppTweakRankingHistory();
  const [isSyncingToday, setIsSyncingToday] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const handleSyncToday = async () => {
    setIsSyncingToday(true);
    try {
      const { data, error } = await supabase.functions.invoke('unity-to-bigquery', {
        body: { date: todayStr }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Synced ${data.rowsInserted || 0} rows for ${todayStr}`);
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to sync today's data");
    } finally {
      setIsSyncingToday(false);
    }
  };

  const handleSyncToSheets = async () => {
    if (!historyData || historyData.length === 0) {
      toast.error("No ranking history data to sync");
      return;
    }

    setIsSyncingSheets(true);
    try {
      const formattedData = historyData
        .filter(point => point.rank !== null)
        .map(point => [
          point.date,
          "6648798962",
          point.category,
          point.categoryName,
          point.rank,
          "free",
          "us",
          "iphone"
        ]);

      const { error } = await supabase.functions.invoke('sync-to-sheets', {
        body: { data: formattedData }
      });

      if (error) throw error;
      
      toast.success(`Synced ${formattedData.length} rows to Google Sheets!`);
    } catch (err) {
      console.error("Sync error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to sync to sheets");
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleRefreshAll = () => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["apptweak-ranking"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-ranking-history"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-top-charts"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["apptweak-metrics-history"] });
    
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("All data refreshed");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background">
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(160 84% 40% / 0.1), transparent)",
        }}
      />

      <div className="relative max-w-2xl mx-auto px-6 py-12">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Data Controls</h1>
          <p className="text-muted-foreground">
            Manage sync operations and refresh data
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 mb-8">
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="w-5 h-5 text-primary" />
                Sync Today's Unity Data
              </CardTitle>
              <CardDescription>
                Fetch today's data ({todayStr}) to BigQuery — may be partial
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleSyncToday} 
                disabled={isSyncingToday}
                className="w-full"
              >
                {isSyncingToday ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Sync Today
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="w-5 h-5" />
                Sync to Google Sheets
              </CardTitle>
              <CardDescription>
                Export AppTweak ranking history to Google Sheets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleSyncToSheets} 
                disabled={isSyncingSheets || !historyData}
                variant="secondary"
                className="w-full"
              >
                {isSyncingSheets ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Sync to Sheets
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="w-5 h-5" />
                Refresh All Data
              </CardTitle>
              <CardDescription>
                Reload all dashboard data from APIs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleRefreshAll} 
                disabled={isRefreshing}
                variant="outline"
                className="w-full"
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh All
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sync Pages */}
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="w-5 h-5" />
                Unity Sync Settings
              </CardTitle>
              <CardDescription>
                Access full Unity sync controls, backfill options, and cron job status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/unity-sync">
                <Button variant="outline" className="w-full">
                  <Database className="w-4 h-4 mr-2" />
                  Open Unity Sync
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera className="w-5 h-5" />
                Snapchat Sync
              </CardTitle>
              <CardDescription>
                Sync Snapchat Ads data to BigQuery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/snapchat-sync">
                <Button variant="outline" className="w-full">
                  <Camera className="w-4 h-4 mr-2" />
                  Open Snapchat Sync
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessagesSquare className="w-5 h-5" />
                Meta Ads Sync
              </CardTitle>
              <CardDescription>
                Sync Meta campaign data to BigQuery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/meta-sync">
                <Button variant="outline" className="w-full">
                  <MessagesSquare className="w-4 h-4 mr-2" />
                  Open Meta Sync
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Controls;
