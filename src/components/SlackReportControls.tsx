import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon, Send, Loader2, Clock, Eye, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSchedules, useToggleSchedule, useUpdateSchedule } from "@/hooks/useSchedules";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

function cronToEst(cron: string): { hour: number; minute: string; period: "AM" | "PM" } | null {
  const match = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (!match) return null;
  const minUtc = parseInt(match[1], 10);
  let hourEst = parseInt(match[2], 10) - 5;
  if (hourEst < 0) hourEst += 24;
  const period: "AM" | "PM" = hourEst >= 12 ? "PM" : "AM";
  const hour12 = hourEst === 0 ? 12 : hourEst > 12 ? hourEst - 12 : hourEst;
  return { hour: hour12, minute: minUtc.toString().padStart(2, "0"), period };
}

function estToCron(hour: number, minute: string, period: "AM" | "PM"): string {
  const h24 = period === "AM" ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12);
  let utcHour = h24 + 5;
  if (utcHour >= 24) utcHour -= 24;
  return `${parseInt(minute, 10)} ${utcHour} * * *`;
}

function formatTimeLabel(hour: number, minute: string, period: "AM" | "PM"): string {
  return `${hour}:${minute} ${period} EST`;
}

function formatCurrency(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function pct(current: number, previous: number): { value: string; positive: boolean; neutral: boolean } {
  if (previous === 0) return { value: '—', positive: true, neutral: true };
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return { value: `${sign}${change.toFixed(1)}%`, positive: change >= 0, neutral: false };
}

interface PlatformMetrics {
  spend: number;
  installs: number;
  ftds: number;
  cpi: number;
  cftd: number;
}

interface PreviewData {
  date: string;
  previousDate: string;
  meta: { current: PlatformMetrics; previous: PlatformMetrics };
  moloco: { current: PlatformMetrics; previous: PlatformMetrics };
}

// Keep old interfaces for cumulative report which still uses FTD data
interface FTDTotals {
  spend: number;
  ftd_count: number;
  cost_per_ftd: number;
  results_value: number;
  roas: number;
  avg_ftd_value: number;
}

interface CampaignTotals extends FTDTotals {
  campaign_name: string;
}

interface CumulativePreviewData {
  startDate: string;
  endDate: string;
  totals: FTDTotals;
  campaigns?: CampaignTotals[];
}

function campaignLabel(name: string): string {
  const parts = name.split('|').map(s => s.trim());
  const intlIdx = parts.findIndex(p => p.toUpperCase() === 'INTERNATIONAL');
  const webIdx = parts.findIndex(p => p.toUpperCase() === 'WEB');
  if (intlIdx >= 0 && webIdx > intlIdx) {
    return parts.slice(intlIdx + 1, webIdx).join(' ');
  }
  return name.length > 20 ? name.substring(0, 20) + '…' : name;
}

/* ─── Platform metric row helpers ─── */

function PlatformMetricsRows({ current, previous }: { current: PlatformMetrics; previous: PlatformMetrics }) {
  const metrics = [
    { label: 'Spend', current: formatCurrency(current.spend), prev: formatCurrency(previous.spend), change: pct(current.spend, previous.spend) },
    { label: 'Installs', current: formatNumber(current.installs), prev: formatNumber(previous.installs), change: pct(current.installs, previous.installs) },
    { label: 'FTD', current: formatNumber(current.ftds), prev: formatNumber(previous.ftds), change: pct(current.ftds, previous.ftds) },
    { label: 'CPI', current: current.cpi > 0 ? formatCurrency(current.cpi, 2) : '—', prev: previous.cpi > 0 ? formatCurrency(previous.cpi, 2) : '—', change: pct(current.cpi, previous.cpi), lowerIsBetter: true },
    { label: 'CFTD', current: current.cftd > 0 ? formatCurrency(current.cftd, 2) : '—', prev: previous.cftd > 0 ? formatCurrency(previous.cftd, 2) : '—', change: pct(current.cftd, previous.cftd), lowerIsBetter: true },
  ];

  return (
    <>
      {metrics.map((m) => {
        const isPositive = m.lowerIsBetter ? !m.change.positive : m.change.positive;
        return (
          <div key={m.label} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
            <span className="text-sm text-muted-foreground w-36">{m.label}</span>
            <span className="text-sm font-semibold text-foreground flex-1 text-right">{m.current}</span>
            <span className="text-xs text-muted-foreground w-20 text-right">{m.prev}</span>
            <span className={cn(
              "text-xs font-medium w-20 text-right",
              m.change.neutral ? "text-muted-foreground" : isPositive ? "text-green-500" : "text-destructive"
            )}>
              {m.change.value}
            </span>
          </div>
        );
      })}
    </>
  );
}

function CumulativeMetricsRows({ totals }: { totals: FTDTotals }) {
  const metrics = [
    { label: 'Amount Spent', value: formatCurrency(totals.spend) },
    { label: 'Results (FTDs)', value: formatNumber(totals.ftd_count) },
    { label: 'Cost per Result', value: totals.ftd_count > 0 ? formatCurrency(totals.cost_per_ftd, 2) : '—' },
    { label: 'Results Value', value: totals.results_value > 0 ? formatCurrency(totals.results_value) : '—' },
    { label: 'Results ROAS', value: totals.roas > 0 ? `${totals.roas.toFixed(2)}x` : '—' },
    { label: 'Avg. FTD Value', value: totals.avg_ftd_value > 0 ? formatCurrency(totals.avg_ftd_value, 2) : '—' },
  ];

  return (
    <>
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
          <span className="text-sm text-muted-foreground w-36">{m.label}</span>
          <span className="text-sm font-semibold text-foreground flex-1 text-right">{m.value}</span>
        </div>
      ))}
    </>
  );
}

