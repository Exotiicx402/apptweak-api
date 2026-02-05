import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageIcon, Film, LayoutGrid } from "lucide-react";
import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
import { ColumnConfig } from "./ColumnSettingsPopover";
import { useMemo } from "react";

interface CreativePerformanceTableProps {
  data: EnrichedCreative[];
  showPlatform?: boolean;
  columnConfig: ColumnConfig;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function getAssetTypeIcon(assetType: string) {
  const type = assetType.toUpperCase();
  if (type.includes("VID")) {
    return <Film className="h-4 w-4" />;
  }
  if (type.includes("CAR")) {
    return <LayoutGrid className="h-4 w-4" />;
  }
  return <ImageIcon className="h-4 w-4" />;
}

function getAssetTypeLabel(assetType: string): string {
  const type = assetType.toUpperCase();
  if (type.includes("VID")) return "Video";
  if (type.includes("CAR")) return "Carousel";
  return "Image";
}

function truncateName(name: string, maxLength: number = 40): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength) + "...";
}

function getPlatformLabel(platform: string): string {
  switch (platform) {
    case "meta": return "Meta";
    case "snapchat": return "Snapchat";
    case "tiktok": return "TikTok";
    case "google": return "Google";
    case "blended": return "Blended";
    default: return platform;
  }
}

// Calculate min/max for each metric to determine color intensity
function useMetricRanges(data: EnrichedCreative[]) {
  return useMemo(() => {
    if (data.length === 0) {
      return { spend: { min: 0, max: 0 }, installs: { min: 0, max: 0 }, ctr: { min: 0, max: 0 }, cpi: { min: 0, max: 0 } };
    }

    const ranges = {
      spend: { min: Infinity, max: -Infinity },
      installs: { min: Infinity, max: -Infinity },
      ctr: { min: Infinity, max: -Infinity },
      cpi: { min: Infinity, max: -Infinity },
    };

    for (const item of data) {
      if (item.spend < ranges.spend.min) ranges.spend.min = item.spend;
      if (item.spend > ranges.spend.max) ranges.spend.max = item.spend;
      if (item.installs < ranges.installs.min) ranges.installs.min = item.installs;
      if (item.installs > ranges.installs.max) ranges.installs.max = item.installs;
      if (item.ctr < ranges.ctr.min) ranges.ctr.min = item.ctr;
      if (item.ctr > ranges.ctr.max) ranges.ctr.max = item.ctr;
      if (item.cpi > 0 && item.cpi < ranges.cpi.min) ranges.cpi.min = item.cpi;
      if (item.cpi > ranges.cpi.max) ranges.cpi.max = item.cpi;
    }

    // Handle edge cases where all values are the same
    if (ranges.spend.min === Infinity) ranges.spend.min = 0;
    if (ranges.installs.min === Infinity) ranges.installs.min = 0;
    if (ranges.ctr.min === Infinity) ranges.ctr.min = 0;
    if (ranges.cpi.min === Infinity) ranges.cpi.min = 0;

    return ranges;
  }, [data]);
}

