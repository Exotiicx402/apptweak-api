import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageIcon, Film, DollarSign, Download, MousePointer, Target } from "lucide-react";
import { useCreativeAssets } from "@/hooks/useCreativeAssets";

interface CreativeData {
  adId: string;
  adName: string;
  spend: number;
  installs: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpi: number;
}

interface CreativeCardGridProps {
  title: string;
  data: CreativeData[];
  loading?: boolean;
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

function getAssetType(adName: string): "image" | "video" {
  // Parse naming convention: Page | ContentType | AssetType | ...
  const parts = adName.split(" | ");
  if (parts.length >= 3) {
    const assetType = parts[2]?.toUpperCase() || "";
    if (assetType.includes("VID")) {
      return "video";
    }
  }
  return "image";
}

function truncateName(name: string, maxLength: number = 40): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength) + "...";
}

function CreativeCard({ 
  creative, 
  thumbnailUrl 
}: { 
  creative: CreativeData; 
  thumbnailUrl?: string;
}) {
  const assetType = getAssetType(creative.adName);
  
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        <AspectRatio ratio={16 / 9}>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={creative.adName}
              className="object-cover w-full h-full bg-muted"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              {assetType === "video" ? (
                <Film className="h-12 w-12 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
          )}
        </AspectRatio>
        <Badge 
          variant={assetType === "video" ? "destructive" : "secondary"}
          className="absolute top-2 right-2"
        >
          {assetType === "video" ? (
            <>
              <Film className="h-3 w-3 mr-1" />
              Video
            </>
          ) : (
            <>
              <ImageIcon className="h-3 w-3 mr-1" />
              Image
            </>
          )}
        </Badge>
      </div>
      <CardContent className="p-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm font-medium text-foreground truncate mb-3 cursor-default">
                {truncateName(creative.adName)}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm">
              <p className="text-xs">{creative.adName}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
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
      <AspectRatio ratio={16 / 9}>
        <Skeleton className="w-full h-full" />
      </AspectRatio>
      <CardContent className="p-4">
        <Skeleton className="h-4 w-3/4 mb-3" />
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

export function CreativeCardGrid({ title, data, loading = false }: CreativeCardGridProps) {
  // Get all creative names for thumbnail lookup
  const creativeNames = data.map((d) => d.adName);
  const { data: thumbnailMap, isLoading: thumbnailsLoading } = useCreativeAssets(creativeNames);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CreativeCardSkeleton key={i} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No creative data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((creative) => (
            <CreativeCard
              key={creative.adId}
              creative={creative}
              thumbnailUrl={thumbnailMap?.get(creative.adName)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
