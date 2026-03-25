 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
 import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
import { ImageIcon, Film, LayoutGrid, MessageSquare, Tag, Layers, BarChart3, Play, Download, Eye } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";
import { downloadAsset, getDownloadUrl, getDownloadFilename } from "@/lib/downloadAsset";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFetchHdMedia } from "@/hooks/useFetchHdMedia";
import { extractImageHash, extractVideoId } from "@/lib/creativeDataTransformers";
 
 interface CreativePreviewDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   creative: EnrichedCreative | null;
  platformBreakdown?: EnrichedCreative[];
  adsetBreakdown?: EnrichedCreative[];
   isBlended?: boolean;
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
     return <Film className="h-5 w-5" />;
   }
   if (type.includes("CAR")) {
     return <LayoutGrid className="h-5 w-5" />;
   }
   return <ImageIcon className="h-5 w-5" />;
 }
 
 function getAssetTypeLabel(assetType: string): string {
   const type = assetType.toUpperCase();
   if (type.includes("VID")) return "Video";
   if (type.includes("CAR")) return "Carousel";
   return "Image";
 }
 
function getPlatformLabel(platform: string): string {
  switch (platform) {
    case "meta": return "Meta";
    case "moloco": return "Moloco";
    case "snapchat": return "Snapchat";
    case "tiktok": return "TikTok";
    case "google": return "Google Ads";
    default: return platform;
  }
}

function getPlatformColor(platform: string): string {
  switch (platform) {
    case "meta": return "bg-blue-100 text-blue-800 border-blue-200";
    case "moloco": return "bg-purple-100 text-purple-800 border-purple-200";
    case "snapchat": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "tiktok": return "bg-pink-100 text-pink-800 border-pink-200";
    case "google": return "bg-red-100 text-red-800 border-red-200";
    default: return "";
  }
}

