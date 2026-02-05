 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { AspectRatio } from "@/components/ui/aspect-ratio";
 import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
 import { ImageIcon, Film, LayoutGrid, MessageSquare, Tag, Layers } from "lucide-react";
 
 interface CreativePreviewDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   creative: EnrichedCreative | null;
   onViewBreakdown?: () => void;
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
 
 export function CreativePreviewDialog({
   open,
   onOpenChange,
   creative,
   onViewBreakdown,
   isBlended = false,
 }: CreativePreviewDialogProps) {
   if (!creative) return null;
 
   const { parsed } = creative;
   const assetType = parsed.assetType || "IMG";
   const hasImage = !!creative.assetUrl;
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle className="text-base font-medium pr-8 break-words">
             {creative.adName}
           </DialogTitle>
         </DialogHeader>
 
         <div className="grid gap-6 md:grid-cols-2">
           {/* Image Preview */}
           <div className="relative">
             <AspectRatio ratio={4 / 3} className="bg-muted rounded-lg overflow-hidden">
               {hasImage ? (
                 <img
                   src={creative.assetUrl!}
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
             <Badge className="absolute bottom-3 left-3 bg-black/70 text-white border-0 hover:bg-black/70">
               {getAssetTypeLabel(assetType)}
             </Badge>
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
                     <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                       {parsed.contentType}
                     </Badge>
                   </div>
                 )}
                 {parsed.angle && (
                   <div className="flex items-center gap-2">
                     <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">Angle:</span>
                     <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                       {parsed.angle}
                     </Badge>
                   </div>
                 )}
                 {parsed.tactic && (
                   <div className="flex items-center gap-2">
                     <Tag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">Tactic:</span>
                     <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                       {parsed.tactic}
                     </Badge>
                   </div>
                 )}
                 {parsed.category && (
                   <div className="flex items-center gap-2">
                     <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="text-sm text-muted-foreground">Category:</span>
                     <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                       {parsed.category}
                     </Badge>
                   </div>
                 )}
               </div>
             </div>
 
             {/* View Breakdown Button (for blended mode) */}
             {isBlended && onViewBreakdown && (
               <Button onClick={onViewBreakdown} variant="outline" className="w-full">
                 <Layers className="h-4 w-4 mr-2" />
                 View Platform Breakdown
               </Button>
             )}
           </div>
         </div>
       </DialogContent>
     </Dialog>
   );
 }