import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImageIcon, Film, LayoutGrid, MessageSquare, Tag, Grid3X3, TableIcon } from "lucide-react";
import { useMultiPlatformCreatives, EnrichedCreative, Platform } from "@/hooks/useMultiPlatformCreatives";
import { CreativePerformanceTable } from "./CreativePerformanceTable";
import { PlatformFilterBar } from "./PlatformFilterBar";
import { ColumnSettingsPopover, ColumnConfig, defaultColumnConfig } from "./ColumnSettingsPopover";
import { CreativeBreakdownDialog } from "./CreativeBreakdownDialog";
import { CreativePreviewDialog } from "./CreativePreviewDialog";

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
  const [imageError, setImageError] = useState(false);

  const hasImage = creative.assetUrl && !imageError;

  return (
    <Card 
      className={`overflow-hidden hover:shadow-lg transition-shadow ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-primary/20' : ''}`}
      onClick={onClick}
    >
      {/* Thumbnail image area */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {hasImage ? (
          <img
            src={creative.assetUrl!}
            alt={creative.adName}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <div className="text-muted-foreground scale-150">
              {getAssetTypeIcon(assetType)}
            </div>
          </div>
        )}
        {/* Asset type badge overlay */}
        <div className="absolute bottom-2 left-2">
          <Badge className="bg-black/70 text-white border-0 text-xs px-2 py-1 hover:bg-black/70">
            {getAssetTypeLabel(assetType)}
          </Badge>
        </div>
        {showPlatform && (
          <Badge 
            variant={getPlatformBadgeVariant(creative.platform)} 
            className="absolute top-2 right-2 text-[10px]"
          >
            {getPlatformLabel(creative.platform)}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        {/* Creative name with tooltip */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm font-medium text-foreground truncate mb-2 cursor-default">
                {truncateName(creative.adName, 40)}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md">
              <p className="text-xs break-all">{creative.adName}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Performance metrics */}
        <div className="space-y-1 text-sm mb-3">
          {metrics.spend && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Spend</span>
              <span className="font-medium">{formatCurrency(creative.spend)}</span>
            </div>
          )}
          {metrics.ctr && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">CTR (all)</span>
              <span className="font-medium">{formatPercent(creative.ctr)}</span>
            </div>
          )}
        </div>

        {/* Metadata badges - styled like reference */}
        <div className="space-y-2 mb-3">
          {attributes.contentType && parsed.contentType && (
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {parsed.contentType}
              </Badge>
            </div>
          )}
          {attributes.angle && parsed.angle && (
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                {parsed.angle}
              </Badge>
            </div>
          )}
          {attributes.tactic && parsed.tactic && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                {parsed.tactic}
              </Badge>
            </div>
          )}
        </div>

        {/* Install metrics */}
        <div className="space-y-1 text-sm border-t pt-3">
          {metrics.installs && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">App installs</span>
              <span className="font-medium">{creative.installs > 0 ? formatNumber(creative.installs) : '-'}</span>
            </div>
          )}
          {metrics.cpi && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost per app install</span>
              <span className="font-medium">{creative.cpi > 0 ? formatCurrency(creative.cpi) : '-'}</span>
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
      <div className="aspect-[4/3] bg-muted">
        <Skeleton className="w-full h-full" />
      </div>
      <CardContent className="p-4">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <div className="space-y-1 mb-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="space-y-2 mb-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="border-t pt-3 space-y-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
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
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleCreativeClick = (creative: EnrichedCreative) => {
    setSelectedCreative(creative);
    setPreviewOpen(true);
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
              isClickable={true}
            />
          ))}
        </div>
      ) : (
        <CreativePerformanceTable 
          data={data} 
          showPlatform={showPlatformBadge} 
          columnConfig={columnConfig}
          onRowClick={handleCreativeClick}
        />
      )}

      <CreativePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        creative={selectedCreative}
        platformBreakdown={platformBreakdown}
        isBlended={activePlatform === "blended"}
      />
    </div>
  );
}