// Video player component with play button overlay
function VideoPlayer({ videoUrl, posterUrl }: { videoUrl: string; posterUrl: string | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setIsLoading(true);
    setIsPlaying(true);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
    videoRef.current?.play();
  };

  if (hasError) {
    // Fall back to poster image if video fails
    return posterUrl ? (
      <img src={posterUrl} alt="Video poster" className="w-full h-full object-contain" />
    ) : (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
        <Film className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  }

  if (!isPlaying) {
    return (
      <div 
        className="relative w-full h-full cursor-pointer group"
        onClick={handlePlay}
      >
        {posterUrl ? (
          <img src={posterUrl} alt="Video poster" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Film className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play className="h-8 w-8 text-foreground ml-1" fill="currentColor" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl || undefined}
        controls
        className="w-full h-full object-contain"
        onCanPlay={handleCanPlay}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </div>
  );
}

// Meta Ad Preview iframe component
function MetaAdPreview({ creativeId }: { creativeId: string }) {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('meta-ad-preview', {
          body: { creativeId },
        });

        if (cancelled) return;

        if (invokeError) throw new Error(invokeError.message);
        if (!data?.success) throw new Error(data?.error || 'Failed to load preview');

        setIframeSrc(data.data.iframeSrc);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load preview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [creativeId]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/50">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !iframeSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/50">
        <p className="text-sm text-muted-foreground">{error || 'No preview available'}</p>
      </div>
    );
  }

  return (
    <iframe
      src={iframeSrc}
      className="w-full h-full border-0"
      sandbox="allow-scripts allow-same-origin"
      title="Meta Ad Preview"
    />
  );
}

 export function CreativePreviewDialog({
   open,
   onOpenChange,
   creative,
  platformBreakdown = [],
   isBlended = false,
 }: CreativePreviewDialogProps) {
  const [showAdPreview, setShowAdPreview] = useState(false);
  const { hdUrl, mediaType: hdMediaType, loading: hdLoading, fetchHdMedia, reset: resetHd } = useFetchHdMedia();

  // Lazy-load HD media when dialog opens with a creative
  useEffect(() => {
    if (!open || !creative) {
      resetHd();
      return;
    }
    // Only fetch if we don't already have a good asset URL
    if (creative.fullAssetUrl || creative.originalUrl) return;
    
    // Try to extract image hash or video ID from ad_data for HD resolution
    const adData = (creative as any).adData;
    if (!adData?.creative) return;

    const imageHash = extractImageHash(adData.creative);
    const videoId = extractVideoId(adData.creative);

    if (imageHash) {
      fetchHdMedia({ mediaType: "image", imageHash });
    } else if (videoId) {
      fetchHdMedia({ mediaType: "video", videoId, adId: creative.adId });
    }
  }, [open, creative, fetchHdMedia, resetHd]);

  // Calculate totals for platform breakdown
  const { totals, ranges } = useMemo(() => {
    if (!platformBreakdown || platformBreakdown.length === 0) {
      return {
        totals: { spend: 0, installs: 0, avgCtr: 0 },
        ranges: {
          spend: { min: 0, max: 0 },
          installs: { min: 0, max: 0 },
          ctr: { min: 0, max: 0 },
          cpi: { min: 0, max: 0 },
        },
      };
    }

    const result = platformBreakdown.reduce(
      (acc, item) => ({
        spend: acc.spend + item.spend,
        installs: acc.installs + item.installs,
        ctrSum: acc.ctrSum + item.ctr,
        spendMin: Math.min(acc.spendMin, item.spend),
        spendMax: Math.max(acc.spendMax, item.spend),
        installsMin: Math.min(acc.installsMin, item.installs),
        installsMax: Math.max(acc.installsMax, item.installs),
        ctrMin: Math.min(acc.ctrMin, item.ctr),
        ctrMax: Math.max(acc.ctrMax, item.ctr),
        cpiMin: item.cpi > 0 ? Math.min(acc.cpiMin, item.cpi) : acc.cpiMin,
        cpiMax: Math.max(acc.cpiMax, item.cpi),
      }),
      { 
        spend: 0, installs: 0, ctrSum: 0, 
        spendMin: Infinity, spendMax: -Infinity,
        installsMin: Infinity, installsMax: -Infinity,
        ctrMin: Infinity, ctrMax: -Infinity,
        cpiMin: Infinity, cpiMax: -Infinity,
      }
    );

    const avgCtr = platformBreakdown.length > 0 ? result.ctrSum / platformBreakdown.length : 0;

    return {
      totals: {
        spend: result.spend,
        installs: result.installs,
        avgCtr,
      },
      ranges: {
        spend: { min: result.spendMin === Infinity ? 0 : result.spendMin, max: result.spendMax === -Infinity ? 0 : result.spendMax },
        installs: { min: result.installsMin === Infinity ? 0 : result.installsMin, max: result.installsMax === -Infinity ? 0 : result.installsMax },
        ctr: { min: result.ctrMin === Infinity ? 0 : result.ctrMin, max: result.ctrMax === -Infinity ? 0 : result.ctrMax },
        cpi: { min: result.cpiMin === Infinity ? 0 : result.cpiMin, max: result.cpiMax === -Infinity ? 0 : result.cpiMax },
      },
    };
  }, [platformBreakdown]);

  const getIntensity = (value: number, min: number, max: number): number => {
    if (max === min) return 0.5;
    return (value - min) / (max - min);
  };

  const getHeatmapStyle = (intensity: number, color: "blue" | "green" | "purple" | "amber"): React.CSSProperties => {
    if (intensity < 0.1) return {};
    const alpha = 0.15 + intensity * 0.45;
    
    const colors = {
      blue: `hsla(217, 91%, 60%, ${alpha})`,
      green: `hsla(142, 76%, 36%, ${alpha})`,
      purple: `hsla(262, 83%, 58%, ${alpha})`,
      amber: `hsla(38, 92%, 50%, ${alpha})`,
    };

    return { backgroundColor: colors[color] };
  };

   if (!creative) return null;
 
   const { parsed } = creative;
   const assetType = parsed.assetType || "IMG";
  // Detect video by checking if fullAssetUrl is an MP4 or if assetType indicates video
  const isVideo = 
    creative.assetType === 'video' || 
    assetType.toUpperCase().includes('VID') ||
    (creative.fullAssetUrl && creative.fullAssetUrl.includes('.mp4'));
   const hasAsset = !!creative.assetUrl || !!creative.fullAssetUrl;
   const showBreakdown = isBlended && platformBreakdown.length > 0;
   const isMetaCreative = creative.platform === 'meta' && !!creative.platformCreativeId;

  // For videos: use fullAssetUrl as the MP4, posterUrl for the poster
  // For images: prefer HD URL > originalUrl > fullAssetUrl > assetUrl
  const videoUrl = isVideo ? creative.fullAssetUrl : null;
  const posterImage = creative.posterUrl || creative.assetUrl || null;
  const displayUrl = isVideo ? posterImage : (hdUrl || creative.originalUrl || creative.fullAssetUrl || creative.assetUrl);
  const hasAssetOrHd = hasAsset || !!hdUrl;
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle className="text-base font-medium pr-8 break-words">
             {creative.adName}
           </DialogTitle>
         </DialogHeader>
 
          <div className="grid gap-6 md:grid-cols-2">
           {/* Preview area */}
           <div className="relative">
            {/* Ad Preview toggle for Meta creatives */}
            {isMetaCreative && (
              <div className="flex gap-1 mb-2">
                <Button
                  variant={!showAdPreview ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowAdPreview(false)}
                >
                  Asset
                </Button>
                <Button
                  variant={showAdPreview ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setShowAdPreview(true)}
                >
                  <Eye className="h-3 w-3" />
                  Ad Preview
                </Button>
              </div>
            )}

            {showAdPreview && isMetaCreative ? (
              <div className="rounded-lg overflow-hidden bg-muted" style={{ minHeight: 480 }}>
                <MetaAdPreview creativeId={creative.platformCreativeId!} />
              </div>
            ) : (
            <AspectRatio ratio={4 / 3} className="bg-muted rounded-lg overflow-hidden">
              {isVideo && videoUrl ? (
                <VideoPlayer videoUrl={videoUrl} posterUrl={posterImage} />
              ) : hasAsset ? (
                <img
                  src={displayUrl!}
                  alt={creative.adName}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                  <div className="text-muted-foreground scale-[3]">
                    {getAssetTypeIcon(assetType)}
                  </div>
                </div>
              )}
            </AspectRatio>
            )}
             <Badge className="absolute bottom-3 left-3 bg-black/70 text-white border-0 hover:bg-black/70">
               {getAssetTypeLabel(assetType)}
             </Badge>
             {getDownloadUrl(creative) && (
               <Button
                 variant="ghost"
                 size="icon"
                 className="absolute bottom-2 right-3 h-8 w-8 bg-black/60 text-white hover:bg-black/80 hover:text-white"
                 onClick={async () => {
                   try {
                     await downloadAsset(getDownloadUrl(creative)!, getDownloadFilename(creative));
                   } catch {
                     toast.error("Failed to download asset");
                   }
                 }}
                 title="Download asset"
               >
                 <Download className="h-4 w-4" />
               </Button>
             )}
           </div>
 
           {/* Metadata & Metrics */}
           <div className="space-y-6">
             {/* Performance Metrics */}
             <div>
               <h4 className="text-sm font-medium text-muted-foreground mb-3">Performance</h4>
               <div className="grid grid-cols-2 gap-3">
                 <div className="bg-muted/50 rounded-lg p-3">
                   <p className="text-xs text-muted-foreground">Spend</p>
                   <p className="text-lg font-semibold">{formatCurrency(creative.spend)}</p>
                 </div>
                 <div className="bg-muted/50 rounded-lg p-3">
                   <p className="text-xs text-muted-foreground">Installs</p>
                   <p className="text-lg font-semibold">
                     {creative.installs > 0 ? formatNumber(creative.installs) : '-'}
                   </p>
                 </div>
                 <div className="bg-muted/50 rounded-lg p-3">
                   <p className="text-xs text-muted-foreground">CTR (all)</p>
                   <p className="text-lg font-semibold">{formatPercent(creative.ctr)}</p>
                 </div>
                 <div className="bg-muted/50 rounded-lg p-3">
                   <p className="text-xs text-muted-foreground">CPI</p>
                   <p className="text-lg font-semibold">
                     {creative.cpi > 0 ? formatCurrency(creative.cpi) : '-'}
                   </p>
                 </div>
               </div>
             </div>
 
             {/* Creative Attributes */}
             <div>
               <h4 className="text-sm font-medium text-muted-foreground mb-3">Attributes</h4>
               <div className="space-y-2">
                 {parsed.contentType && (
                   <div className="flex items-center gap-2">
                     <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">Content Type:</span>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                       {parsed.contentType}
                     </Badge>
                   </div>
                 )}
                 {parsed.angle && (
                   <div className="flex items-center gap-2">
                     <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">Angle:</span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                       {parsed.angle}
                     </Badge>
                   </div>
                 )}
                 {parsed.tactic && (
                   <div className="flex items-center gap-2">
                     <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">Tactic:</span>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20">
                       {parsed.tactic}
                     </Badge>
                   </div>
                 )}
                 {parsed.category && (
                   <div className="flex items-center gap-2">
                     <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">Category:</span>
                    <Badge variant="outline" className="bg-violet-500/10 text-violet-700 border-violet-500/20">
                       {parsed.category}
                     </Badge>
                   </div>
                 )}
               </div>
             </div>
           </div>
         </div>

        {/* Platform Breakdown Section (inline for blended mode) */}
        {showBreakdown && (
          <>
            <Separator className="my-4" />
            <div>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <h4 className="text-sm font-medium">Platform Breakdown</h4>
              </div>
              
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Installs</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">CPI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {platformBreakdown.map((item) => (
                      <TableRow key={item.platform}>
                        <TableCell>
                          <Badge variant="outline" className={getPlatformColor(item.platform)}>
                            {getPlatformLabel(item.platform)}
                          </Badge>
                        </TableCell>
                        <TableCell 
                          className="text-right font-medium"
                          style={getHeatmapStyle(getIntensity(item.spend, ranges.spend.min, ranges.spend.max), "blue")}
                        >
                          {formatCurrency(item.spend)}
                        </TableCell>
                        <TableCell 
                          className="text-right"
                          style={getHeatmapStyle(getIntensity(item.installs, ranges.installs.min, ranges.installs.max), "green")}
                        >
                          {formatNumber(item.installs)}
                        </TableCell>
                        <TableCell 
                          className="text-right"
                          style={getHeatmapStyle(getIntensity(item.ctr, ranges.ctr.min, ranges.ctr.max), "purple")}
                        >
                          {formatPercent(item.ctr)}
                        </TableCell>
                        <TableCell 
                          className="text-right"
                          style={getHeatmapStyle(
                            item.cpi > 0 ? 1 - getIntensity(item.cpi, ranges.cpi.min, ranges.cpi.max) : 0,
                            "amber"
                          )}
                        >
                          {formatCurrency(item.cpi)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell>
                        <span className="font-semibold">Total</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(totals.spend)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatNumber(totals.installs)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatPercent(totals.avgCtr)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {totals.installs > 0 ? formatCurrency(totals.spend / totals.installs) : "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Platform distribution badges */}
              <div className="mt-4 flex gap-2 flex-wrap">
                {platformBreakdown.map((item) => {
                  const percentage = totals.spend > 0 ? (item.spend / totals.spend) * 100 : 0;
                  return (
                    <div 
                      key={item.platform}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Badge variant="outline" className={getPlatformColor(item.platform)}>
                        {getPlatformLabel(item.platform)}
                      </Badge>
                      <span className="text-muted-foreground">{percentage.toFixed(1)}% of spend</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
       </DialogContent>
     </Dialog>
   );
 }