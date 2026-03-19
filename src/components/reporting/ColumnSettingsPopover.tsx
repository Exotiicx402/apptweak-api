 import { useState } from "react";
 import { Button } from "@/components/ui/button";
 import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 import { Checkbox } from "@/components/ui/checkbox";
 import { Settings2, Plus } from "lucide-react";
 import { Separator } from "@/components/ui/separator";
 
 export interface ColumnConfig {
   metrics: {
     spend: boolean;
     installs: boolean;
     ctr: boolean;
     cpi: boolean;
   };
   attributes: {
     product: boolean;
     assetType: boolean;
     conceptId: boolean;
     uniqueIdentifier: boolean;
     category: boolean;
     angle: boolean;
     tactic: boolean;
     hook: boolean;
     contentType: boolean;
     language: boolean;
     creativeOwner: boolean;
     objective: boolean;
     launchDate: boolean;
   };
 }
 
 export const defaultColumnConfig: ColumnConfig = {
   metrics: {
     spend: true,
     installs: true,
     ctr: true,
     cpi: true,
   },
   attributes: {
     product: false,
     assetType: true,
     conceptId: false,
     uniqueIdentifier: false,
     category: true,
     angle: true,
     tactic: true,
     hook: true,
     contentType: false,
     language: false,
     creativeOwner: false,
     objective: false,
     launchDate: false,
   },
 };
 
 const metricLabels: Record<keyof ColumnConfig["metrics"], string> = {
   spend: "Spend",
   installs: "Installs",
   ctr: "CTR",
   cpi: "CPI",
 };
 
 const attributeLabels: Record<keyof ColumnConfig["attributes"], string> = {
   product: "Product",
   assetType: "Asset Type",
   conceptId: "Concept ID",
   uniqueIdentifier: "Unique ID",
   category: "Category",
   angle: "Angle",
   tactic: "Tactic",
   hook: "Hook",
   contentType: "Content Type",
   language: "Language",
   creativeOwner: "Creative Owner",
   objective: "Objective",
   launchDate: "Launch Date",
 };
 
 interface ColumnSettingsPopoverProps {
   config: ColumnConfig;
   onChange: (config: ColumnConfig) => void;
 }
 
 export function ColumnSettingsPopover({ config, onChange }: ColumnSettingsPopoverProps) {
   const [open, setOpen] = useState(false);
 
   const toggleMetric = (key: keyof ColumnConfig["metrics"]) => {
     onChange({
       ...config,
       metrics: { ...config.metrics, [key]: !config.metrics[key] },
     });
   };
 
   const toggleAttribute = (key: keyof ColumnConfig["attributes"]) => {
     onChange({
       ...config,
       attributes: { ...config.attributes, [key]: !config.attributes[key] },
     });
   };
 
   const activeCount = 
     Object.values(config.metrics).filter(Boolean).length + 
     Object.values(config.attributes).filter(Boolean).length;
 
   return (
     <Popover open={open} onOpenChange={setOpen}>
       <PopoverTrigger asChild>
         <Button variant="outline" size="sm" className="gap-2">
           <Settings2 className="h-4 w-4" />
           <span>Table settings</span>
           <span className="text-muted-foreground text-xs">({activeCount})</span>
         </Button>
       </PopoverTrigger>
       <PopoverContent className="w-72 p-4 max-h-[420px] overflow-y-auto" align="start">
         <div className="space-y-4">
           <div>
             <div className="flex items-center gap-2 mb-2">
               <Plus className="h-4 w-4 text-muted-foreground" />
               <span className="text-sm font-medium">Metrics</span>
             </div>
             <div className="space-y-2 ml-6">
               {(Object.keys(metricLabels) as Array<keyof ColumnConfig["metrics"]>).map((key) => (
                 <label key={key} className="flex items-center gap-2 cursor-pointer">
                   <Checkbox
                     checked={config.metrics[key]}
                     onCheckedChange={() => toggleMetric(key)}
                   />
                   <span className="text-sm">{metricLabels[key]}</span>
                 </label>
               ))}
             </div>
           </div>
 
           <Separator />
 
           <div>
             <div className="flex items-center gap-2 mb-2">
               <Plus className="h-4 w-4 text-muted-foreground" />
               <span className="text-sm font-medium">Attributes</span>
             </div>
             <div className="space-y-2 ml-6">
               {(Object.keys(attributeLabels) as Array<keyof ColumnConfig["attributes"]>).map((key) => (
                 <label key={key} className="flex items-center gap-2 cursor-pointer">
                   <Checkbox
                     checked={config.attributes[key]}
                     onCheckedChange={() => toggleAttribute(key)}
                   />
                   <span className="text-sm">{attributeLabels[key]}</span>
                 </label>
               ))}
             </div>
           </div>
         </div>
       </PopoverContent>
     </Popover>
   );
 }
