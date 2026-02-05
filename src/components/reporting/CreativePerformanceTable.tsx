import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageIcon, Film, LayoutGrid } from "lucide-react";
import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
import { ColumnConfig } from "./ColumnSettingsPopover";

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

export function CreativePerformanceTable({ data, showPlatform = false, columnConfig }: CreativePerformanceTableProps) {
  const { metrics, attributes } = columnConfig;

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
                <TableCell className="text-right font-medium">
                  {formatCurrency(creative.spend)}
                </TableCell>
              )}
              {metrics.installs && (
                <TableCell className="text-right">
                  {formatNumber(creative.installs)}
                </TableCell>
              )}
              {metrics.ctr && (
                <TableCell className="text-right">
                  {formatPercent(creative.ctr)}
                </TableCell>
              )}
              {metrics.cpi && (
                <TableCell className="text-right">
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
