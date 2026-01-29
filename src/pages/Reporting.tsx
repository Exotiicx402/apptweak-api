import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { TotalMetricsSection } from "@/components/reporting/TotalMetricsSection";
import { PlatformMetricsRow } from "@/components/reporting/PlatformMetricsRow";
import { useReportingData } from "@/hooks/useReportingData";
import { getLocalDaysAgo, getLocalToday } from "@/lib/dateUtils";

export default function Reporting() {
  const [startDate, setStartDate] = useState(getLocalDaysAgo(7));
  const [endDate, setEndDate] = useState(getLocalToday());
  const { data, isLoading, fetchAllPlatforms } = useReportingData();

  const handleApply = () => {
    fetchAllPlatforms(startDate, endDate);
  };

  const anyPlatformLoading = 
    data.meta.isLoading || 
    data.snapchat.isLoading || 
    data.unity.isLoading || 
    data.googleAds.isLoading;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
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

        {/* Content - only show after data is fetched */}
        {(data.totals.spend > 0 || anyPlatformLoading) && (
          <>
            {/* Total Section */}
            <TotalMetricsSection
              spend={data.totals.spend}
              installs={data.totals.installs}
              cpi={data.totals.cpi}
              loading={anyPlatformLoading}
            />

            {/* Platform Sections */}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold mb-4 text-foreground">By Platform</h2>
              
              <PlatformMetricsRow
                platform="Meta Ads"
                spend={data.meta.spend}
                installs={data.meta.installs}
                cpi={data.meta.cpi}
                loading={data.meta.isLoading}
                error={data.meta.error}
              />

              <PlatformMetricsRow
                platform="Snapchat"
                spend={data.snapchat.spend}
                installs={data.snapchat.installs}
                cpi={data.snapchat.cpi}
                loading={data.snapchat.isLoading}
                error={data.snapchat.error}
              />

              <PlatformMetricsRow
                platform="Unity"
                spend={data.unity.spend}
                installs={data.unity.installs}
                cpi={data.unity.cpi}
                loading={data.unity.isLoading}
                error={data.unity.error}
              />

              <PlatformMetricsRow
                platform="Google Ads"
                spend={data.googleAds.spend}
                installs={data.googleAds.installs}
                cpi={data.googleAds.cpi}
                loading={data.googleAds.isLoading}
                error={data.googleAds.error}
              />
            </div>
          </>
        )}

        {/* Empty state */}
        {!anyPlatformLoading && data.totals.spend === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Select a date range and click Apply to view metrics</p>
            <p className="text-sm">Data will be fetched from Meta, Snapchat, Unity, and Google Ads</p>
          </div>
        )}
      </div>
    </div>
  );
}
