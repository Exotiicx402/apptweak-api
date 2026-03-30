import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
import { ParsedCreativeName } from "@/lib/creativeNamingParser";

const DIMENSIONS: { key: keyof ParsedCreativeName; label: string }[] = [
  { key: "angle", label: "Angle" },
  { key: "tactic", label: "Tactic" },
  { key: "hook", label: "Hook" },
  { key: "contentType", label: "Content Type" },
  { key: "category", label: "Category" },
];

type SortMetric = "spend" | "ftds" | "cftd" | "ctr";

interface AggregatedRow {
  value: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  ftds: number;
  creativeCount: number;
  cftd: number;
  ctr: number;
  cpi: number;
}

function formatCurrency(v: number) {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function formatPercent(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

interface AttributeLeaderboardProps {
  data: EnrichedCreative[];
  onAttributeClick?: (key: string, value: string) => void;
}

export function AttributeLeaderboard({ data, onAttributeClick }: AttributeLeaderboardProps) {
  const [sortMetric, setSortMetric] = useState<SortMetric>("spend");

  const aggregations = useMemo(() => {
    const result: Record<string, AggregatedRow[]> = {};

    for (const dim of DIMENSIONS) {
      const grouped = new Map<string, Omit<AggregatedRow, "value" | "cftd" | "ctr" | "cpi">>();

      for (const creative of data) {
        const val = creative.parsed[dim.key]?.trim();
        if (!val) continue;

        const existing = grouped.get(val) || {
          spend: 0, impressions: 0, clicks: 0, installs: 0, ftds: 0, creativeCount: 0,
        };
        existing.spend += creative.spend;
        existing.impressions += creative.impressions;
        existing.clicks += creative.clicks;
        existing.installs += creative.installs;
        existing.ftds += creative.ftds;
        existing.creativeCount += 1;
        grouped.set(val, existing);
      }

      result[dim.key] = Array.from(grouped.entries()).map(([value, agg]) => ({
        value,
        ...agg,
        cftd: agg.ftds > 0 ? agg.spend / agg.ftds : 0,
        ctr: agg.impressions > 0 ? agg.clicks / agg.impressions : 0,
        cpi: agg.installs > 0 ? agg.spend / agg.installs : 0,
      }));
    }

    return result;
  }, [data]);

  const sortRows = (rows: AggregatedRow[]): AggregatedRow[] => {
    return [...rows].sort((a, b) => {
      if (sortMetric === "cftd") {
        // Lower is better; push zeros to end
        if (a.cftd === 0 && b.cftd === 0) return b.spend - a.spend;
        if (a.cftd === 0) return 1;
        if (b.cftd === 0) return -1;
        return a.cftd - b.cftd;
      }
      return b[sortMetric] - a[sortMetric];
    });
  };

  // Only show dimensions that have data
  const visibleDimensions = DIMENSIONS.filter(
    (d) => (aggregations[d.key]?.length || 0) > 0
  );

  if (visibleDimensions.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Attribute Performance</h3>
          <Select value={sortMetric} onValueChange={(v) => setSortMetric(v as SortMetric)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spend">By Spend</SelectItem>
              <SelectItem value="ftds">By FTDs</SelectItem>
              <SelectItem value="cftd">By CFTD</SelectItem>
              <SelectItem value="ctr">By CTR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue={visibleDimensions[0]?.key}>
          <TabsList className="h-8 mb-3">
            {visibleDimensions.map((d) => (
              <TabsTrigger key={d.key} value={d.key} className="text-xs px-3 h-7">
                {d.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {visibleDimensions.map((dim) => {
            const rows = sortRows(aggregations[dim.key] || []);
            const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

            return (
              <TabsContent key={dim.key} value={dim.key} className="mt-0">
                <div className="space-y-0">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_80px_50px_70px_60px_40px] gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b">
                    <span>{dim.label}</span>
                    <span className="text-right">Spend</span>
                    <span className="text-right">FTDs</span>
                    <span className="text-right">CFTD</span>
                    <span className="text-right">CTR</span>
                    <span className="text-right">#</span>
                  </div>

                  {rows.map((row) => (
                    <div
                      key={row.value}
                      className="relative grid grid-cols-[1fr_80px_50px_70px_60px_40px] gap-2 px-3 py-2 text-sm hover:bg-accent/50 cursor-pointer transition-colors rounded-sm"
                      onClick={() => onAttributeClick?.(dim.key, row.value)}
                    >
                      {/* Spend bar background */}
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/5 rounded-sm"
                        style={{ width: `${(row.spend / maxSpend) * 100}%` }}
                      />
                      <span className="relative font-medium truncate">{row.value}</span>
                      <span className="relative text-right tabular-nums">{formatCurrency(row.spend)}</span>
                      <span className="relative text-right tabular-nums">{row.ftds || "-"}</span>
                      <span className="relative text-right tabular-nums">{row.cftd > 0 ? formatCurrency(row.cftd) : "-"}</span>
                      <span className="relative text-right tabular-nums">{formatPercent(row.ctr)}</span>
                      <span className="relative text-right tabular-nums text-muted-foreground">{row.creativeCount}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
