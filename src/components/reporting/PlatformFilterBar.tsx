import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Platform } from "@/hooks/useMultiPlatformCreatives";

import metaLogo from "@/assets/logos/meta.png";
import molocoLogo from "@/assets/logos/moloco.webp";

interface PlatformFilterBarProps {
  activePlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  counts: {
    meta: number;
    moloco: number;
  };
}

export function PlatformFilterBar({ activePlatform, onPlatformChange, counts }: PlatformFilterBarProps) {
  return (
    <ToggleGroup
      type="single"
      value={activePlatform}
      onValueChange={(value) => value && onPlatformChange(value as Platform)}
      className="justify-start flex-wrap gap-1"
    >
      <ToggleGroupItem
        value="meta"
        aria-label="Meta ads"
        className="px-3 py-1.5 h-auto text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        <img src={metaLogo} alt="Meta" className="h-4 w-4 object-contain" />
        Meta
        {counts.meta > 0 && (
          <span className="text-[10px] opacity-70">({counts.meta})</span>
        )}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="moloco"
        aria-label="Moloco ads"
        className="px-3 py-1.5 h-auto text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        <img src={molocoLogo} alt="Moloco" className="h-4 w-4 object-contain" />
        Moloco
        {counts.moloco > 0 && (
          <span className="text-[10px] opacity-70">({counts.moloco})</span>
        )}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
