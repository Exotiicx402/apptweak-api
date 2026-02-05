 import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
import { useMemo } from "react";
 
 interface CreativeBreakdownDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   creative: EnrichedCreative | null;
   platformBreakdown: EnrichedCreative[];
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
 
 function getPlatformLabel(platform: string): string {
   switch (platform) {
     case "meta": return "Meta";
     case "snapchat": return "Snapchat";
     case "tiktok": return "TikTok";
     case "google": return "Google Ads";
     default: return platform;
   }
 }
 
 function getPlatformColor(platform: string): string {
   switch (platform) {
     case "meta": return "bg-blue-100 text-blue-800 border-blue-200";
     case "snapchat": return "bg-yellow-100 text-yellow-800 border-yellow-200";
     case "tiktok": return "bg-pink-100 text-pink-800 border-pink-200";
     case "google": return "bg-red-100 text-red-800 border-red-200";
     default: return "";
   }
 }
 
 export function CreativeBreakdownDialog({ 
   open, 
   onOpenChange, 
   creative, 
   platformBreakdown 
 }: CreativeBreakdownDialogProps) {
  // Calculate totals and averages - must be before any early return
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

  // Get intensity for color coding (0-1)
  const getIntensity = (value: number, min: number, max: number): number => {
    if (max === min) return 0.5;
    return (value - min) / (max - min);
  };

  // Generate background color style based on intensity
  const getHeatmapStyle = (intensity: number, color: "blue" | "green" | "purple" | "amber"): React.CSSProperties => {
    if (intensity < 0.1) return {};
    const alpha = 0.15 + intensity * 0.45;
    
    const colors = {
      blue: `hsla(217, 91%, 60%, ${alpha})`,    // Blue for spend
      green: `hsla(142, 76%, 36%, ${alpha})`,   // Green for installs
      purple: `hsla(262, 83%, 58%, ${alpha})`,  // Purple for CTR
      amber: `hsla(38, 92%, 50%, ${alpha})`,    // Amber for CPI (inverted - lower is better)
    };

    return { backgroundColor: colors[color] };
  };

  if (!creative) return null;
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw]">
         <DialogHeader>
           <DialogTitle className="text-lg font-semibold">Platform Breakdown</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 break-words">{creative.adName}</p>
         </DialogHeader>
 
         <div className="mt-4">
           {platformBreakdown.length === 0 ? (
             <p className="text-muted-foreground text-center py-4">No platform data available</p>
           ) : (
             <>
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
 
               {/* Platform distribution */}
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
             </>
           )}
         </div>
       </DialogContent>
     </Dialog>
   );
 }