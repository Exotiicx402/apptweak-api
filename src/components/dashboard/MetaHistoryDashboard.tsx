import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, MousePointer, Eye, Users, TrendingUp, BarChart3 } from "lucide-react";
import { useMetaHistory } from "@/hooks/useMetaHistory";
import { MetricKpiCard } from "./MetricKpiCard";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { CampaignBreakdownChart } from "./CampaignBreakdownChart";
import { CreativeReportingTable } from "./CreativeReportingTable";
import { DateRangePicker } from "./DateRangePicker";
import { getLocalDaysAgo, getLocalToday } from "@/lib/dateUtils";

export function MetaHistoryDashboard() {
  const { data, isLoading, error, fetchHistory } = useMetaHistory();
  
  // Default to last 30 days
  const getDefaultDates = () => {
    return {
      start: getLocalDaysAgo(30),
      end: getLocalToday(),
    };
  };

  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);

  useEffect(() => {
    fetchHistory(startDate, endDate);
  }, []);

  const handleApply = () => {
    fetchHistory(startDate, endDate);
  };

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const totals = data?.totals || { spend: 0, impressions: 0, clicks: 0, reach: 0, cpm: 0, cpc: 0, ctr: 0 };
  const prevTotals = data?.previousTotals || { spend: 0, impressions: 0, clicks: 0, reach: 0, cpm: 0, cpc: 0, ctr: 0 };

  // Prepare chart data
  const spendChartData = data?.daily.map((d) => ({ date: d.date, value: d.spend })) || [];
  const impressionsChartData = data?.daily.map((d) => ({ date: d.date, value: d.impressions })) || [];
  const clicksChartData = data?.daily.map((d) => ({ date: d.date, value: d.clicks })) || [];
  const cpmChartData = data?.daily.map((d) => ({ date: d.date, value: d.cpm })) || [];
  const cpcChartData = data?.daily.map((d) => ({ date: d.date, value: d.cpc })) || [];
  const ctrChartData = data?.daily.map((d) => ({ date: d.date, value: d.ctr * 100 })) || [];

  // Prepare campaign breakdown
  const campaignSpendData = data?.campaigns.map((c) => ({ name: c.campaign_name, value: c.spend })) || [];
  const campaignClicksData = data?.campaigns.map((c) => ({ name: c.campaign_name, value: c.clicks })) || [];

  // Prepare table data
  const tableData = data?.campaigns.map((c) => ({
    name: c.campaign_name,
    spend: c.spend,
    installs: 0, // Meta doesn't always have installs in basic metrics
    cpi: 0,
    clicks: c.clicks,
    impressions: c.impressions,
    ctr: c.clicks / c.impressions || 0,
    cvr: 0,
  })) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Meta Ads Performance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onApply={handleApply}
            loading={isLoading}
          />
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricKpiCard
          title="Total Spend"
          value={totals.spend}
          currentValue={totals.spend}
          previousValue={prevTotals.spend}
          format="currency"
          icon={<DollarSign className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricKpiCard
          title="Impressions"
          value={totals.impressions}
          currentValue={totals.impressions}
          previousValue={prevTotals.impressions}
          format="number"
          icon={<Eye className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricKpiCard
          title="Clicks"
          value={totals.clicks}
          currentValue={totals.clicks}
          previousValue={prevTotals.clicks}
          format="number"
          icon={<MousePointer className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricKpiCard
          title="Reach"
          value={totals.reach}
          currentValue={totals.reach}
          previousValue={prevTotals.reach}
          format="number"
          icon={<Users className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricKpiCard
          title="Avg CPM"
          value={totals.cpm}
          currentValue={totals.cpm}
          previousValue={prevTotals.cpm}
          format="currency"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
        />
        <MetricKpiCard
          title="Avg CPC"
          value={totals.cpc}
          currentValue={totals.cpc}
          previousValue={prevTotals.cpc}
          format="currency"
          icon={<TrendingUp className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>

      {/* Time Series Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TimeSeriesChart
          title="Spend Over Time"
          data={spendChartData}
          format="currency"
          loading={isLoading}
        />
        <TimeSeriesChart
          title="Impressions Over Time"
          data={impressionsChartData}
          format="number"
          color="hsl(142, 76%, 36%)"
          loading={isLoading}
        />
        <TimeSeriesChart
          title="Clicks Over Time"
          data={clicksChartData}
          format="number"
          color="hsl(48, 96%, 53%)"
          loading={isLoading}
        />
      </div>

      {/* Additional Metrics Charts */}
      <div className="grid gap-4 md:grid-cols-3">
        <TimeSeriesChart
          title="CPM Trend"
          data={cpmChartData}
          format="currency"
          color="hsl(280, 67%, 50%)"
          loading={isLoading}
        />
        <TimeSeriesChart
          title="CPC Trend"
          data={cpcChartData}
          format="currency"
          color="hsl(0, 72%, 51%)"
          loading={isLoading}
        />
        <TimeSeriesChart
          title="CTR Trend"
          data={ctrChartData}
          format="percent"
          color="hsl(142, 76%, 50%)"
          loading={isLoading}
        />
      </div>

      {/* Campaign Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <CampaignBreakdownChart
          title="Spend by Campaign"
          data={campaignSpendData}
          format="currency"
          loading={isLoading}
        />
        <CampaignBreakdownChart
          title="Clicks by Campaign"
          data={campaignClicksData}
          format="number"
          loading={isLoading}
        />
      </div>

      {/* Campaign Table */}
      <CreativeReportingTable
        title="Campaign Performance"
        data={tableData}
        loading={isLoading}
      />
    </div>
  );
}
