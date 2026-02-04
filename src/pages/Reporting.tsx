import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { TotalMetricsSection } from "@/components/reporting/TotalMetricsSection";
import { PlatformMetricsRow } from "@/components/reporting/PlatformMetricsRow";
import { useReportingData } from "@/hooks/useReportingData";
import { getLocalDaysAgo, getLocalYesterday } from "@/lib/dateUtils";

import metaLogo from "@/assets/logos/meta.png";
import snapchatLogo from "@/assets/logos/snapchat.png";
import googleAdsLogo from "@/assets/logos/google-ads.png";
import tiktokLogo from "@/assets/logos/tiktok.png";

export default function Reporting() {
  const [startDate, setStartDate] = useState(getLocalDaysAgo(8));
  const [endDate, setEndDate] = useState(getLocalYesterday());
  const { data, isLoading, fetchAllPlatforms } = useReportingData();

  const handleApply = () => {
    fetchAllPlatforms(startDate, endDate);
  };

  const anyPlatformLoading = 
    data.meta?.isLoading || 
    data.snapchat?.isLoading || 
    data.googleAds?.isLoading ||
    data.tiktok?.isLoading;

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
              previousSpend={data.totals.previousSpend}
              previousInstalls={data.totals.previousInstalls}
              previousCpi={data.totals.previousCpi}
              loading={anyPlatformLoading}
            />

            {/* Platform Sections */}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold mb-4 text-foreground">By Platform</h2>
              
              <PlatformMetricsRow
                platform="Meta Ads"
                logo={metaLogo}
                spend={data.meta.spend}
                installs={data.meta.installs}
                cpi={data.meta.cpi}
                previousSpend={data.meta.previousSpend}
                previousInstalls={data.meta.previousInstalls}
                previousCpi={data.meta.previousCpi}
                loading={data.meta.isLoading}
                error={data.meta.error}
              />

              <PlatformMetricsRow
                platform="Snapchat"
                logo={snapchatLogo}
                spend={data.snapchat.spend}
                installs={data.snapchat.installs}
                cpi={data.snapchat.cpi}
                previousSpend={data.snapchat.previousSpend}
                previousInstalls={data.snapchat.previousInstalls}
                previousCpi={data.snapchat.previousCpi}
                loading={data.snapchat.isLoading}
                error={data.snapchat.error}
              />

              <PlatformMetricsRow
                platform="Google Ads"
                logo={googleAdsLogo}
                spend={data.googleAds.spend}
                installs={data.googleAds.installs}
                cpi={data.googleAds.cpi}
                previousSpend={data.googleAds.previousSpend}
                previousInstalls={data.googleAds.previousInstalls}
                previousCpi={data.googleAds.previousCpi}
                loading={data.googleAds.isLoading}
                error={data.googleAds.error}
                dataUnavailable={data.googleAds.dataUnavailable}
                unavailableReason={data.googleAds.unavailableReason}
              />

              <PlatformMetricsRow
                platform="TikTok"
                logo={tiktokLogo}
                spend={data.tiktok.spend}
                installs={data.tiktok.installs}
                cpi={data.tiktok.cpi}
                previousSpend={data.tiktok.previousSpend}
                previousInstalls={data.tiktok.previousInstalls}
                previousCpi={data.tiktok.previousCpi}
                loading={data.tiktok.isLoading}
                error={data.tiktok.error}
                dataUnavailable={data.tiktok.dataUnavailable}
                unavailableReason={data.tiktok.unavailableReason}
              />
            </div>
          </>
        )}

        {/* Empty state */}
        {!anyPlatformLoading && data.totals.spend === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Select a date range and click Apply to view metrics</p>
            <p className="text-sm">Data will be fetched from Meta, Snapchat, Google Ads, and TikTok</p>
          </div>
        )}
      </div>
    </div>
  );
}
