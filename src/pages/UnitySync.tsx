import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, Loader2, CheckCircle, XCircle, Calendar, Zap, Eye, X, CalendarRange, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUnityPreview } from "@/hooks/useUnityPreview";
import UnityDataPreview from "@/components/UnityDataPreview";
import SyncLogTable from "@/components/SyncLogTable";
import { formatLocalDate } from "@/lib/dateUtils";

interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  date?: string;
  rowsInserted?: number;
  durationMs?: number;
}

interface BackfillProgress {
  isRunning: boolean;
  currentDate: string;
  completed: number;
  total: number;
  totalRows: number;
  results: Array<{
    date: string;
    success: boolean;
    rows?: number;
    error?: string;
  }>;
}

export default function UnitySync() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [previewDate, setPreviewDate] = useState("");
  const { isLoading: isPreviewLoading, result: previewResult, fetchPreview, clearPreview } = useUnityPreview();

  // Backfill state
  const [backfillStartDate, setBackfillStartDate] = useState("");
  const [backfillEndDate, setBackfillEndDate] = useState("");
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress>({
    isRunning: false,
    currentDate: "",
    completed: 0,
    total: 0,
    totalRows: 0,
    results: [],
  });

  const handleRunSync = async (date?: string) => {
    setIsRunning(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('unity-to-bigquery', {
        body: date ? { date } : {},
      });

      if (error) {
        throw error;
      }

      setLastResult(data);
      
      if (data.success) {
        toast.success(data.message || "Sync completed successfully");
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to run sync";
      setLastResult({ success: false, error: errorMessage });
      toast.error(errorMessage);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCustomDateSync = () => {
    if (!customDate) {
      toast.error("Please enter a date");
      return;
    }
    handleRunSync(customDate);
  };

  const handlePreview = async (date: string) => {
    try {
      await fetchPreview(date);
      toast.success("Preview loaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load preview");
    }
  };

  const handlePreviewCustomDate = () => {
    if (!previewDate) {
      toast.error("Please select a date to preview");
      return;
    }
    handlePreview(previewDate);
  };

  // Generate array of dates between start and end (inclusive)
  const getDateRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (startDate > endDate) return dates;
    
    const current = new Date(startDate);
    while (current <= endDate) {
      dates.push(formatLocalDate(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const handleBackfill = async () => {
    if (!backfillStartDate || !backfillEndDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    const dates = getDateRange(backfillStartDate, backfillEndDate);
    if (dates.length === 0) {
      toast.error("Start date must be before or equal to end date");
      return;
    }

    if (dates.length > 365) {
      toast.error("Maximum range is 365 days");
      return;
    }

    setBackfillProgress({
      isRunning: true,
      currentDate: dates[0],
      completed: 0,
      total: dates.length,
      totalRows: 0,
      results: [],
    });

    const results: BackfillProgress['results'] = [];
    let totalRows = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      
      setBackfillProgress(prev => ({
        ...prev,
        currentDate: date,
        completed: i,
      }));

      try {
        const { data, error } = await supabase.functions.invoke('unity-to-bigquery', {
          body: { date },
        });

        if (error) throw error;

        const rows = data.rowsInserted || 0;
        totalRows += rows;
        results.push({ date, success: data.success, rows, error: data.error });
        
        setBackfillProgress(prev => ({
          ...prev,
          totalRows,
          results: [...results],
        }));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        results.push({ date, success: false, error: errorMsg });
        
        setBackfillProgress(prev => ({
          ...prev,
          results: [...results],
        }));
      }
    }

    setBackfillProgress(prev => ({
      ...prev,
      isRunning: false,
      completed: dates.length,
      currentDate: "",
    }));

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    if (failCount === 0) {
      toast.success(`Backfill complete: ${successCount} days, ${totalRows.toLocaleString()} rows`);
    } else {
      toast.warning(`Backfill complete: ${successCount} succeeded, ${failCount} failed`);
    }
  };

  const retryFailedDates = async () => {
    const failedDates = backfillProgress.results.filter(r => !r.success).map(r => r.date);
    if (failedDates.length === 0) return;

    setBackfillProgress(prev => ({
      ...prev,
      isRunning: true,
      completed: 0,
      total: failedDates.length,
      currentDate: failedDates[0],
    }));

    let totalRows = backfillProgress.totalRows;
    const updatedResults = [...backfillProgress.results];

    for (let i = 0; i < failedDates.length; i++) {
      const date = failedDates[i];
      
      setBackfillProgress(prev => ({
        ...prev,
        currentDate: date,
        completed: i,
      }));

      try {
        const { data, error } = await supabase.functions.invoke('unity-to-bigquery', {
          body: { date },
        });

        if (error) throw error;

        const rows = data.rowsInserted || 0;
        totalRows += rows;
        
        const idx = updatedResults.findIndex(r => r.date === date);
        if (idx !== -1) {
          updatedResults[idx] = { date, success: data.success, rows, error: data.error };
        }
        
        setBackfillProgress(prev => ({
          ...prev,
          totalRows,
          results: [...updatedResults],
        }));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const idx = updatedResults.findIndex(r => r.date === date);
        if (idx !== -1) {
          updatedResults[idx] = { date, success: false, error: errorMsg };
        }
      }
    }

    setBackfillProgress(prev => ({
      ...prev,
      isRunning: false,
      completed: failedDates.length,
      currentDate: "",
      results: updatedResults,
    }));

    const stillFailed = updatedResults.filter(r => !r.success).length;
    if (stillFailed === 0) {
      toast.success("All retries successful!");
    } else {
      toast.warning(`${stillFailed} dates still failed`);
    }
  };

  // Calculate today's and yesterday's dates for display
  const todayStr = formatLocalDate(new Date());
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterday);

  const failedCount = backfillProgress.results.filter(r => !r.success).length;
  const successCount = backfillProgress.results.filter(r => r.success).length;

  return (
    <div className="min-h-screen bg-background">
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(220 84% 40% / 0.1), transparent)",
        }}
      />

      <div className="relative max-w-2xl mx-auto px-6 py-12">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Unity Ads → BigQuery Sync</h1>
          <p className="text-muted-foreground mt-2">
            Fetch Unity Ads acquisition data and load it into BigQuery
          </p>
        </div>

        {/* Sync Today Card */}
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Sync Today's Data
            </CardTitle>
            <CardDescription>
              Fetch today's data ({todayStr}) — may be partial or incomplete
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => handleRunSync(todayStr)} 
              disabled={isRunning || backfillProgress.isRunning}
              className="w-full"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
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

        {/* Sync Yesterday Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Sync Yesterday's Data
            </CardTitle>
            <CardDescription>
              Fetch yesterday's data ({yesterdayStr}) — complete day's data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => handleRunSync(yesterdayStr)} 
              disabled={isRunning || backfillProgress.isRunning}
              variant="secondary"
              className="w-full"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Sync Yesterday
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Custom Date Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Backfill Specific Date
            </CardTitle>
            <CardDescription>
              Run sync for a specific date (YYYY-MM-DD format)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="customDate" className="sr-only">Date</Label>
                <Input
                  id="customDate"
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  disabled={isRunning || backfillProgress.isRunning}
                />
              </div>
              <Button 
                onClick={handleCustomDateSync} 
                disabled={isRunning || backfillProgress.isRunning || !customDate}
                variant="secondary"
              >
                {isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Sync Date"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Backfill Date Range Card */}
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-primary" />
              Backfill Date Range
            </CardTitle>
            <CardDescription>
              Sync multiple days at once (processed sequentially)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="backfillStart" className="text-xs text-muted-foreground mb-1 block">Start Date</Label>
                <Input
                  id="backfillStart"
                  type="date"
                  value={backfillStartDate}
                  onChange={(e) => setBackfillStartDate(e.target.value)}
                  disabled={backfillProgress.isRunning || isRunning}
                />
              </div>
              <div>
                <Label htmlFor="backfillEnd" className="text-xs text-muted-foreground mb-1 block">End Date</Label>
                <Input
                  id="backfillEnd"
                  type="date"
                  value={backfillEndDate}
                  onChange={(e) => setBackfillEndDate(e.target.value)}
                  disabled={backfillProgress.isRunning || isRunning}
                />
              </div>
            </div>

            <Button 
              onClick={handleBackfill} 
              disabled={backfillProgress.isRunning || isRunning || !backfillStartDate || !backfillEndDate}
              className="w-full"
            >
              {backfillProgress.isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Backfill...
                </>
              ) : (
                <>
                  <CalendarRange className="w-4 h-4 mr-2" />
                  Run Backfill
                </>
              )}
            </Button>

            {/* Progress indicator */}
            {backfillProgress.isRunning && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Processing: <span className="text-foreground font-medium">{backfillProgress.currentDate}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {backfillProgress.completed + 1} of {backfillProgress.total}
                  </span>
                </div>
                <Progress value={(backfillProgress.completed / backfillProgress.total) * 100} />
                <div className="text-sm text-muted-foreground">
                  Rows synced: <span className="text-foreground font-medium">{backfillProgress.totalRows.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Results summary */}
            {!backfillProgress.isRunning && backfillProgress.results.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span>{successCount} succeeded</span>
                  </div>
                  {failedCount > 0 && (
                    <div className="flex items-center gap-1 text-destructive">
                      <XCircle className="w-4 h-4" />
                      <span>{failedCount} failed</span>
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    {backfillProgress.totalRows.toLocaleString()} total rows
                  </div>
                </div>

                {failedCount > 0 && (
                  <>
                    <div className="text-sm space-y-1">
                      {backfillProgress.results
                        .filter(r => !r.success)
                        .slice(0, 5)
                        .map(r => (
                          <div key={r.date} className="flex items-start gap-2 text-destructive/80">
                            <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{r.date}: {r.error}</span>
                          </div>
                        ))}
                      {failedCount > 5 && (
                        <div className="text-muted-foreground text-xs">
                          ...and {failedCount - 5} more
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={retryFailedDates}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Retry Failed Dates ({failedCount})
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview Data Card */}
        <Card className="mb-6 border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Preview Data
            </CardTitle>
            <CardDescription>
              See what data will be synced before sending to BigQuery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => handlePreview(yesterdayStr)}
                disabled={isPreviewLoading || backfillProgress.isRunning}
                variant="outline"
                className="flex-1"
              >
                {isPreviewLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 mr-2" />
                )}
                Preview Yesterday
              </Button>
              <div className="flex gap-2 flex-1">
                <Input
                  type="date"
                  value={previewDate}
                  onChange={(e) => setPreviewDate(e.target.value)}
                  disabled={isPreviewLoading || backfillProgress.isRunning}
                />
                <Button
                  onClick={handlePreviewCustomDate}
                  disabled={isPreviewLoading || backfillProgress.isRunning || !previewDate}
                  variant="outline"
                >
                  {isPreviewLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Preview"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview Results */}
        {previewResult && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Data Preview</h2>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleRunSync(previewResult.date)}
                  disabled={isRunning || backfillProgress.isRunning || previewResult.data.length === 0}
                  size="sm"
                >
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Sync This Data
                </Button>
                <Button
                  onClick={clearPreview}
                  variant="ghost"
                  size="sm"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <UnityDataPreview result={previewResult} />
          </div>
        )}

        {/* Last Result Card */}
        {lastResult && (
          <Card className={lastResult.success ? "border-primary/50" : "border-destructive/50"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {lastResult.success ? (
                  <CheckCircle className="w-5 h-5 text-primary" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
                {lastResult.success ? "Sync Successful" : "Sync Failed"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {lastResult.date && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="font-medium">{lastResult.date}</dd>
                  </div>
                )}
                {lastResult.rowsInserted !== undefined && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Rows Inserted</dt>
                    <dd className="font-medium">{lastResult.rowsInserted}</dd>
                  </div>
                )}
                {lastResult.durationMs !== undefined && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd className="font-medium">{(lastResult.durationMs / 1000).toFixed(2)}s</dd>
                  </div>
                )}
                {lastResult.message && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Message</dt>
                    <dd className="font-medium">{lastResult.message}</dd>
                  </div>
                )}
                {lastResult.error && (
                  <div className="mt-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {lastResult.error}
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Sync History */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Recent Syncs
            </CardTitle>
            <CardDescription>
              History of Unity data syncs to BigQuery
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SyncLogTable source="unity" limit={15} />
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