/* ─── Preview components ─── */

function ReportPreview({ data }: { data: PreviewData }) {
  const { date, previousDate, meta, moloco } = data;

  const emptyMetrics: PlatformMetrics = { spend: 0, installs: 0, ftds: 0, cpi: 0, cftd: 0 };
  const safeMeta = meta || { current: emptyMetrics, previous: emptyMetrics };
  const safeMoloco = moloco || { current: emptyMetrics, previous: emptyMetrics };

  const formatShortDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const formatDisplayDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const reportLabel = formatShortDate(date);
  const prevLabel = formatShortDate(previousDate);

  const totalCurrent: PlatformMetrics = {
    spend: safeMeta.current.spend + safeMoloco.current.spend,
    installs: safeMeta.current.installs + safeMoloco.current.installs,
    ftds: safeMeta.current.ftds + safeMoloco.current.ftds,
    cpi: 0, cftd: 0,
  };
  totalCurrent.cpi = totalCurrent.installs > 0 ? totalCurrent.spend / totalCurrent.installs : 0;
  totalCurrent.cftd = totalCurrent.ftds > 0 ? totalCurrent.spend / totalCurrent.ftds : 0;

  const totalPrevious: PlatformMetrics = {
    spend: safeMeta.previous.spend + safeMoloco.previous.spend,
    installs: safeMeta.previous.installs + safeMoloco.previous.installs,
    ftds: safeMeta.previous.ftds + safeMoloco.previous.ftds,
    cpi: 0, cftd: 0,
  };
  totalPrevious.cpi = totalPrevious.installs > 0 ? totalPrevious.spend / totalPrevious.installs : 0;
  totalPrevious.cftd = totalPrevious.ftds > 0 ? totalPrevious.spend / totalPrevious.ftds : 0;

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
      <div className="bg-primary/10 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">📊 Daily Performance Report — {formatDisplayDate(date)}</p>
      </div>
      <div className="flex items-center px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground w-36">Metric</span>
        <span className="text-xs font-medium text-muted-foreground flex-1 text-right">{reportLabel}</span>
        <span className="text-xs font-medium text-muted-foreground w-20 text-right">{prevLabel}</span>
        <span className="text-xs font-medium text-muted-foreground w-20 text-right">Change</span>
      </div>

      <div className="px-4 py-2 bg-muted/40 border-y border-border">
        <span className="text-xs font-semibold text-foreground">📱 Meta</span>
      </div>
      <div className="divide-y divide-border">
        <PlatformMetricsRows current={safeMeta.current} previous={safeMeta.previous} />
      </div>

      <div className="px-4 py-2 bg-muted/40 border-y border-border">
        <span className="text-xs font-semibold text-foreground">🟣 Moloco</span>
      </div>
      <div className="divide-y divide-border">
        <PlatformMetricsRows current={safeMoloco.current} previous={safeMoloco.previous} />
      </div>

      <div className="px-4 py-2 bg-primary/10 border-y border-border">
        <span className="text-xs font-semibold text-foreground">📊 TOTAL</span>
      </div>
      <div className="divide-y divide-border">
        <PlatformMetricsRows current={totalCurrent} previous={totalPrevious} />
      </div>
    </div>
  );
}

