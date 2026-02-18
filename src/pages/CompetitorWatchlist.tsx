import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, ToggleLeft, ToggleRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddCompetitorModal } from "@/components/competitors/AddCompetitorModal";
import { CompetitorAdFeed } from "@/components/competitors/CompetitorAdFeed";
import { useCompetitorWatchlist } from "@/hooks/useCompetitorWatchlist";
import { useCompetitorAdLibrary } from "@/hooks/useCompetitorAdLibrary";

export default function CompetitorWatchlist() {
  const [modalOpen, setModalOpen] = useState(false);
  const { competitors, isLoading: watchlistLoading, addCompetitor, isAdding, toggleActive, deleteCompetitor } = useCompetitorWatchlist();
  const { grouped, isLoading: adsLoading, isFetching, error, refetch } = useCompetitorAdLibrary(competitors);

  const adCountByPageId = new Map(grouped.map((g) => [g.competitor.facebook_page_id, g.ads.length]));

  return (
    <div className="min-h-screen bg-background">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(160 84% 40% / 0.08), transparent)" }}
      />

      <div className="relative max-w-5xl mx-auto px-6 py-12">
        {/* Back nav */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Competitor Watchlist</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track competitor ad activity on Meta Ad Library · Ads running 30+ days are likely profitable
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add Competitor
          </Button>
        </div>

        {/* Watchlist table */}
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Tracked Competitors
          </h2>

          {watchlistLoading ? (
            <div className="rounded-xl border border-border divide-y divide-border animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-card" />
              ))}
            </div>
          ) : competitors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
              No competitors tracked yet. Click "Add Competitor" to get started.
            </div>
          ) : (
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {competitors.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-4 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${!c.active ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {c.name}
                      </span>
                      {!c.active && (
                        <Badge variant="secondary" className="text-xs">Paused</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        Page ID: {c.facebook_page_id || <em>not set</em>}
                      </span>
                      {c.active && c.facebook_page_id && (
                        <span className="text-xs text-primary font-medium">
                          {adCountByPageId.get(c.facebook_page_id) ?? "–"} active ads
                        </span>
                      )}
                      {c.notes && (
                        <span className="text-xs text-muted-foreground truncate max-w-xs">
                          · {c.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive({ id: c.id, active: !c.active })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title={c.active ? "Pause tracking" : "Resume tracking"}
                    >
                      {c.active ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteCompetitor(c.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove competitor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ad feed */}
        <CompetitorAdFeed
          groups={grouped}
          isLoading={adsLoading}
          isFetching={isFetching}
          error={error as Error | null}
          onRefresh={refetch}
        />
      </div>

      <AddCompetitorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onAdd={addCompetitor}
        isAdding={isAdding}
      />
    </div>
  );
}
