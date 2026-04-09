import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Grid3X3, TableIcon, ArrowUpDown, ImageIcon, Film, LayoutGrid, MessageSquare, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TotalMetricsSection } from "@/components/reporting/TotalMetricsSection";
import { PlatformMetricsRow } from "@/components/reporting/PlatformMetricsRow";
import { DailyBreakdownTable } from "@/components/reporting/DailyBreakdownTable";
import { AttributeLeaderboard } from "@/components/reporting/AttributeLeaderboard";
import { CreativeSummaryBar } from "@/components/reporting/CreativeSummaryBar";
import { AttributeFilterBar, AttributeFilters } from "@/components/reporting/AttributeFilterBar";
import { CreativePreviewDialog } from "@/components/reporting/CreativePreviewDialog";
import { demoReportingData, demoCreatives } from "@/lib/demoData";
import type { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";

import metaLogo from "@/assets/logos/meta.png";
import molocoLogo from "@/assets/logos/moloco.webp";

type ViewMode = "cards" | "table";
type AssetTypeFilter = "all" | "image" | "video";
type SortKey = "spend" | "ftds" | "cftd" | "cpi" | "ctr" | "installs";

function isVideoCreative(creative: EnrichedCreative): boolean {
  return creative.assetType?.toLowerCase() === "video" || creative.parsed.assetType?.toUpperCase()?.includes("VID") || false;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function formatNumber(v: number) { return new Intl.NumberFormat("en-US").format(v); }
function formatPercent(v: number) { return `${(v * 100).toFixed(2)}%`; }

function getAssetTypeLabel(t: string) {
  const u = t.toUpperCase();
  if (u.includes("VID")) return "Video";
  if (u.includes("CAR")) return "Carousel";
  return "Image";
}

function DemoCreativeCard({ creative, onClick }: { creative: EnrichedCreative; onClick?: () => void }) {
  const { parsed } = creative;
  const [imageError, setImageError] = useState(false);
  const hasImage = creative.assetUrl && !imageError;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer hover:ring-2 hover:ring-primary/20" onClick={onClick}>
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {hasImage ? (
          <img src={creative.assetUrl!} alt={creative.adName} className="w-full h-full object-cover" onError={() => setImageError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <Badge className="absolute bottom-2 left-2 bg-black/70 text-white border-0 text-xs px-2 py-1 hover:bg-black/70">
          {getAssetTypeLabel(parsed.assetType || "IMG")}
        </Badge>
        <Badge variant={creative.platform === "meta" ? "default" : "secondary"} className="absolute top-2 right-2 text-[10px]">
          {creative.platform === "meta" ? "Meta" : "Moloco"}
        </Badge>
      </div>
      <CardContent className="p-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm font-medium text-foreground truncate mb-2 cursor-default">
                {creative.adName.length > 40 ? creative.adName.substring(0, 40) + "..." : creative.adName}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md"><p className="text-xs break-all">{creative.adName}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="space-y-1 text-sm mb-3">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Spend</span><span className="font-medium">{formatCurrency(creative.spend)}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">FTD</span><span className="font-medium">{creative.ftds > 0 ? formatNumber(creative.ftds) : "-"}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">CFTD</span><span className="font-medium">{creative.cftd > 0 ? formatCurrency(creative.cftd) : "-"}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Thumbstop</span><span className="font-medium">{creative.thumbstopRate > 0 ? formatPercent(creative.thumbstopRate) : "-"}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Avg. Watch Time</span><span className="font-medium">{creative.avgWatchTime > 0 ? `${creative.avgWatchTime.toFixed(1)}s` : "-"}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">CTR</span><span className="font-medium">{formatPercent(creative.ctr)}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Installs</span><span className="font-medium">{creative.installs > 0 ? formatNumber(creative.installs) : "-"}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">CPI</span><span className="font-medium">{creative.cpi > 0 ? formatCurrency(creative.cpi) : "-"}</span></div>
        </div>
        <div className="space-y-2">
          {parsed.contentType && (
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{parsed.contentType}</Badge>
            </div>
          )}
          {parsed.angle && (
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">{parsed.angle}</Badge>
            </div>
          )}
          {parsed.tactic && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">{parsed.tactic}</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DemoReporting() {
  const { meta, moloco, totals } = demoReportingData;
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilters>({});
  const [selectedCreative, setSelectedCreative] = useState<EnrichedCreative | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Filter creatives
  const attributeFiltered = demoCreatives.filter((c) =>
    Object.entries(attributeFilters).every(([key, values]) => {
      if (!values || values.length === 0) return true;
      const val = c.parsed[key as keyof typeof c.parsed];
      return val && values.includes(val.trim());
    })
  );

  const assetFiltered = attributeFiltered.filter((c) => {
    if (assetTypeFilter === "all") return true;
    if (assetTypeFilter === "video") return isVideoCreative(c);
    return !isVideoCreative(c);
  });

  const sorted = [...assetFiltered].sort((a, b) => {
    if (sortKey === "cftd" || sortKey === "cpi") {
      if (a[sortKey] === 0 && b[sortKey] === 0) return b.spend - a.spend;
      if (a[sortKey] === 0) return 1;
      if (b[sortKey] === 0) return -1;
      return a[sortKey] - b[sortKey];
    }
    return b[sortKey] - a[sortKey];
  });

  const videoCount = attributeFiltered.filter(isVideoCreative).length;
  const imageCount = attributeFiltered.length - videoCount;

  const handleLeaderboardClick = (key: string, value: string) => {
    const current = attributeFilters[key] || [];
    if (current.includes(value)) return;
    setAttributeFilters({ ...attributeFilters, [key]: [...current, value] });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <style dangerouslySetInnerHTML={{ __html: `
        .demo-blur .text-2xl.font-bold,
        .demo-blur .text-xl.font-semibold {
          filter: blur(8px);
          user-select: none;
        }
        .demo-blur td {
          filter: blur(6px);
          user-select: none;
        }
        .demo-blur .font-medium:not(h1):not(h2):not(h3):not(p):not([class*="truncate"]) {
          filter: blur(6px);
          user-select: none;
        }
      `}} />
      <div className="max-w-6xl mx-auto demo-blur">
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
            platform="Meta Ads" logo={metaLogo}
            spend={meta.spend} installs={meta.installs} cpi={meta.cpi}
            registrations={meta.registrations} cps={meta.registrations > 0 ? meta.spend / meta.registrations : 0}
            ftds={meta.ftds} cftd={meta.ftds > 0 ? meta.spend / meta.ftds : 0}
            previousSpend={meta.previousSpend} previousInstalls={meta.previousInstalls} previousCpi={meta.previousCpi}
            previousRegistrations={meta.previousRegistrations}
            previousCps={meta.previousRegistrations > 0 ? meta.previousSpend / meta.previousRegistrations : 0}
            previousFtds={meta.previousFtds} previousCftd={meta.previousFtds > 0 ? meta.previousSpend / meta.previousFtds : 0}
          />
          <PlatformMetricsRow
            platform="Moloco" logo={molocoLogo}
            spend={moloco.spend} installs={moloco.installs} cpi={moloco.cpi}
            registrations={moloco.registrations} cps={moloco.registrations > 0 ? moloco.spend / moloco.registrations : 0}
            ftds={moloco.ftds} cftd={moloco.ftds > 0 ? moloco.spend / moloco.ftds : 0}
            previousSpend={moloco.previousSpend} previousInstalls={moloco.previousInstalls} previousCpi={moloco.previousCpi}
            previousRegistrations={moloco.previousRegistrations}
            previousCps={moloco.previousRegistrations > 0 ? moloco.previousSpend / moloco.previousRegistrations : 0}
            previousFtds={moloco.previousFtds} previousCftd={moloco.previousFtds > 0 ? moloco.previousSpend / moloco.previousFtds : 0}
          />
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Daily Breakdown</h2>
          <DailyBreakdownTable platform="Meta Ads" logo={metaLogo} daily={meta.daily} />
          <DailyBreakdownTable platform="Moloco" logo={molocoLogo} daily={moloco.daily} />
        </div>

        {/* Creative Performance Section */}
        <div className="mt-8">
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Top Creatives</h2>
              <div className="flex items-center gap-2">
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spend">Spend</SelectItem>
                    <SelectItem value="ftds">FTDs</SelectItem>
                    <SelectItem value="cftd">CFTD (low)</SelectItem>
                    <SelectItem value="cpi">CPI (low)</SelectItem>
                    <SelectItem value="ctr">CTR</SelectItem>
                    <SelectItem value="installs">Installs</SelectItem>
                  </SelectContent>
                </Select>
                <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)} className="border rounded-md">
                  <ToggleGroupItem value="cards" aria-label="Card view" className="px-3"><Grid3X3 className="h-4 w-4" /></ToggleGroupItem>
                  <ToggleGroupItem value="table" aria-label="Table view" className="px-3"><TableIcon className="h-4 w-4" /></ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div />
              <ToggleGroup type="single" value={assetTypeFilter} onValueChange={(v) => v && setAssetTypeFilter(v as AssetTypeFilter)} className="border rounded-md">
                <ToggleGroupItem value="all" className="px-3 text-xs gap-1"><LayoutGrid className="h-3.5 w-3.5" />All ({attributeFiltered.length})</ToggleGroupItem>
                <ToggleGroupItem value="image" className="px-3 text-xs gap-1"><ImageIcon className="h-3.5 w-3.5" />Image ({imageCount})</ToggleGroupItem>
                <ToggleGroupItem value="video" className="px-3 text-xs gap-1"><Film className="h-3.5 w-3.5" />Video ({videoCount})</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <AttributeFilterBar data={demoCreatives} activeFilters={attributeFilters} onFiltersChange={setAttributeFilters} />
          </div>

          <AttributeLeaderboard data={attributeFiltered} onAttributeClick={handleLeaderboardClick} />
          <CreativeSummaryBar data={sorted} />

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((creative) => (
              <DemoCreativeCard key={creative.adId} creative={creative} onClick={() => { setSelectedCreative(creative); setPreviewOpen(true); }} />
            ))}
          </div>

          <CreativePreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            creative={selectedCreative}
            platformBreakdown={[]}
            adsetBreakdown={[]}
            isBlended={false}
          />
        </div>
      </div>
    </div>
  );
}
