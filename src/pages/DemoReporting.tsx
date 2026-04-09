import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { TotalMetricsSection } from "@/components/reporting/TotalMetricsSection";
import { PlatformMetricsRow } from "@/components/reporting/PlatformMetricsRow";
import { DailyBreakdownTable } from "@/components/reporting/DailyBreakdownTable";
import { demoReportingData } from "@/lib/demoData";

import metaLogo from "@/assets/logos/meta.png";
import molocoLogo from "@/assets/logos/moloco.webp";

export default function DemoReporting() {
  const { meta, moloco, totals } = demoReportingData;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/demo" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Performance Report</h1>
          </div>
        </div>

        <div className="mb-8 p-4 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
          Showing data for the last 8 days
        </div>

        <TotalMetricsSection
          spend={totals.spend}
          cpi={totals.cpi}
          cps={totals.cps}
          ftds={totals.ftds}
          cftd={totals.cftd}
          previousSpend={totals.previousSpend}
          previousCpi={totals.previousCpi}
          previousCps={totals.previousCps}
          previousFtds={totals.previousFtds}
          previousCftd={totals.previousCftd}
        />

        <div className="space-y-2">
          <h2 className="text-lg font-semibold mb-4 text-foreground">By Platform</h2>

          <PlatformMetricsRow
            platform="Meta Ads"
            logo={metaLogo}
            spend={meta.spend}
            installs={meta.installs}
            cpi={meta.cpi}
            registrations={meta.registrations}
            cps={meta.registrations > 0 ? meta.spend / meta.registrations : 0}
            ftds={meta.ftds}
            cftd={meta.ftds > 0 ? meta.spend / meta.ftds : 0}
            previousSpend={meta.previousSpend}
            previousInstalls={meta.previousInstalls}
            previousCpi={meta.previousCpi}
            previousRegistrations={meta.previousRegistrations}
            previousCps={meta.previousRegistrations > 0 ? meta.previousSpend / meta.previousRegistrations : 0}
            previousFtds={meta.previousFtds}
            previousCftd={meta.previousFtds > 0 ? meta.previousSpend / meta.previousFtds : 0}
          />

          <PlatformMetricsRow
            platform="Moloco"
            logo={molocoLogo}
            spend={moloco.spend}
            installs={moloco.installs}
            cpi={moloco.cpi}
            registrations={moloco.registrations}
            cps={moloco.registrations > 0 ? moloco.spend / moloco.registrations : 0}
            ftds={moloco.ftds}
            cftd={moloco.ftds > 0 ? moloco.spend / moloco.ftds : 0}
            previousSpend={moloco.previousSpend}
            previousInstalls={moloco.previousInstalls}
            previousCpi={moloco.previousCpi}
            previousRegistrations={moloco.previousRegistrations}
            previousCps={moloco.previousRegistrations > 0 ? moloco.previousSpend / moloco.previousRegistrations : 0}
            previousFtds={moloco.previousFtds}
            previousCftd={moloco.previousFtds > 0 ? moloco.previousSpend / moloco.previousFtds : 0}
          />
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Daily Breakdown</h2>
          <DailyBreakdownTable platform="Meta Ads" logo={metaLogo} daily={meta.daily} />
          <DailyBreakdownTable platform="Moloco" logo={molocoLogo} daily={moloco.daily} />
        </div>
      </div>
    </div>
  );
}
