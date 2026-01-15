import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, MousePointer, Eye, Download, Video, BarChart3 } from "lucide-react";
import { useSnapchatHistory } from "@/hooks/useSnapchatHistory";
import { MetricKpiCard } from "./MetricKpiCard";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { CampaignBreakdownChart } from "./CampaignBreakdownChart";
import { CreativeReportingTable } from "./CreativeReportingTable";
import { DateRangePicker } from "./DateRangePicker";
import { getLocalDaysAgo, getLocalToday } from "@/lib/dateUtils";

export function SnapchatHistoryDashboard() {
  const { data, isLoading, error, fetchHistory } = useSnapchatHistory();
  
  const getDefaultDates = () => {
    return { start: getLocalDaysAgo(30), end: getLocalToday() };
  };

  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);

  useEffect(() => { fetchHistory(startDate, endDate); }, []);

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader><CardTitle className="text-destructive">Error Loading History</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">{error}</p></CardContent>
      </Card>
    );
  }

  const totals = data?.totals || {};
  const prevTotals = data?.previousTotals || {};

  const spendData = data?.daily.map((d) => ({ date: d.date, value: d.spend })) || [];
  const installsData = data?.daily.map((d) => ({ date: d.date, value: d.installs })) || [];
  const swipesData = data?.daily.map((d) => ({ date: d.date, value: d.swipes })) || [];

  const campaignSpendData = data?.campaigns.map((c) => ({ name: c.campaign_name, value: c.spend })) || [];

  const tableData = data?.campaigns.map((c) => ({
    name: c.campaign_name, spend: c.spend, installs: c.installs,
    cpi: c.installs > 0 ? c.spend / c.installs : 0,
    clicks: c.swipes, impressions: c.impressions,
    ctr: c.impressions > 0 ? c.swipes / c.impressions : 0,
  })) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Snapchat Ads Performance History</CardTitle></CardHeader>
        <CardContent>
          <DateRangePicker startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} onApply={() => fetchHistory(startDate, endDate)} loading={isLoading} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricKpiCard title="Total Spend" value={totals.spend || 0} currentValue={totals.spend} previousValue={prevTotals.spend} format="currency" icon={<DollarSign className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="Impressions" value={totals.impressions || 0} currentValue={totals.impressions} previousValue={prevTotals.impressions} format="number" icon={<Eye className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="Swipes" value={totals.swipes || 0} currentValue={totals.swipes} previousValue={prevTotals.swipes} format="number" icon={<MousePointer className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="Installs" value={totals.installs || 0} currentValue={totals.installs} previousValue={prevTotals.installs} format="number" icon={<Download className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="Avg CPI" value={totals.cpi || 0} currentValue={totals.cpi} previousValue={prevTotals.cpi} format="currency" loading={isLoading} />
        <MetricKpiCard title="Video Views" value={totals.video_views || 0} currentValue={totals.video_views} previousValue={prevTotals.video_views} format="number" icon={<Video className="h-4 w-4" />} loading={isLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TimeSeriesChart title="Spend Over Time" data={spendData} format="currency" loading={isLoading} />
        <TimeSeriesChart title="Installs Over Time" data={installsData} format="number" color="hsl(142, 76%, 36%)" loading={isLoading} />
        <TimeSeriesChart title="Swipes Over Time" data={swipesData} format="number" color="hsl(48, 96%, 53%)" loading={isLoading} />
      </div>

      <CampaignBreakdownChart title="Spend by Campaign" data={campaignSpendData} format="currency" loading={isLoading} />
      <CreativeReportingTable title="Campaign Performance" data={tableData} loading={isLoading} />
    </div>
  );
}
