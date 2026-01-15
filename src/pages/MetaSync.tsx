import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, Calendar, RefreshCw, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMetaPreview } from "@/hooks/useMetaPreview";
import { MetaDataPreview } from "@/components/MetaDataPreview";
import SyncLogTable from "@/components/SyncLogTable";
import { MetaHistoryDashboard } from "@/components/dashboard/MetaHistoryDashboard";
import { getLocalToday, getLocalYesterday, formatLocalDate } from "@/lib/dateUtils";

interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  rowsAffected?: number;
  durationMs?: number;
}

interface BackfillProgress {
  total: number;
  completed: number;
  failed: number;
  results: Array<{ date: string; success: boolean; error?: string }>;
}

export default function MetaSync() {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [backfillStart, setBackfillStart] = useState("");
  const [backfillEnd, setBackfillEnd] = useState("");
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);

  const {
    data: previewData,
    isLoading: isPreviewLoading,
    error: previewError,
    previewDate,
    durationMs: previewDurationMs,
    fetchPreview,
    clearPreview,
  } = useMetaPreview();

  const getYesterdayDate = () => getLocalYesterday();
  const getTodayDate = () => getLocalToday();

  const handleSync = async (date?: string) => {
    setIsSyncing(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke<SyncResult>("meta-to-bigquery", {
        body: date ? { date } : {},
      });

      if (error) {
        throw new Error(error.message);
      }

      setLastResult(data);

      if (data?.success) {
        toast({
          title: "Sync Complete",
          description: data.message || `Synced ${data.rowsAffected} rows`,
        });
      } else {
        throw new Error(data?.error || "Sync failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setLastResult({ success: false, error: message });
      toast({
        title: "Sync Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCustomDateSync = () => {
    if (!customDate) {
      toast({
        title: "Date Required",
        description: "Please select a date to sync",
        variant: "destructive",
      });
      return;
    }
    handleSync(customDate);
  };

  const handlePreviewCustomDate = () => {
    if (!customDate) {
      toast({
        title: "Date Required",
        description: "Please select a date to preview",
        variant: "destructive",
      });
      return;
    }
    fetchPreview(customDate);
  };

  const getDateRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const current = new Date(start);
    const endDate = new Date(end);

    while (current <= endDate) {
      dates.push(formatLocalDate(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const handleBackfill = async () => {
    if (!backfillStart || !backfillEnd) {
      toast({
        title: "Dates Required",
        description: "Please select both start and end dates",
        variant: "destructive",
      });
      return;
    }

    if (new Date(backfillStart) > new Date(backfillEnd)) {
      toast({
        title: "Invalid Date Range",
        description: "Start date must be before end date",
        variant: "destructive",
      });
      return;
    }

    const dates = getDateRange(backfillStart, backfillEnd);

    if (dates.length > 90) {
      toast({
        title: "Range Too Large",
        description: "Maximum 90 days per backfill",
        variant: "destructive",
      });
      return;
    }

    setIsBackfilling(true);
    setBackfillProgress({ total: dates.length, completed: 0, failed: 0, results: [] });

    for (const date of dates) {
      try {
        const { data, error } = await supabase.functions.invoke<SyncResult>("meta-to-bigquery", {
          body: { date },
        });

        const success = !error && data?.success;

        setBackfillProgress((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            completed: prev.completed + 1,
            failed: success ? prev.failed : prev.failed + 1,
            results: [
              ...prev.results,
              { date, success, error: error?.message || data?.error },
            ],
          };
        });
      } catch (err) {
        setBackfillProgress((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            completed: prev.completed + 1,
            failed: prev.failed + 1,
            results: [
              ...prev.results,
              { date, success: false, error: err instanceof Error ? err.message : "Unknown error" },
            ],
          };
        });
      }
    }

    setIsBackfilling(false);
    toast({
      title: "Backfill Complete",
      description: `Processed ${dates.length} dates`,
    });
  };

  const retryFailedDates = async () => {
    if (!backfillProgress) return;

    const failedDates = backfillProgress.results
      .filter((r) => !r.success)
      .map((r) => r.date);

    if (failedDates.length === 0) {
      toast({ title: "No Failed Dates", description: "Nothing to retry" });
      return;
    }

    setIsBackfilling(true);
    setBackfillProgress({
      total: failedDates.length,
      completed: 0,
      failed: 0,
      results: [],
    });

    for (const date of failedDates) {
      try {
        const { data, error } = await supabase.functions.invoke<SyncResult>("meta-to-bigquery", {
          body: { date },
        });

        const success = !error && data?.success;

        setBackfillProgress((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            completed: prev.completed + 1,
            failed: success ? prev.failed : prev.failed + 1,
            results: [
              ...prev.results,
              { date, success, error: error?.message || data?.error },
            ],
          };
        });
      } catch (err) {
        setBackfillProgress((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            completed: prev.completed + 1,
            failed: prev.failed + 1,
            results: [
              ...prev.results,
              { date, success: false, error: err instanceof Error ? err.message : "Unknown error" },
            ],
          };
        });
      }
    }

    setIsBackfilling(false);
    toast({ title: "Retry Complete" });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/controls">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Meta Ads Sync</h1>
            <p className="text-muted-foreground">Sync Meta campaign data to BigQuery</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Sync Today
              </CardTitle>
              <CardDescription>Sync today's Meta campaign data ({getTodayDate()})</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button onClick={() => handleSync(getTodayDate())} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sync Today
              </Button>
              <Button variant="outline" onClick={() => fetchPreview(getTodayDate())} disabled={isPreviewLoading}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Sync Yesterday
              </CardTitle>
              <CardDescription>Sync yesterday's data ({getYesterdayDate()})</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button onClick={() => handleSync(getYesterdayDate())} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sync Yesterday
              </Button>
              <Button variant="outline" onClick={() => fetchPreview(getYesterdayDate())} disabled={isPreviewLoading}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Custom Date */}
        <Card>
          <CardHeader>
            <CardTitle>Custom Date Sync</CardTitle>
            <CardDescription>Sync or preview data for a specific date</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="customDate">Date</Label>
                <Input
                  id="customDate"
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              </div>
              <Button onClick={handleCustomDateSync} disabled={isSyncing || !customDate}>
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sync
              </Button>
              <Button
                variant="outline"
                onClick={handlePreviewCustomDate}
                disabled={isPreviewLoading || !customDate}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Preview */}
        <MetaDataPreview
          data={previewData}
          isLoading={isPreviewLoading}
          error={previewError}
          previewDate={previewDate}
          durationMs={previewDurationMs}
        />

        {previewData && (
          <Button variant="outline" onClick={clearPreview}>
            Clear Preview
          </Button>
        )}

        {/* Backfill */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Backfill Date Range
            </CardTitle>
            <CardDescription>Sync multiple days at once (max 90 days)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-2">
                <Label htmlFor="backfillStart">Start Date</Label>
                <Input
                  id="backfillStart"
                  type="date"
                  value={backfillStart}
                  onChange={(e) => setBackfillStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backfillEnd">End Date</Label>
                <Input
                  id="backfillEnd"
                  type="date"
                  value={backfillEnd}
                  onChange={(e) => setBackfillEnd(e.target.value)}
                />
              </div>
              <Button
                onClick={handleBackfill}
                disabled={isBackfilling || !backfillStart || !backfillEnd}
              >
                {isBackfilling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start Backfill
              </Button>
            </div>

            {backfillProgress && (
              <div className="space-y-2">
                <div className="text-sm">
                  Progress: {backfillProgress.completed} / {backfillProgress.total}
                  {backfillProgress.failed > 0 && (
                    <span className="text-destructive ml-2">
                      ({backfillProgress.failed} failed)
                    </span>
                  )}
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${(backfillProgress.completed / backfillProgress.total) * 100}%`,
                    }}
                  />
                </div>
                {!isBackfilling && backfillProgress.failed > 0 && (
                  <Button variant="outline" size="sm" onClick={retryFailedDates}>
                    Retry {backfillProgress.failed} Failed
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last Result */}
        {lastResult && (
          <Card className={lastResult.success ? "border-green-500" : "border-destructive"}>
            <CardHeader>
              <CardTitle>{lastResult.success ? "Sync Successful" : "Sync Failed"}</CardTitle>
              <CardDescription>
                {lastResult.success
                  ? `${lastResult.rowsAffected} rows synced in ${lastResult.durationMs}ms`
                  : lastResult.error}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Sync Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sync Logs</CardTitle>
            <CardDescription>Last 10 Meta sync operations</CardDescription>
          </CardHeader>
          <CardContent>
            <SyncLogTable source="meta" limit={10} />
          </CardContent>
        </Card>

        {/* Historical Performance Dashboard */}
        <MetaHistoryDashboard />
      </div>
    </div>
  );
}
