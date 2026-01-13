import { useState } from "react";
import { Link } from "react-router-dom";
import { format, subDays, eachDayOfInterval, parseISO } from "date-fns";
import { ArrowLeft, Calendar, Play, RefreshCw, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleAdsPreview } from "@/hooks/useGoogleAdsPreview";
import { GoogleAdsDataPreview } from "@/components/GoogleAdsDataPreview";
import SyncLogTable from "@/components/SyncLogTable";

interface SyncResult {
  date: string;
  status: "pending" | "syncing" | "success" | "error";
  rowsAffected?: number;
  error?: string;
}

export default function GoogleAdsSync() {
  const { toast } = useToast();
  const preview = useGoogleAdsPreview();

  const [customDate, setCustomDate] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);

  const syncDate = async (date: string): Promise<SyncResult> => {
    try {
      const { data, error } = await supabase.functions.invoke("google-ads-to-bigquery", {
        body: { date },
      });

      if (error) throw new Error(error.message);
      if (!data.success) throw new Error(data.error);

      return { date, status: "success", rowsAffected: data.rowsAffected };
    } catch (err) {
      return { date, status: "error", error: err instanceof Error ? err.message : "Unknown error" };
    }
  };

  const handleQuickSync = async (daysAgo: number) => {
    const date = format(subDays(new Date(), daysAgo), "yyyy-MM-dd");
    setIsSyncing(true);
    setSyncResults([{ date, status: "syncing" }]);

    const result = await syncDate(date);
    setSyncResults([result]);
    setIsSyncing(false);

    toast({
      title: result.status === "success" ? "Sync Complete" : "Sync Failed",
      description:
        result.status === "success"
          ? `Synced ${result.rowsAffected} rows for ${date}`
          : result.error,
      variant: result.status === "success" ? "default" : "destructive",
    });
  };

  const handleCustomSync = async () => {
    setIsSyncing(true);
    setSyncResults([{ date: customDate, status: "syncing" }]);

    const result = await syncDate(customDate);
    setSyncResults([result]);
    setIsSyncing(false);

    toast({
      title: result.status === "success" ? "Sync Complete" : "Sync Failed",
      description:
        result.status === "success"
          ? `Synced ${result.rowsAffected} rows for ${customDate}`
          : result.error,
      variant: result.status === "success" ? "default" : "destructive",
    });
  };

  const handleBackfill = async () => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (start > end) {
      toast({
        title: "Invalid Date Range",
        description: "Start date must be before end date",
        variant: "destructive",
      });
      return;
    }

    const dates = eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));

    if (dates.length > 90) {
      toast({
        title: "Range Too Large",
        description: "Maximum 90 days allowed for backfill",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    setSyncResults(dates.map((date) => ({ date, status: "pending" })));
    setCurrentProgress(0);

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];

      setSyncResults((prev) =>
        prev.map((r) => (r.date === date ? { ...r, status: "syncing" } : r))
      );

      const result = await syncDate(date);

      setSyncResults((prev) => prev.map((r) => (r.date === date ? result : r)));
      setCurrentProgress(((i + 1) / dates.length) * 100);
    }

    setIsSyncing(false);

    const successCount = syncResults.filter((r) => r.status === "success").length;
    toast({
      title: "Backfill Complete",
      description: `Successfully synced ${successCount} of ${dates.length} days`,
    });
  };

  const retryFailed = async () => {
    const failedDates = syncResults.filter((r) => r.status === "error").map((r) => r.date);

    if (failedDates.length === 0) return;

    setIsSyncing(true);

    for (const date of failedDates) {
      setSyncResults((prev) =>
        prev.map((r) => (r.date === date ? { ...r, status: "syncing" } : r))
      );

      const result = await syncDate(date);

      setSyncResults((prev) => prev.map((r) => (r.date === date ? result : r)));
    }

    setIsSyncing(false);
  };

  const getStatusIcon = (status: SyncResult["status"]) => {
    switch (status) {
      case "pending":
        return <div className="h-4 w-4 rounded-full bg-muted" />;
      case "syncing":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/controls">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Google Ads Sync</h1>
            <p className="text-muted-foreground">Sync Google Ads campaign data to BigQuery</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Quick Sync
              </CardTitle>
              <CardDescription>Sync recent data with one click</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => handleQuickSync(0)}
                  disabled={isSyncing}
                  variant="outline"
                  className="flex-1"
                >
                  Today
                </Button>
                <Button
                  onClick={() => handleQuickSync(1)}
                  disabled={isSyncing}
                  className="flex-1"
                >
                  Yesterday
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => preview.fetchPreview(format(new Date(), "yyyy-MM-dd"))}
                  disabled={preview.isLoading}
                  variant="secondary"
                  className="flex-1"
                >
                  Preview Today
                </Button>
                <Button
                  onClick={() => preview.fetchPreview()}
                  disabled={preview.isLoading}
                  variant="secondary"
                  className="flex-1"
                >
                  Preview Yesterday
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Custom Date Sync
              </CardTitle>
              <CardDescription>Sync a specific date</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customDate">Date</Label>
                <Input
                  id="customDate"
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCustomSync} disabled={isSyncing} className="flex-1">
                  Sync Date
                </Button>
                <Button
                  onClick={() => preview.fetchPreview(customDate)}
                  disabled={preview.isLoading}
                  variant="secondary"
                  className="flex-1"
                >
                  Preview
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Backfill */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Backfill Date Range
            </CardTitle>
            <CardDescription>Sync multiple days at once (max 90 days)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleBackfill} disabled={isSyncing} className="w-full">
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                "Start Backfill"
              )}
            </Button>

            {isSyncing && currentProgress > 0 && (
              <Progress value={currentProgress} className="w-full" />
            )}
          </CardContent>
        </Card>

        {/* Sync Results */}
        {syncResults.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Sync Results</CardTitle>
                <CardDescription>
                  {syncResults.filter((r) => r.status === "success").length} succeeded,{" "}
                  {syncResults.filter((r) => r.status === "error").length} failed
                </CardDescription>
              </div>
              {syncResults.some((r) => r.status === "error") && !isSyncing && (
                <Button onClick={retryFailed} variant="outline" size="sm">
                  Retry Failed
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {syncResults.map((result) => (
                  <div
                    key={result.date}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                  >
                    {getStatusIcon(result.status)}
                    <span className="text-sm">{result.date}</span>
                    {result.rowsAffected !== undefined && (
                      <Badge variant="secondary" className="ml-auto">
                        {result.rowsAffected}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        <GoogleAdsDataPreview
          data={preview.data}
          isLoading={preview.isLoading}
          error={preview.error}
          previewDate={preview.previewDate}
          durationMs={preview.durationMs}
        />

        {/* Recent Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sync Logs</CardTitle>
            <CardDescription>Google Ads sync history</CardDescription>
          </CardHeader>
          <CardContent>
            <SyncLogTable source="google_ads" limit={10} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
