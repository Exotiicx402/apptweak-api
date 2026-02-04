import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageIcon, Film, LayoutGrid } from "lucide-react";
import { EnrichedCreative } from "@/hooks/useCreativePerformance";

interface CreativePerformanceTableProps {
  data: EnrichedCreative[];
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

export function CreativePerformanceTable({ data }: CreativePerformanceTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Creative Name</TableHead>
            <TableHead>Asset Type</TableHead>
            <TableHead>Angle</TableHead>
            <TableHead>Tactic</TableHead>
            <TableHead>Launch Date</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Installs</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">CPI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((creative) => (
            <TableRow key={creative.adId}>
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
              <TableCell>
                <Badge variant="secondary" className="gap-1">
                  {getAssetTypeIcon(creative.parsed.assetType || "IMG")}
                  {getAssetTypeLabel(creative.parsed.assetType || "IMG")}
                </Badge>
              </TableCell>
              <TableCell>
                {creative.parsed.angle ? (
                  <Badge variant="outline">{creative.parsed.angle}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {creative.parsed.tactic ? (
                  <Badge variant="outline">{creative.parsed.tactic}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {creative.parsed.launchDate ? (
                  <span className="text-sm">{creative.parsed.launchDate}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(creative.spend)}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(creative.installs)}
              </TableCell>
              <TableCell className="text-right">
                {formatPercent(creative.ctr)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(creative.cpi)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
