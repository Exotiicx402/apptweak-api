import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImageIcon, Film, LayoutGrid, DollarSign, Download, MousePointer, Target, Grid3X3, TableIcon } from "lucide-react";
import { useCreativePerformance, EnrichedCreative } from "@/hooks/useCreativePerformance";
import { CreativePerformanceTable } from "./CreativePerformanceTable";

type ViewMode = "cards" | "table";

interface CreativePerformanceGridProps {
  startDate: string;
  endDate: string;
  dataFetched: boolean;
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

function truncateName(name: string, maxLength: number = 50): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength) + "...";
}

function CreativeCard({ creative }: { creative: EnrichedCreative }) {
  const { parsed } = creative;
  const assetType = parsed.assetType || "IMG";

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Header with asset type */}
      <div className="bg-muted px-4 py-2 flex items-center gap-2 border-b">
        {getAssetTypeIcon(assetType)}
        <span className="text-sm font-medium text-muted-foreground">
          {getAssetTypeLabel(assetType)}
        </span>
      </div>

      <CardContent className="p-4">
        {/* Creative name with tooltip */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm font-medium text-foreground truncate mb-3 cursor-default">
                {truncateName(creative.adName)}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md">
              <p className="text-xs break-all">{creative.adName}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {parsed.angle && (
            <Badge variant="secondary" className="text-xs">
              Angle: {parsed.angle}
            </Badge>
          )}
          {parsed.tactic && (
            <Badge variant="outline" className="text-xs">
              Tactic: {parsed.tactic}
            </Badge>
          )}
          {parsed.category && (
            <Badge variant="outline" className="text-xs">
              {parsed.category}
            </Badge>
          )}
        </div>

        {/* Performance metrics */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Spend</p>
              <p className="font-medium">{formatCurrency(creative.spend)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Installs</p>
              <p className="font-medium">{formatNumber(creative.installs)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MousePointer className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">CTR</p>
              <p className="font-medium">{formatPercent(creative.ctr)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">CPI</p>
              <p className="font-medium">{formatCurrency(creative.cpi)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreativeCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b">
        <Skeleton className="h-4 w-16" />
      </div>
      <CardContent className="p-4">
        <Skeleton className="h-4 w-3/4 mb-3" />
        <div className="flex gap-1.5 mb-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </CardContent>
    </Card>
  );
}

export function CreativePerformanceGrid({ startDate, endDate, dataFetched }: CreativePerformanceGridProps) {
  const { data, isLoading, error, fetchCreatives } = useCreativePerformance();
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  useEffect(() => {
    if (dataFetched && startDate && endDate) {
      fetchCreatives(startDate, endDate);
    }
  }, [startDate, endDate, dataFetched, fetchCreatives]);

  if (!dataFetched) {
    return null;
  }

  const headerContent = (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-foreground">Top Creatives (Meta)</h2>
      <ToggleGroup 
        type="single" 
        value={viewMode} 
        onValueChange={(value) => value && setViewMode(value as ViewMode)}
        className="border rounded-md"
      >
        <ToggleGroupItem value="cards" aria-label="Card view" className="px-3">
          <Grid3X3 className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="table" aria-label="Table view" className="px-3">
          <TableIcon className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

  if (isLoading) {
    return (
      <div className="mt-8">
        {headerContent}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CreativeCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8">
        {headerContent}
        <Card>
          <CardContent className="py-8">
            <p className="text-destructive text-center">Error loading creatives: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="mt-8">
        {headerContent}
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">No creative data available for this date range</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {headerContent}
      {viewMode === "cards" ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((creative) => (
            <CreativeCard key={creative.adId} creative={creative} />
          ))}
        </div>
      ) : (
        <CreativePerformanceTable data={data} />
      )}
    </div>
  );
}
