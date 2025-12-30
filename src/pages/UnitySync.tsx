import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, Loader2, CheckCircle, XCircle, Calendar, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CronJobStatus } from "@/components/CronJobStatus";

interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  date?: string;
  rowsInserted?: number;
  durationMs?: number;
}

export default function UnitySync() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [customDate, setCustomDate] = useState("");

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

  // Calculate today's and yesterday's dates for display
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

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
              disabled={isRunning}
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
              disabled={isRunning}
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
                  disabled={isRunning}
                />
              </div>
              <Button 
                onClick={handleCustomDateSync} 
                disabled={isRunning || !customDate}
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

        {/* Cron Job Status */}
        <div className="mt-8">
          <CronJobStatus />
        </div>
      </div>
    </div>
  );
}
