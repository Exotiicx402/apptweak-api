 import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
 
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
   if (!creative) return null;
 
   // Calculate totals
   const totals = platformBreakdown.reduce(
     (acc, item) => ({
       spend: acc.spend + item.spend,
       installs: acc.installs + item.installs,
     }),
     { spend: 0, installs: 0 }
   );
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-2xl">
         <DialogHeader>
           <DialogTitle className="text-lg font-semibold">Platform Breakdown</DialogTitle>
           <p className="text-sm text-muted-foreground mt-1 truncate">{creative.adName}</p>
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
                         <TableCell className="text-right font-medium">
                           {formatCurrency(item.spend)}
                         </TableCell>
                         <TableCell className="text-right">
                           {formatNumber(item.installs)}
                         </TableCell>
                         <TableCell className="text-right">
                           {formatPercent(item.ctr)}
                         </TableCell>
                         <TableCell className="text-right">
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
                       <TableCell className="text-right text-muted-foreground">—</TableCell>
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