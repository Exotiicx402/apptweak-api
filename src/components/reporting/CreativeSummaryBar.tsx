import { useMemo } from "react";
import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";

interface CreativeSummaryBarProps {
  data: EnrichedCreative[];
}

export function CreativeSummaryBar({ data }: CreativeSummaryBarProps) {
  const stats = useMemo(() => {
    let spend = 0, ftds = 0, impressions = 0, clicks = 0;
    for (const c of data) {
      spend += c.spend;
      ftds += c.ftds;
      impressions += c.impressions;
      clicks += c.clicks;
    }
    return {
      spend,
      ftds,
      cftd: ftds > 0 ? spend / ftds : 0,
      ctr: impressions > 0 ? clicks / impressions : 0,
      count: data.length,
    };
  }, [data]);

  if (data.length === 0) return null;

  const items = [
    { label: "Spend", value: `$${stats.spend.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
    { label: "FTDs", value: stats.ftds.toLocaleString() },
    { label: "Avg CFTD", value: stats.cftd > 0 ? `$${stats.cftd.toFixed(0)}` : "-" },
    { label: "CTR", value: `${(stats.ctr * 100).toFixed(2)}%` },
    { label: "Creatives", value: stats.count.toString() },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm"
        >
          <span className="text-muted-foreground text-xs">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
