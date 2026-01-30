import { useState } from "react";
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

const SCHEDULE_OPTIONS = [
  { value: "0 14 * * *", label: "Daily at 9:00 AM EST" },
  { value: "0 15 * * *", label: "Daily at 10:00 AM EST" },
  { value: "0 13 * * *", label: "Daily at 8:00 AM EST" },
  { value: "0 12 * * *", label: "Daily at 7:00 AM EST" },
  { value: "0 16 * * *", label: "Daily at 11:00 AM EST" },
  { value: "0 17 * * *", label: "Daily at 12:00 PM EST" },
];

const SlackReportControls = () => {
  const [date, setDate] = useState<Date>(subDays(new Date(), 1));
  const [showPercentChanges, setShowPercentChanges] = useState(true);
  const [showPlatformSpacing, setShowPlatformSpacing] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const { data: schedules, isLoading: schedulesLoading } = useSchedules();
  const toggleSchedule = useToggleSchedule();
  const updateSchedule = useUpdateSchedule();

  // Find the Slack report schedule
  const slackSchedule = schedules?.find(s => 
    s.name === 'Slack Daily Report' ||
    s.name.toLowerCase().includes('slack') || 
    s.name.toLowerCase().includes('daily report')
  );

  const handleSendReport = async () => {
    setIsSending(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      
      const { data, error } = await supabase.functions.invoke('slack-daily-report', {
        body: { 
          date: dateStr,
          showPercentChanges,
          showPlatformSpacing,
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

  const handleScheduleChange = async (newSchedule: string) => {
    if (!slackSchedule) return;
    try {
      await updateSchedule.mutateAsync({ jobId: slackSchedule.id, schedule: newSchedule });
      toast.success("Schedule updated");
    } catch {
      toast.error("Failed to update schedule");
    }
  };

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
            <div className="flex items-center gap-3">
              <Select
                value={slackSchedule.schedule}
                onValueChange={handleScheduleChange}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-2">
                <Badge variant={slackSchedule.active ? "default" : "secondary"}>
                  {slackSchedule.active ? "Active" : "Paused"}
                </Badge>
                <Switch
                  checked={slackSchedule.active}
                  onCheckedChange={handleToggleSchedule}
                />
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

            <div className="flex items-center justify-between">
              <Label htmlFor="show-spacing" className="font-normal cursor-pointer">
                Add spacing between platforms
              </Label>
              <Switch
                id="show-spacing"
                checked={showPlatformSpacing}
                onCheckedChange={setShowPlatformSpacing}
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
