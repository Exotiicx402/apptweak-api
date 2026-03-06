import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, ImageIcon, Film, LayoutGrid, Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHoursCreatives, HoursCreative } from "@/hooks/useHoursCreatives";
import { CreativePreviewDialog } from "@/components/reporting/CreativePreviewDialog";
import { downloadAsset, getDownloadUrl, getDownloadFilename } from "@/lib/downloadAsset";
import { toast } from "sonner";

type AssetTypeFilter = "all" | "image" | "video";

function isVideo(creative: HoursCreative): boolean {
  // Primary: parse from ad name (more reliable than DB asset_type)
  const contentType = creative.parsed.contentType?.toUpperCase() || "";
  if (contentType) {
    return contentType.includes("VID") || contentType === "VIDEO";
  }
  // Fallback: DB asset_type
  if (creative.assetType) return creative.assetType.toLowerCase() === "video";
  return false;
}

function formatCurrency(value: number): string {
  return value >= 1000
    ? `$${(value / 1000).toFixed(1)}k`
    : `$${value.toFixed(2)}`;
}

export default function HoursCreatives() {
  const { data, isLoading, error, fetchData } = useHoursCreatives();
  const [assetFilter, setAssetFilter] = useState<AssetTypeFilter>("all");
  const [selectedCreative, setSelectedCreative] = useState<HoursCreative | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const handleDownload = async (creative: HoursCreative, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const url = getDownloadUrl(creative);
    if (!url) {
      toast.error("No asset available to download");
      return;
    }
    try {
      await downloadAsset(url, getDownloadFilename(creative));
    } catch {
      toast.error("Failed to download asset");
    }
  };

  const handleDownloadAll = async () => {
    const downloadable = filtered.filter((c) => getDownloadUrl(c));
    if (downloadable.length === 0) {
      toast.error("No downloadable assets");
      return;
    }
    setIsDownloadingAll(true);
    let count = 0;
    for (const creative of downloadable) {
      try {
        await downloadAsset(getDownloadUrl(creative)!, getDownloadFilename(creative));
        count++;
      } catch {
        // skip failures
      }
    }
    setIsDownloadingAll(false);
    toast.success(`Downloaded ${count} of ${downloadable.length} assets`);
  };

  useEffect(() => {
    fetchData("2025-10-01", new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  }, [fetchData]);

  const filtered = data.filter((c) => {
    if (assetFilter === "all") return true;
    return assetFilter === "video" ? isVideo(c) : !isVideo(c);
  });

  const videoCount = data.filter(isVideo).length;
  const imageCount = data.length - videoCount;

  const handleCreativeClick = (creative: HoursCreative) => {
    const url = creative.assetUrl || creative.fullAssetUrl || creative.originalUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast.error("No image URL available for this ad");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/reporting" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Hours Campaign Creatives</h1>
          </div>
          <Badge variant="secondary" className="ml-auto text-sm">
            Since Oct 1, 2025 · {data.length} ads
          </Badge>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">
            All ad creatives from Meta campaigns containing "hours" in the campaign name
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAll}
              disabled={isDownloadingAll || filtered.length === 0}
              className="gap-1.5"
            >
              {isDownloadingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download All ({filtered.filter((c) => getDownloadUrl(c)).length})
            </Button>
            <ToggleGroup
              type="single"
              value={assetFilter}
              onValueChange={(v) => v && setAssetFilter(v as AssetTypeFilter)}
              className="border rounded-md"
            >
              <ToggleGroupItem value="all" className="px-3 text-xs gap-1">
                <LayoutGrid className="h-3.5 w-3.5" />
                All ({data.length})
              </ToggleGroupItem>
              <ToggleGroupItem value="image" className="px-3 text-xs gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                Image ({imageCount})
              </ToggleGroupItem>
              <ToggleGroupItem value="video" className="px-3 text-xs gap-1">
                <Film className="h-3.5 w-3.5" />
                Video ({videoCount})
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 text-destructive p-4 text-sm">{error}</div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-lg" />
            ))}
          </div>
        )}

        {/* Grid */}
        {!isLoading && filtered.length > 0 && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((creative) => (
              <Card
                key={creative.adId}
                className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                onClick={() => handleCreativeClick(creative)}
              >
                <div className="relative aspect-[4/5] bg-muted">
                  {creative.assetUrl ? (
                    <img
                      src={creative.assetUrl}
                      alt={creative.parsed.uniqueIdentifier || creative.adName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No thumbnail
                    </div>
                  )}
                  {/* Asset type badge */}
                  <Badge
                    variant="secondary"
                    className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5"
                  >
                    {isVideo(creative) ? "Video" : "Image"}
                  </Badge>
                  {/* Download button */}
                  {getDownloadUrl(creative) && (
                    <button
                      onClick={(e) => handleDownload(creative, e)}
                      className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors"
                      title="Download asset"
                    >
                      <Download className="h-4 w-4" />
                     </button>
                  )}
                </div>
                <CardContent className="p-3 space-y-2">
                  {/* Parsed tags */}
                  <div className="flex flex-wrap gap-1">
                    {creative.parsed.angle && (
                      <Badge variant="outline" className="text-[10px]">{creative.parsed.angle}</Badge>
                    )}
                    {creative.parsed.category && (
                      <Badge variant="outline" className="text-[10px]">{creative.parsed.category}</Badge>
                    )}
                    {creative.parsed.contentType && (
                      <Badge variant="outline" className="text-[10px]">{creative.parsed.contentType}</Badge>
                    )}
                  </div>
                  {/* Unique identifier */}
                  <p className="text-xs font-medium text-foreground truncate">
                    {creative.parsed.uniqueIdentifier || creative.adName}
                  </p>
                  {/* Campaign name */}
                  <p className="text-[10px] text-muted-foreground truncate">
                    {creative.campaignName}
                  </p>
                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Spend</span>
                      <p className="font-semibold text-foreground">{formatCurrency(creative.spend)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Installs</span>
                      <p className="font-semibold text-foreground">{creative.installs.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">CTR</span>
                      <p className="font-semibold text-foreground">{(creative.ctr * 100).toFixed(2)}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">CPI</span>
                      <p className="font-semibold text-foreground">{formatCurrency(creative.cpi)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            No creatives found matching the filter.
          </div>
        )}
      </div>

      {/* Preview dialog - reuse existing component */}
      {selectedCreative && (
        <CreativePreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          creative={{
            adId: selectedCreative.adId,
            adName: selectedCreative.adName,
            spend: selectedCreative.spend,
            installs: selectedCreative.installs,
            ctr: selectedCreative.ctr,
            cpi: selectedCreative.cpi,
            platform: "meta",
            parsed: selectedCreative.parsed,
            assetUrl: selectedCreative.assetUrl,
            assetType: selectedCreative.assetType,
            fullAssetUrl: selectedCreative.fullAssetUrl,
            posterUrl: selectedCreative.posterUrl,
            originalUrl: selectedCreative.originalUrl,
          }}
        />
      )}
    </div>
  );
}
