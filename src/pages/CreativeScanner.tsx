import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Radar, Play, Loader2, Clock, MessageSquare, AlertCircle } from "lucide-react";
import KanbanBoard from "@/components/creative-scanner/KanbanBoard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface ScanResult {
  success: boolean;
  messages_scanned?: number;
  requests_found?: number;
  error?: string;
}


const SOURCE_CHANNEL = "C09HBDKSUGH";

const CreativeScanner = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  const { data: scannerState, refetch: refetchState } = useQuery({
    queryKey: ["scanner-state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scanner_state")
        .select("*")
        .eq("id", "slack-creative-scanner")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: recentLogs } = useQuery({
    queryKey: ["scanner-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .eq("source", "slack-creative-scanner")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const { data: creativeRequests, refetch: refetchRequests } = useQuery({
    queryKey: ["creative-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("slack-creative-scanner");
      if (error) throw error;
      setLastResult(data);
      refetchState();
      refetchRequests();
      if (data?.requests_found > 0) {
        toast.success(`Found ${data.requests_found} creative request(s)!`);
      } else {
        toast.info(`Scanned ${data?.messages_scanned || 0} messages — no new requests found.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      toast.error(msg);
      setLastResult({ success: false, error: msg });
    } finally {
      setIsScanning(false);
    }
  };

  const lastScannedDisplay = (() => {
    if (!scannerState?.last_scanned_ts || scannerState.last_scanned_ts === "0") {
      return "Never";
    }
    const ts = parseFloat(scannerState.last_scanned_ts);
    if (isNaN(ts)) return "Unknown";
    return new Date(ts * 1000).toLocaleString("en-US", { timeZone: "America/New_York" }) + " EST";
  })();

  const updatedAtDisplay = scannerState?.updated_at
    ? new Date(scannerState.updated_at).toLocaleString("en-US", { timeZone: "America/New_York" }) + " EST"
    : "—";

  const getPermalink = (messageTs: string | null) => {
    if (!messageTs) return null;
    return `https://slack.com/archives/${SOURCE_CHANNEL}/p${messageTs.replace(".", "")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Radar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Creative Request Scanner</h1>
              <p className="text-sm text-muted-foreground">
                Monitors <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">#hours-creative-polymarket</code> for new creative requests
              </p>
            </div>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Clock className="h-4 w-4" />
                Schedule
              </div>
              <p className="text-lg font-semibold text-foreground">Every 15 minutes</p>
              <Badge variant="outline" className="mt-2 text-primary border-primary/20 bg-primary/5">Active</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <MessageSquare className="h-4 w-4" />
                Last Scanned
              </div>
              <p className="text-lg font-semibold text-foreground">{lastScannedDisplay}</p>
              <p className="text-xs text-muted-foreground mt-1">Updated: {updatedAtDisplay}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Radar className="h-4 w-4" />
                Total Requests
              </div>
              <p className="text-lg font-semibold text-foreground">
                {creativeRequests?.length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {creativeRequests?.filter(r => r.priority === "High").length ?? 0} high priority
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Manual Trigger */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Manual Scan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button onClick={handleManualScan} disabled={isScanning}>
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Scan Now
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                Scans the channel for new messages and uses AI to identify creative requests. Results are posted to <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">#ad-review-pipeline</code>.
              </p>
            </div>

            {lastResult?.error && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {lastResult.error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kanban Board */}
        {creativeRequests && creativeRequests.length > 0 ? (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Creative Requests Board</h2>
            <KanbanBoard requests={creativeRequests} onStatusChange={() => refetchRequests()} />
          </div>
        ) : (
          <Card className="mb-8">
            <CardContent className="py-12">
              <p className="text-sm text-muted-foreground text-center">No creative requests detected yet. Run a scan to get started.</p>
            </CardContent>
          </Card>
        )}

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { step: "1", title: "Read Messages", desc: "Fetches new messages & threads from #hours-creative-polymarket" },
                { step: "2", title: "AI Classification", desc: "Gemini Flash analyzes each message to detect creative requests" },
                { step: "3", title: "Extract Details", desc: "Pulls out platform, format, priority, and description" },
                { step: "4", title: "Notify Team", desc: "Posts a formatted summary to #ad-review-pipeline" },
              ].map((item) => (
                <div key={item.step} className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold mb-3">
                    {item.step}
                  </div>
                  <h4 className="font-medium text-foreground text-sm mb-1">{item.title}</h4>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreativeScanner;
