import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Play, Calendar, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSnapchatPreview } from "@/hooks/useSnapchatPreview";
import SnapchatDataPreview from "@/components/SnapchatDataPreview";

interface SyncResult {
  success: boolean;
  date: string;
  rowsProcessed?: number;
  error?: string;
}

interface BackfillProgress {
  total: number;
  completed: number;
  current: string;
  results: SyncResult[];
}

const SnapchatSync = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [backfillStart, setBackfillStart] = useState("");
  const [backfillEnd, setBackfillEnd] = useState("");
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);
  const [previewDate, setPreviewDate] = useState("");
  const { toast } = useToast();
  const { isLoading: isPreviewLoading, result: previewResult, error: previewError, fetchPreview, clearPreview } = useSnapchatPreview();

  const getYesterdayDate = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const handleRunSync = async (date?: string) => {
    setIsLoading(true);
    setLastResult(null);

    try {
      const targetDate = date || getTodayDate();
      console.log(`Running Snapchat sync for date: ${targetDate}`);

      const { data, error } = await supabase.functions.invoke('snapchat-to-bigquery', {
        body: { date: targetDate },
      });

      if (error) {
        throw error;
      }

      const result: SyncResult = {
        success: data.success,
        date: targetDate,
        rowsProcessed: data.rowsProcessed,
        error: data.error,
      };

      setLastResult(result);

      if (result.success) {
        toast({
          title: "Sync Successful",
          description: `Synced ${result.rowsProcessed} rows for ${targetDate}`,
        });
      } else {
        toast({
          title: "Sync Failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      setLastResult({
        success: false,
        date: date || getTodayDate(),
        error: error.message || "Failed to invoke edge function",
      });
      toast({
        title: "Error",
        description: error.message || "Failed to run sync",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomDateSync = () => {
    if (!customDate) {
      toast({
        title: "Invalid Date",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }
    handleRunSync(customDate);
  };

  const getDateRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const startDate = new Date(start);
    const endDate = new Date(end);

    while (startDate <= endDate) {
      dates.push(startDate.toISOString().split('T')[0]);
      startDate.setDate(startDate.getDate() + 1);
    }

    return dates;
  };

  const handleBackfill = async () => {
    if (!backfillStart || !backfillEnd) {
      toast({
        title: "Invalid Range",
        description: "Please select both start and end dates",
        variant: "destructive",
      });
      return;
    }

    if (new Date(backfillStart) > new Date(backfillEnd)) {
      toast({
        title: "Invalid Range",
        description: "Start date must be before end date",
        variant: "destructive",
      });
      return;
    }

    const dates = getDateRange(backfillStart, backfillEnd);
    const results: SyncResult[] = [];

    setBackfillProgress({
      total: dates.length,
      completed: 0,
      current: dates[0],
      results: [],
    });

    setIsLoading(true);

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      setBackfillProgress(prev => prev ? {
        ...prev,
        current: date,
        completed: i,
      } : null);

      try {
        const { data, error } = await supabase.functions.invoke('snapchat-to-bigquery', {
          body: { date },
        });

        if (error) {
          throw error;
        }

        results.push({
          success: data.success,
          date,
          rowsProcessed: data.rowsProcessed,
          error: data.error,
        });
      } catch (error: any) {
        results.push({
          success: false,
          date,
          error: error.message,
        });
      }

      setBackfillProgress(prev => prev ? {
        ...prev,
        completed: i + 1,
        results: [...results],
      } : null);

      // Small delay between requests to avoid rate limiting
      if (i < dates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    setIsLoading(false);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    toast({
      title: "Backfill Complete",
      description: `${successCount} succeeded, ${failCount} failed`,
      variant: failCount > 0 ? "destructive" : "default",
    });
  };

  const retryFailedDates = async () => {
    if (!backfillProgress) return;

    const failedDates = backfillProgress.results
      .filter(r => !r.success)
      .map(r => r.date);

    if (failedDates.length === 0) {
      toast({
        title: "No Failed Dates",
        description: "All dates synced successfully",
      });
      return;
    }

    const results = [...backfillProgress.results.filter(r => r.success)];

    setIsLoading(true);

    for (let i = 0; i < failedDates.length; i++) {
      const date = failedDates[i];
      setBackfillProgress(prev => prev ? {
        ...prev,
        current: date,
      } : null);

      try {
        const { data, error } = await supabase.functions.invoke('snapchat-to-bigquery', {
          body: { date },
        });

        if (error) {
          throw error;
        }

        results.push({
          success: data.success,
          date,
          rowsProcessed: data.rowsProcessed,
          error: data.error,
        });
      } catch (error: any) {
        results.push({
          success: false,
          date,
          error: error.message,
        });
      }

      setBackfillProgress(prev => prev ? {
        ...prev,
        results: [...results],
      } : null);

      if (i < failedDates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    setIsLoading(false);

    const newSuccessCount = results.filter(r => r.success).length;
    const newFailCount = results.filter(r => !r.success).length;

    toast({
      title: "Retry Complete",
      description: `${newSuccessCount} succeeded, ${newFailCount} failed`,
      variant: newFailCount > 0 ? "destructive" : "default",
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Snapchat Ads Sync</h1>
            <p className="text-muted-foreground">Sync Snapchat campaign data to BigQuery</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Sync Today
              </CardTitle>
              <CardDescription>Sync today's Snapchat Ads data to BigQuery</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleRunSync()}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run Sync
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Sync Yesterday
              </CardTitle>
              <CardDescription>Sync yesterday's Snapchat Ads data</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleRunSync(getYesterdayDate())}
                disabled={isLoading}
                variant="secondary"
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Clock className="mr-2 h-4 w-4" />
                    Sync Yesterday
                  </>
                )}
              </Button>
            </CardContent>
        </Card>

        {/* Data Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Data Preview
            </CardTitle>
            <CardDescription>Preview Snapchat data before syncing to BigQuery</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="previewDate">Date</Label>
                <Input
                  id="previewDate"
                  type="date"
                  value={previewDate}
                  onChange={(e) => setPreviewDate(e.target.value)}
                  max={getTodayDate()}
                />
              </div>
              <Button
                onClick={() => {
                  fetchPreview(previewDate || undefined);
                }}
                disabled={isPreviewLoading}
              >
                {isPreviewLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Fetch Preview
                  </>
                )}
              </Button>
              {previewResult && (
                <Button variant="outline" onClick={clearPreview}>
                  Clear
                </Button>
              )}
            </div>
            {previewError && (
              <div className="p-3 bg-destructive/10 rounded-md">
                <p className="text-sm text-destructive">{previewError}</p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Custom Date */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Custom Date
            </CardTitle>
            <CardDescription>Sync data for a specific date</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="customDate">Date</Label>
                <Input
                  id="customDate"
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  max={getTodayDate()}
                />
              </div>
              <Button
                onClick={handleCustomDateSync}
                disabled={isLoading || !customDate}
              >
                Sync Date
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Backfill Range */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Backfill Range
            </CardTitle>
            <CardDescription>Sync data for a date range (sequentially)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="backfillStart">Start Date</Label>
                <Input
                  id="backfillStart"
                  type="date"
                  value={backfillStart}
                  onChange={(e) => setBackfillStart(e.target.value)}
                  max={getTodayDate()}
                />
              </div>
              <div>
                <Label htmlFor="backfillEnd">End Date</Label>
                <Input
                  id="backfillEnd"
                  type="date"
                  value={backfillEnd}
                  onChange={(e) => setBackfillEnd(e.target.value)}
                  max={getTodayDate()}
                />
              </div>
            </div>
            <Button
              onClick={handleBackfill}
              disabled={isLoading || !backfillStart || !backfillEnd}
              className="w-full"
            >
              {isLoading && backfillProgress ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing {backfillProgress.current}...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Start Backfill
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Last Result */}
        {lastResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {lastResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                Last Sync Result
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span>{lastResult.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={lastResult.success ? "default" : "destructive"}>
                    {lastResult.success ? "Success" : "Failed"}
                  </Badge>
                </div>
                {lastResult.rowsProcessed !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rows Processed:</span>
                    <span>{lastResult.rowsProcessed}</span>
                  </div>
                )}
                {lastResult.error && (
                  <div className="mt-2 p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm text-destructive">{lastResult.error}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Backfill Progress */}
        {backfillProgress && (
          <Card>
            <CardHeader>
              <CardTitle>Backfill Progress</CardTitle>
              <CardDescription>
                {backfillProgress.completed} of {backfillProgress.total} dates processed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress
                value={(backfillProgress.completed / backfillProgress.total) * 100}
              />

              {backfillProgress.results.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">
                        ✓ {backfillProgress.results.filter(r => r.success).length} succeeded
                      </span>
                      <span className="text-red-600">
                        ✗ {backfillProgress.results.filter(r => !r.success).length} failed
                      </span>
                    </div>

                    {backfillProgress.results.filter(r => !r.success).length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={retryFailedDates}
                        disabled={isLoading}
                        className="w-full"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry Failed Dates
                      </Button>
                    )}

                    <div className="max-h-48 overflow-y-auto space-y-1 mt-2">
                      {backfillProgress.results.map((result, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                        >
                          <span>{result.date}</span>
                          <div className="flex items-center gap-2">
                            {result.rowsProcessed !== undefined && (
                              <span className="text-muted-foreground">
                                {result.rowsProcessed} rows
                              </span>
                            )}
                            {result.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Preview Result */}
        {previewResult && <SnapchatDataPreview result={previewResult} />}
      </div>
    </div>
  );
};

export default SnapchatSync;
