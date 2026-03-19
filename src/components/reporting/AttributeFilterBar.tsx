import { useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
import { ParsedCreativeName } from "@/lib/creativeNamingParser";

export type AttributeFilters = Record<string, string[]>;

const FILTER_ATTRIBUTES: { key: keyof ParsedCreativeName; label: string }[] = [
  { key: "angle", label: "Angle" },
  { key: "tactic", label: "Tactic" },
  { key: "hook", label: "Hook" },
  { key: "contentType", label: "Content Type" },
  { key: "category", label: "Category" },
  { key: "objective", label: "Objective" },
  { key: "product", label: "Product" },
  { key: "language", label: "Language" },
  { key: "creativeOwner", label: "Creative Owner" },
];

interface AttributeFilterBarProps {
  data: EnrichedCreative[];
  activeFilters: AttributeFilters;
  onFiltersChange: (filters: AttributeFilters) => void;
}

export function AttributeFilterBar({ data, activeFilters, onFiltersChange }: AttributeFilterBarProps) {
  // Extract unique values per attribute from current data
  const uniqueValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const { key } of FILTER_ATTRIBUTES) {
      const values = new Set<string>();
      for (const creative of data) {
        const val = creative.parsed[key];
        if (val && val.trim()) values.add(val.trim());
      }
      result[key] = Array.from(values).sort();
    }
    return result;
  }, [data]);

  const toggleValue = useCallback(
    (key: string, value: string) => {
      const current = activeFilters[key] || [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      onFiltersChange({ ...activeFilters, [key]: next });
    },
    [activeFilters, onFiltersChange],
  );

  const clearFilter = useCallback(
    (key: string) => {
      onFiltersChange({ ...activeFilters, [key]: [] });
    },
    [activeFilters, onFiltersChange],
  );

  const clearAll = useCallback(() => {
    onFiltersChange({});
  }, [onFiltersChange]);

  const hasAnyFilter = Object.values(activeFilters).some((v) => v.length > 0);

  // Only show attributes that have values in the dataset
  const visibleAttributes = FILTER_ATTRIBUTES.filter(
    ({ key }) => uniqueValues[key]?.length > 0,
  );

  if (visibleAttributes.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visibleAttributes.map(({ key, label }) => {
        const selected = activeFilters[key] || [];
        const options = uniqueValues[key] || [];
        const count = selected.length;

        return (
          <Popover key={key}>
            <PopoverTrigger asChild>
              <Button
                variant={count > 0 ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs gap-1"
              >
                {label}
                {count > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 min-w-[16px] px-1 text-[10px] rounded-full"
                  >
                    {count}
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                {count > 0 && (
                  <button
                    onClick={() => clearFilter(key)}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <ScrollArea className="h-auto max-h-[220px] overflow-y-auto">
                <div className="p-2 space-y-1">
                  {options.map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={selected.includes(value)}
                        onCheckedChange={() => toggleValue(key, value)}
                      />
                      <span className="truncate">{value}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        );
      })}

      {hasAnyFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-muted-foreground"
          onClick={clearAll}
        >
          <X className="h-3 w-3" />
          Clear all
        </Button>
      )}
    </div>
  );
}
