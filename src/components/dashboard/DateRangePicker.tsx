import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "lucide-react";
import { getLocalDaysAgo, getLocalToday, getLocalYesterday } from "@/lib/dateUtils";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onApply: () => void;
  loading?: boolean;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  loading = false,
}: DateRangePickerProps) {
  const setPreset = (days: number) => {
    onStartDateChange(getLocalDaysAgo(days));
    onEndDateChange(getLocalToday());
  };

  const setToday = () => {
    const today = getLocalToday();
    onStartDateChange(today);
    onEndDateChange(today);
  };

  const setYesterday = () => {
    const yesterday = getLocalYesterday();
    onStartDateChange(yesterday);
    onEndDateChange(yesterday);
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={setToday}
          className="text-xs"
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={setYesterday}
          className="text-xs"
        >
          Yesterday
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreset(7)}
          className="text-xs"
        >
          Last 7 days
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreset(14)}
          className="text-xs"
        >
          Last 14 days
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreset(30)}
          className="text-xs"
        >
          Last 30 days
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreset(90)}
          className="text-xs"
        >
          Last 90 days
        </Button>
      </div>
      
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="historyStart" className="text-xs">Start Date</Label>
          <Input
            id="historyStart"
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-36"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="historyEnd" className="text-xs">End Date</Label>
          <Input
            id="historyEnd"
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-36"
          />
        </div>
        <Button onClick={onApply} disabled={loading}>
          <Calendar className="h-4 w-4 mr-2" />
          {loading ? "Loading..." : "Apply"}
        </Button>
      </div>
    </div>
  );
}
