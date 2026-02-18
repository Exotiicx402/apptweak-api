import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitorAdCard } from "./CompetitorAdCard";
import type { CompetitorAdGroup } from "@/hooks/useCompetitorAdLibrary";

interface CompetitorAdFeedProps {
  groups: CompetitorAdGroup[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRefresh: () => void;
}

function AdGroupSection({ group }: { group: CompetitorAdGroup }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground">{group.competitor.name}</span>
          <span className="text-xs text-muted-foreground">
            Page {group.competitor.facebook_page_id}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            {group.ads.length} active ads
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Ad grid */}
      {open && (
        <div className="p-4 bg-background">
          {group.ads.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No active ads found for this competitor.
              {!group.competitor.facebook_page_id && (
                <p className="mt-1 text-xs">Add a Facebook Page ID to start tracking.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.ads.map((ad) => (
                <CompetitorAdCard key={ad.id} ad={ad} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonGroup() {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-card flex items-center gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="p-4 bg-background grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border overflow-hidden">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex gap-1 pt-1">
                <Skeleton className="h-4 w-10 rounded" />
                <Skeleton className="h-4 w-8 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompetitorAdFeed({ groups, isLoading, isFetching, error, onRefresh }: CompetitorAdFeedProps) {
  if (groups.length === 0 && !isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
        <p className="text-sm">Add competitors above to start tracking their Meta ads.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Feed header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Active Ads
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          Failed to load ads: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <SkeletonGroup />
          <SkeletonGroup />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <AdGroupSection key={group.competitor.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