// Get intensity (0-1) for a value within a range
function getIntensity(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

// Generate background color style based on intensity
// Higher values = darker/more saturated
function getHeatmapStyle(intensity: number, color: "blue" | "green" | "purple" | "amber"): React.CSSProperties {
  if (intensity < 0.1) return {}; // No color for very low values
  
  const alpha = 0.15 + intensity * 0.45; // Range from 0.15 to 0.6 opacity
  
  const colors = {
    blue: `hsla(217, 91%, 60%, ${alpha})`,    // Blue for spend
    green: `hsla(142, 76%, 36%, ${alpha})`,   // Green for installs
    purple: `hsla(262, 83%, 58%, ${alpha})`,  // Purple for CTR
    amber: `hsla(38, 92%, 50%, ${alpha})`,    // Amber/orange for CPI (lower is better, so inverted)
  };

  return { backgroundColor: colors[color] };
}

export function CreativePerformanceTable({ data, showPlatform = false, columnConfig }: CreativePerformanceTableProps) {
  const { metrics, attributes } = columnConfig;
  const ranges = useMetricRanges(data);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Creative Name</TableHead>
            {showPlatform && <TableHead>Platform</TableHead>}
            {attributes.assetType && <TableHead>Asset Type</TableHead>}
            {attributes.category && <TableHead>Category</TableHead>}
            {attributes.angle && <TableHead>Messaging Angle</TableHead>}
            {attributes.tactic && <TableHead>Hook Tactic</TableHead>}
            {attributes.contentType && <TableHead>Content Type</TableHead>}
            {attributes.conceptId && <TableHead>Concept ID</TableHead>}
            {attributes.launchDate && <TableHead>Launch Date</TableHead>}
            {metrics.spend && <TableHead className="text-right">Spend</TableHead>}
            {metrics.installs && <TableHead className="text-right">Installs</TableHead>}
            {metrics.ctr && <TableHead className="text-right">CTR</TableHead>}
            {metrics.cpi && <TableHead className="text-right">CPI</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((creative) => (
            <TableRow key={`${creative.platform}-${creative.adId}`}>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-medium cursor-default">
                        {truncateName(creative.adName)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-md">
                      <p className="text-xs break-all">{creative.adName}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              {showPlatform && (
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {getPlatformLabel(creative.platform)}
                  </Badge>
                </TableCell>
              )}
              {attributes.assetType && (
                <TableCell>
                  <Badge variant="secondary" className="gap-1">
                    {getAssetTypeIcon(creative.parsed.assetType || "IMG")}
                    {getAssetTypeLabel(creative.parsed.assetType || "IMG")}
                  </Badge>
                </TableCell>
              )}
              {attributes.category && (
                <TableCell>
                  {creative.parsed.category ? (
                    <Badge variant="outline">{creative.parsed.category}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {attributes.angle && (
                <TableCell>
                  {creative.parsed.angle ? (
                    <Badge variant="outline">{creative.parsed.angle}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {attributes.tactic && (
                <TableCell>
                  {creative.parsed.tactic ? (
                    <Badge variant="outline">{creative.parsed.tactic}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {attributes.contentType && (
                <TableCell>
                  {creative.parsed.contentType ? (
                    <Badge variant="outline">{creative.parsed.contentType}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {attributes.conceptId && (
                <TableCell>
                  {creative.parsed.conceptId ? (
                    <span className="text-sm font-mono">{creative.parsed.conceptId}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {attributes.launchDate && (
                <TableCell>
                  {creative.parsed.launchDate ? (
                    <span className="text-sm">{creative.parsed.launchDate}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {metrics.spend && (
                <TableCell 
                  className="text-right font-medium"
                  style={getHeatmapStyle(getIntensity(creative.spend, ranges.spend.min, ranges.spend.max), "blue")}
                >
                  {formatCurrency(creative.spend)}
                </TableCell>
              )}
              {metrics.installs && (
                <TableCell 
                  className="text-right"
                  style={getHeatmapStyle(getIntensity(creative.installs, ranges.installs.min, ranges.installs.max), "green")}
                >
                  {formatNumber(creative.installs)}
                </TableCell>
              )}
              {metrics.ctr && (
                <TableCell 
                  className="text-right"
                  style={getHeatmapStyle(getIntensity(creative.ctr, ranges.ctr.min, ranges.ctr.max), "purple")}
                >
                  {formatPercent(creative.ctr)}
                </TableCell>
              )}
              {metrics.cpi && (
                <TableCell 
                  className="text-right"
                  style={getHeatmapStyle(
                    creative.cpi > 0 ? 1 - getIntensity(creative.cpi, ranges.cpi.min, ranges.cpi.max) : 0,
                    "amber"
                  )}
                >
                  {formatCurrency(creative.cpi)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
