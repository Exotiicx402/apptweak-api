import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Download, DollarSign, MousePointer, Eye, TrendingUp, Coins, Percent } from "lucide-react";
import { DateRangePicker } from "@/components/dashboard/DateRangePicker";
import { MetricKpiCard } from "@/components/dashboard/MetricKpiCard";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { useFTDPerformance } from "@/hooks/useFTDPerformance";
import { getLocalDaysAgo, getLocalYesterday } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import metaLogo from "@/assets/logos/meta.png";

function fmt(n: number, type: "currency" | "number" | "percent" = "number") {
  if (type === "currency") return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (type === "percent") return `${n.toFixed(2)}%`;
  return n.toLocaleString("en-US");
}

export default function FTDReporting() {
  const [startDate, setStartDate] = useState(getLocalDaysAgo(30));
  const [endDate, setEndDate] = useState(getLocalYesterday());
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");

  const { data, isLoading, isSyncing, error, syncResult, fetchData, syncFromMeta } = useFTDPerformance();

  const handleApply = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    fetchData(startDate, endDate);
  };

  const handleSync = () => {
    if (!appliedStart || !appliedEnd) {
      syncFromMeta(startDate, endDate);
    } else {
      syncFromMeta(appliedStart, appliedEnd);
    }
  };

  const totals = data?.totals;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <img src={metaLogo} alt="Meta" className="w-6 h-6 object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">FTD Campaigns</h1>
                <p className="text-xs text-muted-foreground font-mono">
                  HOURS · PROSPECTING · INTERNATIONAL · WEB · FTD
                </p>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing…" : "Sync from Meta"}
          </Button>
        </div>

        {/* Sync result banner */}
        {syncResult && (
          <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary">
            ✓ {syncResult}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

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

        {/* Empty state */}
        {!isLoading && !data && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Select a date range and click Apply to view FTD metrics</p>
            <p className="text-sm">
              If no data appears, click <strong>Sync from Meta</strong> first to pull campaign data.
            </p>
          </div>
        )}

        {(data || isLoading) && (
          <>
            {/* KPI Cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-8 mb-6">
              <MetricKpiCard
                title="Total Spend"
                value={totals?.spend ?? 0}
                currentValue={totals?.spend ?? 0}
                previousValue={0}
                format="currency"
                icon={<DollarSign className="h-4 w-4" />}
                loading={isLoading}
              />
              <MetricKpiCard
                title="FTD Count"
                value={totals?.ftd_count ?? 0}
                currentValue={totals?.ftd_count ?? 0}
                previousValue={0}
                format="number"
                icon={<Download className="h-4 w-4" />}
                loading={isLoading}
              />
              <MetricKpiCard
                title="Cost per FTD"
                value={totals?.cost_per_ftd ?? 0}
                currentValue={totals?.cost_per_ftd ?? 0}
                previousValue={0}
                format="currency"
                icon={<Coins className="h-4 w-4" />}
                loading={isLoading}
              />
              <MetricKpiCard
                title="Impressions"
                value={totals?.impressions ?? 0}
                currentValue={totals?.impressions ?? 0}
                previousValue={0}
                format="number"
                icon={<Eye className="h-4 w-4" />}
                loading={isLoading}
              />
              <MetricKpiCard
                title="Clicks"
                value={totals?.clicks ?? 0}
                currentValue={totals?.clicks ?? 0}
                previousValue={0}
                format="number"
                icon={<MousePointer className="h-4 w-4" />}
                loading={isLoading}
              />
              <MetricKpiCard
                title="CTR"
                value={totals?.ctr ?? 0}
                currentValue={totals?.ctr ?? 0}
                previousValue={0}
                format="percent"
                icon={<Percent className="h-4 w-4" />}
                loading={isLoading}
              />
              <MetricKpiCard
                title="CPM"
                value={totals?.cpm ?? 0}
                currentValue={totals?.cpm ?? 0}
                previousValue={0}
                format="currency"
                icon={<TrendingUp className="h-4 w-4" />}
                loading={isLoading}
              />
              <MetricKpiCard
                title="CPC"
                value={totals?.cpc ?? 0}
                currentValue={totals?.cpc ?? 0}
                previousValue={0}
                format="currency"
                icon={<TrendingUp className="h-4 w-4" />}
                loading={isLoading}
              />
            </div>

            {/* Campaign Breakdown */}
            {(data?.campaigns ?? []).length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Campaign Breakdown
                    <Badge variant="secondary">{data!.campaigns.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">FTDs</TableHead>
                        <TableHead className="text-right">Cost / FTD</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">ROAS</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.campaigns.map((c) => (
                        <TableRow key={c.campaign_id || c.campaign_name}>
                          <TableCell className="font-medium text-sm max-w-xs truncate" title={c.campaign_name}>
                            {c.campaign_name}
                          </TableCell>
                          <TableCell className="text-right">{fmt(c.spend, "currency")}</TableCell>
                          <TableCell className="text-right">{fmt(c.ftd_count)}</TableCell>
                          <TableCell className="text-right">
                            {c.ftd_count > 0 ? fmt(c.cost_per_ftd, "currency") : "—"}
                          </TableCell>
                          <TableCell className="text-right">{fmt(c.results_value, "currency")}</TableCell>
                          <TableCell className="text-right">
                            {c.roas > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                          </TableCell>
                          <TableCell className="text-right">{fmt(c.impressions)}</TableCell>
                          <TableCell className="text-right">{fmt(c.clicks)}</TableCell>
                          <TableCell className="text-right">{fmt(c.ctr, "percent")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}


            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <TimeSeriesChart
                title="Spend Over Time"
                data={(data?.daily ?? []).map((d) => ({ date: d.date, value: d.spend }))}
                format="currency"
                loading={isLoading}
              />
              <TimeSeriesChart
                title="FTDs Over Time"
                data={(data?.daily ?? []).map((d) => ({ date: d.date, value: d.ftd_count }))}
                format="number"
                color="hsl(142, 76%, 36%)"
                loading={isLoading}
              />
              <TimeSeriesChart
                title="Cost per FTD"
                data={(data?.daily ?? []).map((d) => ({ date: d.date, value: d.cost_per_ftd }))}
                format="currency"
                color="hsl(280, 67%, 50%)"
                loading={isLoading}
              />
              <TimeSeriesChart
                title="Impressions Over Time"
                data={(data?.daily ?? []).map((d) => ({ date: d.date, value: d.impressions }))}
                format="number"
                color="hsl(48, 96%, 53%)"
                loading={isLoading}
              />
            </div>

            {/* Ad Set Breakdown */}
            {(data?.adsets ?? []).length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Ad Set Breakdown
                    <Badge variant="secondary">{data!.adsets.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ad Set</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">FTDs</TableHead>
                        <TableHead className="text-right">Cost / FTD</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.adsets.map((as) => (
                        <TableRow key={as.adset_id || as.adset_name}>
                          <TableCell className="font-medium text-sm max-w-xs truncate" title={as.adset_name}>
                            {as.adset_name}
                          </TableCell>
                          <TableCell className="text-right">{fmt(as.spend, "currency")}</TableCell>
                          <TableCell className="text-right">{fmt(as.ftd_count)}</TableCell>
                          <TableCell className="text-right">
                            {as.ftd_count > 0 ? fmt(as.cost_per_ftd, "currency") : "—"}
                          </TableCell>
                          <TableCell className="text-right">{fmt(as.impressions)}</TableCell>
                          <TableCell className="text-right">{fmt(as.clicks)}</TableCell>
                          <TableCell className="text-right">{fmt(as.ctr, "percent")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Ad / Creative Breakdown */}
            {(data?.ads ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Ad / Creative Breakdown
                    <Badge variant="secondary">{data!.ads.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ad Name</TableHead>
                        <TableHead>Ad Set</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">FTDs</TableHead>
                        <TableHead className="text-right">Cost / FTD</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.ads.map((ad) => (
                        <TableRow key={ad.ad_id || ad.ad_name}>
                          <TableCell className="font-medium text-sm max-w-xs truncate" title={ad.ad_name}>
                            {ad.ad_name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate" title={ad.adset_name}>
                            {ad.adset_name}
                          </TableCell>
                          <TableCell className="text-right">{fmt(ad.spend, "currency")}</TableCell>
                          <TableCell className="text-right">{fmt(ad.ftd_count)}</TableCell>
                          <TableCell className="text-right">
                            {ad.ftd_count > 0 ? fmt(ad.cost_per_ftd, "currency") : "—"}
                          </TableCell>
                          <TableCell className="text-right">{fmt(ad.impressions)}</TableCell>
                          <TableCell className="text-right">{fmt(ad.clicks)}</TableCell>
                          <TableCell className="text-right">{fmt(ad.ctr, "percent")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* No data after apply */}
            {!isLoading && data && data.daily.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="mb-2">No FTD data found for this date range.</p>
                <p className="text-sm">
                  Click <strong>Sync from Meta</strong> to pull data for this period.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
