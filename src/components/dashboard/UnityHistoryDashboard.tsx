import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, MousePointer, Eye, Download, TrendingUp, BarChart3 } from "lucide-react";
import { useUnityHistory } from "@/hooks/useUnityHistory";
import { MetricKpiCard } from "./MetricKpiCard";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { CampaignBreakdownChart } from "./CampaignBreakdownChart";
import { CreativeReportingTable } from "./CreativeReportingTable";
import { DateRangePicker } from "./DateRangePicker";
import { getLocalDaysAgo, getLocalToday } from "@/lib/dateUtils";

export function UnityHistoryDashboard() {
  const { data, isLoading, error, fetchHistory } = useUnityHistory();
  
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
  const cpiData = data?.daily.map((d) => ({ date: d.date, value: d.cpi })) || [];

  const campaignSpendData = data?.campaigns.map((c) => ({ name: c.campaign_name, value: c.spend })) || [];
  const countrySpendData = data?.countries?.map((c) => ({ name: c.country, value: c.spend })) || [];

  const tableData = data?.campaigns.map((c) => ({
    name: c.campaign_name, spend: c.spend, installs: c.installs, cpi: c.cpi,
    clicks: c.clicks, impressions: c.views, ctr: c.ctr, cvr: c.cvr,
  })) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Unity Ads Performance History</CardTitle></CardHeader>
        <CardContent>
          <DateRangePicker startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} onApply={() => fetchHistory(startDate, endDate)} loading={isLoading} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricKpiCard title="Total Spend" value={totals.spend || 0} currentValue={totals.spend} previousValue={prevTotals.spend} format="currency" icon={<DollarSign className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="Installs" value={totals.installs || 0} currentValue={totals.installs} previousValue={prevTotals.installs} format="number" icon={<Download className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="Avg CPI" value={totals.cpi || 0} currentValue={totals.cpi} previousValue={prevTotals.cpi} format="currency" loading={isLoading} />
        <MetricKpiCard title="Views" value={totals.views || 0} currentValue={totals.views} previousValue={prevTotals.views} format="number" icon={<Eye className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="D0 ROAS" value={totals.d0_roas || 0} currentValue={totals.d0_roas} previousValue={prevTotals.d0_roas} format="percent" icon={<TrendingUp className="h-4 w-4" />} loading={isLoading} />
        <MetricKpiCard title="D7 Retention" value={(totals.d7_retention || 0) * 100} currentValue={totals.d7_retention} previousValue={prevTotals.d7_retention} format="percent" loading={isLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TimeSeriesChart title="Spend Over Time" data={spendData} format="currency" loading={isLoading} />
        <TimeSeriesChart title="Installs Over Time" data={installsData} format="number" color="hsl(142, 76%, 36%)" loading={isLoading} />
        <TimeSeriesChart title="CPI Trend" data={cpiData} format="currency" color="hsl(280, 67%, 50%)" loading={isLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CampaignBreakdownChart title="Spend by Campaign" data={campaignSpendData} format="currency" loading={isLoading} />
        <CampaignBreakdownChart title="Spend by Country" data={countrySpendData} format="currency" loading={isLoading} />
      </div>

      <CreativeReportingTable title="Campaign Performance" data={tableData} loading={isLoading} />
    </div>
  );
}
