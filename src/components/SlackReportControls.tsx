import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon, Send, Loader2, Clock } from "lucide-react";
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

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTES = ["00", "15", "30", "45"];

/** Parse a cron "M H * * *" into EST hour/minute/period */
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

/** Convert EST hour/minute/period to a UTC cron expression */
function estToCron(hour: number, minute: string, period: "AM" | "PM"): string {
  let h24 = period === "AM" ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12);
  let utcHour = h24 + 5;
  if (utcHour >= 24) utcHour -= 24;
  return `${parseInt(minute, 10)} ${utcHour} * * *`;
}

function formatTimeLabel(hour: number, minute: string, period: "AM" | "PM"): string {
  return `${hour}:${minute} ${period} EST`;
}

const SlackReportControls = () => {
  const [date, setDate] = useState<Date>(subDays(new Date(), 1));
  const [showPercentChanges, setShowPercentChanges] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const [selectedHour, setSelectedHour] = useState<number>(9);
  const [selectedMinute, setSelectedMinute] = useState<string>("00");
  const [selectedPeriod, setSelectedPeriod] = useState<"AM" | "PM">("AM");

  const { data: schedules, isLoading: schedulesLoading } = useSchedules();
  const toggleSchedule = useToggleSchedule();
  const updateSchedule = useUpdateSchedule();

  // Find the Slack report schedule
  const slackSchedule = schedules?.find(s => 
    s.name === 'Slack Daily Report' ||
    s.name.toLowerCase().includes('slack') || 
    s.name.toLowerCase().includes('daily report')
  );

  // Sync local state from current cron value
  useEffect(() => {
    if (!slackSchedule) return;
    const parsed = cronToEst(slackSchedule.schedule);
    if (parsed) {
      setSelectedHour(parsed.hour);
      setSelectedMinute(parsed.minute);
      setSelectedPeriod(parsed.period);
    }
  }, [slackSchedule?.schedule]);

  const handleSendReport = async () => {
    setIsSending(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      
      const { data, error } = await supabase.functions.invoke('slack-daily-report', {
        body: { 
          date: dateStr,
          showPercentChanges,
          showPlatformSpacing: true,
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Report for ${format(date, "MMM d, yyyy")} sent to Slack!`);
      } else {
        throw new Error(data?.error || 'Failed to send report');
      }
    } catch (err) {
      console.error("Slack report error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send report");
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleSchedule = async () => {
    if (!slackSchedule) return;
    try {
      await toggleSchedule.mutateAsync(slackSchedule.id);
      toast.success(slackSchedule.active ? "Schedule paused" : "Schedule activated");
    } catch {
      toast.error("Failed to toggle schedule");
    }
  };

  const handleTimeChange = useCallback(async (hour: number, minute: string, period: "AM" | "PM") => {
    if (!slackSchedule) return;
    const newCron = estToCron(hour, minute, period);
    try {
      await updateSchedule.mutateAsync({ jobId: slackSchedule.id, schedule: newCron });
      toast.success(`Schedule updated to ${formatTimeLabel(hour, minute, period)}`);
    } catch {
      toast.error("Failed to update schedule");
    }
  }, [slackSchedule, updateSchedule]);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="w-5 h-5 text-primary" />
          Slack Daily Report
        </CardTitle>
        <CardDescription>
          Send a performance report to Slack for a specific date
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Schedule Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Automated Schedule</Label>
          </div>
          
        {schedulesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : slackSchedule ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Select
                  value={String(selectedHour)}
                  onValueChange={(v) => { const h = parseInt(v); setSelectedHour(h); handleTimeChange(h, selectedMinute, selectedPeriod); }}
                >
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground font-medium">:</span>
                <Select
                  value={selectedMinute}
                  onValueChange={(v) => { setSelectedMinute(v); handleTimeChange(selectedHour, v, selectedPeriod); }}
                >
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedPeriod}
                  onValueChange={(v: "AM" | "PM") => { setSelectedPeriod(v); handleTimeChange(selectedHour, selectedMinute, v); }}
                >
                  <SelectTrigger className="w-[72px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant={slackSchedule.active ? "default" : "secondary"}>
                    {slackSchedule.active ? "Active" : "Paused"}
                  </Badge>
                  <Switch
                    checked={slackSchedule.active}
                    onCheckedChange={handleToggleSchedule}
                  />
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
                <p><span className="font-medium text-foreground">Report Date:</span> Previous day's data</p>
                <p><span className="font-medium text-foreground">Comparison:</span> Day-over-day % change</p>
                <p><span className="font-medium text-foreground">Platforms:</span> Meta, Snapchat, Google Ads, TikTok</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No schedule found. Set up a cron job for <code>slack-daily-report</code>.
            </p>
          )}
        </div>

        <Separator />

        {/* Manual Send Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Manual Report</Label>
          
          {/* Date Picker */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Report Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
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

          {/* Format Options */}
          <div className="space-y-3 pt-2">
            <Label className="text-sm text-muted-foreground">Format Options</Label>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="show-percent" className="font-normal cursor-pointer">
                Show percentage changes
              </Label>
              <Switch
                id="show-percent"
                checked={showPercentChanges}
                onCheckedChange={setShowPercentChanges}
              />
            </div>
          </div>

          {/* Send Button */}
          <Button 
            onClick={handleSendReport} 
            disabled={isSending}
            className="w-full mt-4"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Report to Slack
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SlackReportControls;
