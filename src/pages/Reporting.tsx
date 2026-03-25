import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { TotalMetricsSection } from "@/components/reporting/TotalMetricsSection";
import { PlatformMetricsRow } from "@/components/reporting/PlatformMetricsRow";
import { DailyBreakdownTable } from "@/components/reporting/DailyBreakdownTable";
import { RankingSection } from "@/components/reporting/RankingSection";
import { CreativePerformanceGrid } from "@/components/reporting/CreativePerformanceGrid";
import { useReportingData } from "@/hooks/useReportingData";
import { getLocalDaysAgo, getLocalYesterday } from "@/lib/dateUtils";

import metaLogo from "@/assets/logos/meta.png";
import molocoLogo from "@/assets/logos/moloco.webp";

export default function Reporting() {
  const [startDate, setStartDate] = useState(getLocalDaysAgo(8));
  const [endDate, setEndDate] = useState(getLocalYesterday());
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const { data, isLoading, fetchAllPlatforms } = useReportingData();
  const [creativeRefreshKey, setCreativeRefreshKey] = useState(0);

  const handleApply = () => {
    fetchAllPlatforms(startDate, endDate);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setCreativeRefreshKey((prev) => prev + 1);
  };

  const anyPlatformLoading = data.meta?.isLoading || data.moloco?.isLoading;
  const hasData = data.totals.spend > 0 || anyPlatformLoading;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Performance Report</h1>
          </div>
        </div>

        {/* Date Range Picker */}
        <div className="mb-8">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onApply={handleApply}
            loading={isLoading}
          />
        </div>

        {hasData && (
          <>
            {/* Top KPIs */}
            <TotalMetricsSection
              spend={data.totals.spend}
              cpi={data.totals.cpi}
              cps={data.totals.cps}
              ftds={data.totals.ftds}
              cftd={data.totals.cftd}
              previousSpend={data.totals.previousSpend}
              previousCpi={data.totals.previousCpi}
              previousCps={data.totals.previousCps}
              previousFtds={data.totals.previousFtds}
              previousCftd={data.totals.previousCftd}
              loading={anyPlatformLoading}
            />

            {/* Platform Rows */}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold mb-4 text-foreground">By Platform</h2>

              <PlatformMetricsRow
                platform="Meta Ads"
                logo={metaLogo}
                spend={data.meta.spend}
                installs={data.meta.installs}
                cpi={data.meta.cpi}
                registrations={data.meta.registrations}
                cps={data.meta.registrations > 0 ? data.meta.spend / data.meta.registrations : 0}
                ftds={data.meta.ftds}
                cftd={data.meta.ftds > 0 ? data.meta.spend / data.meta.ftds : 0}
                previousSpend={data.meta.previousSpend}
                previousInstalls={data.meta.previousInstalls}
                previousCpi={data.meta.previousCpi}
                previousRegistrations={data.meta.previousRegistrations}
                previousCps={data.meta.previousRegistrations > 0 ? data.meta.previousSpend / data.meta.previousRegistrations : 0}
                previousFtds={data.meta.previousFtds}
                previousCftd={data.meta.previousFtds > 0 ? data.meta.previousSpend / data.meta.previousFtds : 0}
                loading={data.meta.isLoading}
                error={data.meta.error}
              />

              <PlatformMetricsRow
                platform="Moloco"
                logo={molocoLogo}
                spend={data.moloco.spend}
                installs={data.moloco.installs}
                cpi={data.moloco.cpi}
                ftds={data.moloco.ftds}
                cftd={data.moloco.ftds > 0 ? data.moloco.spend / data.moloco.ftds : 0}
                previousSpend={data.moloco.previousSpend}
                previousInstalls={data.moloco.previousInstalls}
                previousCpi={data.moloco.previousCpi}
                previousFtds={data.moloco.previousFtds}
                previousCftd={data.moloco.previousFtds > 0 ? data.moloco.previousSpend / data.moloco.previousFtds : 0}
                loading={data.moloco.isLoading}
                error={data.moloco.error}
                dataUnavailable={data.moloco.dataUnavailable}
                unavailableReason={data.moloco.unavailableReason}
              />
            </div>

            {/* Daily Breakdown Tables */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4 text-foreground">Daily Breakdown</h2>

              <DailyBreakdownTable
                platform="Meta Ads"
                logo={metaLogo}
                daily={data.meta.daily}
                loading={data.meta.isLoading}
              />

              <DailyBreakdownTable
                platform="Moloco"
                logo={molocoLogo}
                daily={data.moloco.daily}
                loading={data.moloco.isLoading}
              />
            </div>

            {/* Ranking Section */}
            <RankingSection
              startDate={appliedStartDate}
              endDate={appliedEndDate}
              dataFetched={hasData}
            />

            {/* Creative Performance Section */}
            <CreativePerformanceGrid
              startDate={appliedStartDate}
              endDate={appliedEndDate}
              dataFetched={hasData}
              refreshKey={creativeRefreshKey}
            />
          </>
        )}

        {/* Empty state */}
        {!anyPlatformLoading && data.totals.spend === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Select a date range and click Apply to view metrics</p>
            <p className="text-sm">Data will be fetched from Meta and Moloco</p>
          </div>
        )}
      </div>
    </div>
  );
}