function CumulativeReportPreview({ data }: { data: CumulativePreviewData }) {
  const { totals, startDate, endDate, campaigns } = data;

  const formatShortDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const formatDisplayDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
      <div className="bg-primary/10 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">📊 Cumulative Performance — {formatShortDate(startDate)} to {formatDisplayDate(endDate)}</p>
      </div>
      <div className="flex items-center px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground w-36">Metric</span>
        <span className="text-xs font-medium text-muted-foreground flex-1 text-right">Total</span>
      </div>

      {(campaigns || []).map((camp) => (
        <div key={camp.campaign_name}>
          <div className="px-4 py-2 bg-muted/40 border-y border-border">
            <span className="text-xs font-semibold text-foreground">📌 {campaignLabel(camp.campaign_name)}</span>
          </div>
          <div className="divide-y divide-border">
            <CumulativeMetricsRows totals={camp} />
          </div>
        </div>
      ))}

      <div className="px-4 py-2 bg-primary/10 border-y border-border">
        <span className="text-xs font-semibold text-foreground">📊 TOTAL</span>
      </div>
      <div className="divide-y divide-border">
        <CumulativeMetricsRows totals={totals} />
      </div>
    </div>
  );
}

/* ─── Schedule time picker ─── */

function ScheduleTimePicker({
  schedule,
  selectedHour,
  selectedMinute,
  selectedPeriod,
  onHourChange,
  onMinuteChange,
  onPeriodChange,
  onToggle,
}: {
  schedule: { id: number; active: boolean; schedule: string; name: string };
  selectedHour: number;
  selectedMinute: string;
  selectedPeriod: "AM" | "PM";
  onHourChange: (h: number) => void;
  onMinuteChange: (m: string) => void;
  onPeriodChange: (p: "AM" | "PM") => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select value={String(selectedHour)} onValueChange={(v) => onHourChange(parseInt(v))}>
        <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground font-medium">:</span>
      <Select value={selectedMinute} onValueChange={onMinuteChange}>
        <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={selectedPeriod} onValueChange={(v: "AM" | "PM") => onPeriodChange(v)}>
        <SelectTrigger className="w-[72px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 ml-auto">
        <Badge variant={schedule.active ? "default" : "secondary"}>
          {schedule.active ? "Active" : "Paused"}
        </Badge>
        <Switch checked={schedule.active} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}

/* ─── Main component ─── */

const SlackReportControls = () => {
  const [date, setDate] = useState<Date>(subDays(new Date(), 1));
  const [showPercentChanges, setShowPercentChanges] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const [selectedHour, setSelectedHour] = useState<number>(9);
  const [selectedMinute, setSelectedMinute] = useState<string>("00");
  const [selectedPeriod, setSelectedPeriod] = useState<"AM" | "PM">("AM");

  // Cumulative report state
  const [cumIsSending, setCumIsSending] = useState(false);
  const [cumIsPreviewing, setCumIsPreviewing] = useState(false);
  const [cumPreviewData, setCumPreviewData] = useState<CumulativePreviewData | null>(null);
  const [cumSelectedHour, setCumSelectedHour] = useState<number>(3);
  const [cumSelectedMinute, setCumSelectedMinute] = useState<string>("15");
  const [cumSelectedPeriod, setCumSelectedPeriod] = useState<"AM" | "PM">("PM");

  const { data: schedules, isLoading: schedulesLoading } = useSchedules();
  const toggleSchedule = useToggleSchedule();
  const updateSchedule = useUpdateSchedule();

  const slackSchedule = schedules?.find(s =>
    s.name === 'Slack Daily Report' ||
    s.name.toLowerCase().includes('slack') && s.name.toLowerCase().includes('daily')
  );

  const cumulativeSchedule = schedules?.find(s =>
    s.name === 'Slack Cumulative Report' ||
    s.name.toLowerCase().includes('cumulative')
  );

  useEffect(() => {
    if (!slackSchedule) return;
    const parsed = cronToEst(slackSchedule.schedule);
    if (parsed) {
      setSelectedHour(parsed.hour);
      setSelectedMinute(parsed.minute);
      setSelectedPeriod(parsed.period);
    }
  }, [slackSchedule?.schedule]);

  useEffect(() => {
    if (!cumulativeSchedule) return;
    const parsed = cronToEst(cumulativeSchedule.schedule);
    if (parsed) {
      setCumSelectedHour(parsed.hour);
      setCumSelectedMinute(parsed.minute);
      setCumSelectedPeriod(parsed.period);
    }
  }, [cumulativeSchedule?.schedule]);

  useEffect(() => { setPreviewData(null); }, [date]);

  const handlePreviewReport = async () => {
    setIsPreviewing(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const { data, error } = await supabase.functions.invoke('slack-daily-report', {
        body: { date: dateStr, preview: true }
      });
      if (error) throw error;
      if (data?.success) setPreviewData(data as PreviewData);
      else throw new Error(data?.error || 'Failed to load preview');
    } catch (err) {
      console.error("Preview error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSendReport = async () => {
    setIsSending(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const { data, error } = await supabase.functions.invoke('slack-daily-report', {
        body: { date: dateStr, showPercentChanges, showPlatformSpacing: true }
      });
      if (error) throw error;
      if (data?.success) toast.success(`Report for ${format(date, "MMM d, yyyy")} sent to Slack!`);
      else throw new Error(data?.error || 'Failed to send report');
    } catch (err) {
      console.error("Slack report error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send report");
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleSchedule = async (schedule: typeof slackSchedule) => {
    if (!schedule) return;
    try {
      await toggleSchedule.mutateAsync(schedule.id);
      toast.success(schedule.active ? "Schedule paused" : "Schedule activated");
    } catch {
      toast.error("Failed to toggle schedule");
    }
  };

  const handleTimeChange = useCallback(async (hour: number, minute: string, period: "AM" | "PM", schedule: typeof slackSchedule) => {
    if (!schedule) return;
    const newCron = estToCron(hour, minute, period);
    try {
      await updateSchedule.mutateAsync({ jobId: schedule.id, schedule: newCron });
      toast.success(`Schedule updated to ${formatTimeLabel(hour, minute, period)}`);
    } catch {
      toast.error("Failed to update schedule");
    }
  }, [updateSchedule]);

  // Cumulative report handlers
  const handleCumPreview = async () => {
    setCumIsPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-cumulative-report', {
        body: { preview: true }
      });
      if (error) throw error;
      if (data?.success) setCumPreviewData(data as CumulativePreviewData);
      else throw new Error(data?.error || 'Failed to load preview');
    } catch (err) {
      console.error("Cumulative preview error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setCumIsPreviewing(false);
    }
  };

  const handleCumSend = async () => {
    setCumIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-cumulative-report', {});
      if (error) throw error;
      if (data?.success) toast.success("Cumulative report sent to Slack!");
      else throw new Error(data?.error || 'Failed to send report');
    } catch (err) {
      console.error("Cumulative report error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send report");
    } finally {
      setCumIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Daily Report Card (unchanged) ─── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="w-5 h-5 text-primary" />
            Slack Daily Report
          </CardTitle>
          <CardDescription>
            Send a performance report to Slack — always reports on previous day's data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Automated Schedule</Label>
            </div>

            {schedulesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : slackSchedule ? (
              <div className="space-y-3">
                <ScheduleTimePicker
                  schedule={slackSchedule}
                  selectedHour={selectedHour}
                  selectedMinute={selectedMinute}
                  selectedPeriod={selectedPeriod}
                  onHourChange={(h) => { setSelectedHour(h); handleTimeChange(h, selectedMinute, selectedPeriod, slackSchedule); }}
                  onMinuteChange={(m) => { setSelectedMinute(m); handleTimeChange(selectedHour, m, selectedPeriod, slackSchedule); }}
                  onPeriodChange={(p) => { setSelectedPeriod(p); handleTimeChange(selectedHour, selectedMinute, p, slackSchedule); }}
                  onToggle={() => handleToggleSchedule(slackSchedule)}
                />
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
                  <p><span className="font-medium text-foreground">Report Date:</span> Previous day's data (auto)</p>
                  <p><span className="font-medium text-foreground">Comparison:</span> Day-over-day % change</p>
                  <p><span className="font-medium text-foreground">Platform:</span> Meta FTD Campaign</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No schedule found. Set up a cron job for <code>slack-daily-report</code>.
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Manual Report</Label>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Report Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={(d) => d > subDays(new Date(), 1)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-percent" className="font-normal cursor-pointer text-sm">
                  Show percentage changes
                </Label>
                <Switch id="show-percent" checked={showPercentChanges} onCheckedChange={setShowPercentChanges} />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handlePreviewReport} disabled={isPreviewing || isSending} className="flex-1">
                {isPreviewing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : <><Eye className="w-4 h-4 mr-2" />Preview</>}
              </Button>
              <Button onClick={handleSendReport} disabled={isSending || isPreviewing} className="flex-1">
                {isSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><Send className="w-4 h-4 mr-2" />Send to Slack</>}
              </Button>
            </div>

            {previewData && (
              <div className="pt-2">
                <ReportPreview data={previewData} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Cumulative Report Card ─── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-primary" />
            Slack Cumulative Report
          </CardTitle>
          <CardDescription>
            Cumulative performance since campaign launch (Feb 18)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Automated Schedule</Label>
            </div>

            {schedulesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : cumulativeSchedule ? (
              <div className="space-y-3">
                <ScheduleTimePicker
                  schedule={cumulativeSchedule}
                  selectedHour={cumSelectedHour}
                  selectedMinute={cumSelectedMinute}
                  selectedPeriod={cumSelectedPeriod}
                  onHourChange={(h) => { setCumSelectedHour(h); handleTimeChange(h, cumSelectedMinute, cumSelectedPeriod, cumulativeSchedule); }}
                  onMinuteChange={(m) => { setCumSelectedMinute(m); handleTimeChange(cumSelectedHour, m, cumSelectedPeriod, cumulativeSchedule); }}
                  onPeriodChange={(p) => { setCumSelectedPeriod(p); handleTimeChange(cumSelectedHour, cumSelectedMinute, p, cumulativeSchedule); }}
                  onToggle={() => handleToggleSchedule(cumulativeSchedule)}
                />
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
                  <p><span className="font-medium text-foreground">Date Range:</span> Feb 18, 2026 → Yesterday</p>
                  <p><span className="font-medium text-foreground">Format:</span> Cumulative totals (no comparison)</p>
                  <p><span className="font-medium text-foreground">Platform:</span> Meta FTD Campaign</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No schedule found. Set up a cron job for <code>slack-cumulative-report</code>.
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Manual Report</Label>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleCumPreview} disabled={cumIsPreviewing || cumIsSending} className="flex-1">
                {cumIsPreviewing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : <><Eye className="w-4 h-4 mr-2" />Preview</>}
              </Button>
              <Button onClick={handleCumSend} disabled={cumIsSending || cumIsPreviewing} className="flex-1">
                {cumIsSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><Send className="w-4 h-4 mr-2" />Send to Slack</>}
              </Button>
            </div>

            {cumPreviewData && (
              <div className="pt-2">
                <CumulativeReportPreview data={cumPreviewData} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SlackReportControls;
