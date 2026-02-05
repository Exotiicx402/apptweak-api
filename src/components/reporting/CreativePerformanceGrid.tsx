import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImageIcon, Film, LayoutGrid, DollarSign, Download, MousePointer, Target, Grid3X3, TableIcon } from "lucide-react";
import { useMultiPlatformCreatives, EnrichedCreative, Platform } from "@/hooks/useMultiPlatformCreatives";
import { CreativePerformanceTable } from "./CreativePerformanceTable";
import { PlatformFilterBar } from "./PlatformFilterBar";
import { ColumnSettingsPopover, ColumnConfig, defaultColumnConfig } from "./ColumnSettingsPopover";
import { CreativeBreakdownDialog } from "./CreativeBreakdownDialog";

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

function getPlatformBadgeVariant(platform: string): "default" | "secondary" | "outline" | "destructive" {
  switch (platform) {
    case "meta": return "default";
    case "snapchat": return "secondary";
    case "tiktok": return "outline";
    case "google": return "outline";
    case "blended": return "secondary";
    default: return "outline";
  }
}

interface CreativeCardProps {
  creative: EnrichedCreative;
  showPlatform: boolean;
  columnConfig: ColumnConfig;
  onClick?: () => void;
  isClickable?: boolean;
}

function CreativeCard({ creative, showPlatform, columnConfig, onClick, isClickable }: CreativeCardProps) {
  const { parsed } = creative;
  const assetType = parsed.assetType || "IMG";
  const { metrics, attributes } = columnConfig;

  return (
    <Card 
      className={`overflow-hidden hover:shadow-lg transition-shadow ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-primary/20' : ''}`}
      onClick={onClick}
    >
      {/* Header with asset type */}
      <div className="bg-muted px-4 py-2 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          {getAssetTypeIcon(assetType)}
          <span className="text-sm font-medium text-muted-foreground">
            {getAssetTypeLabel(assetType)}
          </span>
        </div>
        {showPlatform && (
          <Badge variant={getPlatformBadgeVariant(creative.platform)} className="text-[10px]">
            {getPlatformLabel(creative.platform)}
          </Badge>
        )}
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
          {attributes.angle && parsed.angle && (
            <Badge variant="secondary" className="text-xs">
              Angle: {parsed.angle}
            </Badge>
          )}
          {attributes.tactic && parsed.tactic && (
            <Badge variant="outline" className="text-xs">
              Tactic: {parsed.tactic}
            </Badge>
          )}
          {attributes.category && parsed.category && (
            <Badge variant="outline" className="text-xs">
              {parsed.category}
            </Badge>
          )}
          {attributes.contentType && parsed.contentType && (
            <Badge variant="outline" className="text-xs">
              {parsed.contentType}
            </Badge>
          )}
          {attributes.conceptId && parsed.conceptId && (
            <Badge variant="outline" className="text-xs">
              ID: {parsed.conceptId}
            </Badge>
          )}
          {attributes.launchDate && parsed.launchDate && (
            <Badge variant="outline" className="text-xs">
              {parsed.launchDate}
            </Badge>
          )}
        </div>

        {/* Performance metrics */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {metrics.spend && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Spend</p>
                <p className="font-medium">{formatCurrency(creative.spend)}</p>
              </div>
            </div>
          )}
          {metrics.installs && (
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Installs</p>
                <p className="font-medium">{formatNumber(creative.installs)}</p>
              </div>
            </div>
          )}
          {metrics.ctr && (
            <div className="flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">CTR</p>
                <p className="font-medium">{formatPercent(creative.ctr)}</p>
              </div>
            </div>
          )}
          {metrics.cpi && (
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">CPI</p>
                <p className="font-medium">{formatCurrency(creative.cpi)}</p>
              </div>
            </div>
          )}
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
  const { 
    data, 
    isLoading, 
    errors, 
    activePlatform, 
    setActivePlatform, 
    fetchAllPlatforms,
    hasAdData,
    platformCounts,
    getPlatformBreakdown
  } = useMultiPlatformCreatives();
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>(defaultColumnConfig);
  const [selectedCreative, setSelectedCreative] = useState<EnrichedCreative | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const handleCreativeClick = (creative: EnrichedCreative) => {
    if (activePlatform === "blended") {
      setSelectedCreative(creative);
      setBreakdownOpen(true);
    }
  };

  const platformBreakdown = selectedCreative 
    ? getPlatformBreakdown(selectedCreative.adName) 
    : [];

  useEffect(() => {
    if (dataFetched && startDate && endDate) {
      fetchAllPlatforms(startDate, endDate);
    }
  }, [startDate, endDate, dataFetched, fetchAllPlatforms]);

  if (!dataFetched) {
    return null;
  }

  // Check if the selected platform lacks ad-level data
  const platformMissingAdData = 
    (activePlatform === "snapchat" && !hasAdData.snapchat) ||
    (activePlatform === "tiktok" && !hasAdData.tiktok) ||
    (activePlatform === "google" && !hasAdData.google);

  const getPlatformUnavailableMessage = (platform: Platform): string => {
    const platformNames: Record<string, string> = {
      snapchat: "Snapchat",
      tiktok: "TikTok",
      google: "Google Ads",
    };
    const name = platformNames[platform] || platform;
    return `Ad-level creative data is not yet available for ${name}. This platform currently syncs at campaign level only.`;
  };

  const showPlatformBadge = activePlatform === "blended";

  const headerContent = (
    <div className="flex flex-col gap-4 mb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Top Creatives</h2>
        <div className="flex items-center gap-2">
          <ColumnSettingsPopover config={columnConfig} onChange={setColumnConfig} />
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
      </div>
      <PlatformFilterBar
        activePlatform={activePlatform}
        onPlatformChange={setActivePlatform}
        counts={platformCounts}
      />
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

  if (errors.length > 0 && data.length === 0) {
    return (
      <div className="mt-8">
        {headerContent}
        <Card>
          <CardContent className="py-8">
            <p className="text-destructive text-center">Error loading creatives: {errors.join(", ")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show message for platforms without ad-level data
  if (platformMissingAdData && !isLoading) {
    return (
      <div className="mt-8">
        {headerContent}
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">{getPlatformUnavailableMessage(activePlatform)}</p>
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
            <CreativeCard 
              key={`${creative.platform}-${creative.adId}`} 
              creative={creative} 
              showPlatform={showPlatformBadge}
              columnConfig={columnConfig}
              onClick={() => handleCreativeClick(creative)}
              isClickable={activePlatform === "blended"}
            />
          ))}
        </div>
      ) : (
        <CreativePerformanceTable 
          data={data} 
          showPlatform={showPlatformBadge} 
          columnConfig={columnConfig}
          onRowClick={activePlatform === "blended" ? handleCreativeClick : undefined}
        />
      )}

      <CreativeBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        creative={selectedCreative}
        platformBreakdown={platformBreakdown}
      />
    </div>
  );
}
