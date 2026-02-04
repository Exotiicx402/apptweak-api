import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Platform } from "@/hooks/useMultiPlatformCreatives";

import metaLogo from "@/assets/logos/meta.png";
import snapchatLogo from "@/assets/logos/snapchat.png";
import tiktokLogo from "@/assets/logos/tiktok.png";
import googleAdsLogo from "@/assets/logos/google-ads.png";

interface PlatformFilterBarProps {
  activePlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  counts: {
    meta: number;
    snapchat: number;
    tiktok: number;
    google: number;
  };
}

export function PlatformFilterBar({ activePlatform, onPlatformChange, counts }: PlatformFilterBarProps) {
  const totalCount = counts.meta + counts.snapchat + counts.tiktok + counts.google;

  return (
    <ToggleGroup
      type="single"
      value={activePlatform}
      onValueChange={(value) => value && onPlatformChange(value as Platform)}
      className="justify-start flex-wrap gap-1"
    >
      <ToggleGroupItem
        value="all"
        aria-label="All platforms"
        className="px-3 py-1.5 h-auto text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        All
        {totalCount > 0 && (
          <span className="text-[10px] opacity-70">({totalCount})</span>
        )}
      </ToggleGroupItem>

      <ToggleGroupItem
        value="blended"
        aria-label="Blended creatives"
        className="px-3 py-1.5 h-auto text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        Blended
      </ToggleGroupItem>

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
        value="snapchat"
        aria-label="Snapchat ads"
        className="px-3 py-1.5 h-auto text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        <img src={snapchatLogo} alt="Snapchat" className="h-4 w-4 object-contain" />
        Snapchat
        {counts.snapchat > 0 && (
          <span className="text-[10px] opacity-70">({counts.snapchat})</span>
        )}
      </ToggleGroupItem>

      <ToggleGroupItem
        value="tiktok"
        aria-label="TikTok ads"
        className="px-3 py-1.5 h-auto text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        <img src={tiktokLogo} alt="TikTok" className="h-4 w-4 object-contain" />
        TikTok
        {counts.tiktok > 0 && (
          <span className="text-[10px] opacity-70">({counts.tiktok})</span>
        )}
      </ToggleGroupItem>

      <ToggleGroupItem
        value="google"
        aria-label="Google ads"
        className="px-3 py-1.5 h-auto text-xs gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        <img src={googleAdsLogo} alt="Google Ads" className="h-4 w-4 object-contain" />
        Google
        {counts.google > 0 && (
          <span className="text-[10px] opacity-70">({counts.google})</span>
        )}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
