import { useState } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SlackReportControls = () => {
  const [date, setDate] = useState<Date>(subDays(new Date(), 1));
  const [showPercentChanges, setShowPercentChanges] = useState(true);
  const [showPlatformSpacing, setShowPlatformSpacing] = useState(true);
  const [isSending, setIsSending] = useState(false);

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
        {/* Date Picker */}
        <div className="space-y-2">
          <Label>Report Date</Label>
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
      </CardContent>
    </Card>
  );
};

export default SlackReportControls;
