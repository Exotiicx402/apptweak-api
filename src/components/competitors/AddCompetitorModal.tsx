import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCheck, Users, ChevronDown, ChevronUp, Search } from "lucide-react";
import { useFacebookPageSearch, FacebookPageResult } from "@/hooks/useFacebookPageSearch";
import { cn } from "@/lib/utils";

interface AddCompetitorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entry: { name: string; facebook_page_id: string; notes?: string }) => void;
  isAdding: boolean;
}

function formatFanCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function AddCompetitorModal({ open, onOpenChange, onAdd, isAdding }: AddCompetitorModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<FacebookPageResult | null>(null);
  const [notes, setNotes] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPageId, setManualPageId] = useState("");

  const { results, isSearching, error } = useFacebookPageSearch(showManual ? "" : searchQuery);

  const handleSelect = (page: FacebookPageResult) => {
    setSelected(page);
    setSearchQuery(page.name);
  };

  const handleDeselect = () => {
    setSelected(null);
    setSearchQuery("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showManual) {
      if (!manualName.trim() || !manualPageId.trim()) return;
      onAdd({ name: manualName.trim(), facebook_page_id: manualPageId.trim(), notes: notes.trim() || undefined });
    } else {
      if (!selected) return;
      onAdd({ name: selected.name, facebook_page_id: selected.id, notes: notes.trim() || undefined });
    }
    handleReset();
    onOpenChange(false);
  };

  const handleReset = () => {
    setSearchQuery("");
    setSelected(null);
    setNotes("");
    setShowManual(false);
    setManualName("");
    setManualPageId("");
  };

  const handleClose = (open: boolean) => {
    if (!open) handleReset();
    onOpenChange(open);
  };

  const showResults = !showManual && !selected && searchQuery.trim().length >= 2;
  const canSubmit = showManual
    ? manualName.trim() && manualPageId.trim()
    : !!selected;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Competitor</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!showManual ? (
            <>
              {/* Search input */}
              <div className="space-y-2">
                <Label htmlFor="search">Search for a competitor</Label>
                <div className="relative">
                  {selected ? (
                    <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/40">
                      {selected.pictureUrl && (
                        <img src={selected.pictureUrl} alt={selected.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{selected.name}</span>
                          {selected.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        </div>
                        {selected.category && <p className="text-xs text-muted-foreground">{selected.category}</p>}
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={handleDeselect}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="search"
                        className="pl-9"
                        placeholder="e.g. Kalshi, Robinhood, Polymarket..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoComplete="off"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Search results dropdown */}
              {showResults && (
                <div className="border border-border rounded-md overflow-hidden bg-background shadow-sm">
                  {isSearching ? (
                    <div className="p-2 space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-2">
                          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : error ? (
                    <div className="px-4 py-3 text-sm text-destructive">
                      Search failed. Try the manual entry option below.
                    </div>
                  ) : results.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground">
                      No pages found. Try a different name or use manual entry.
                    </div>
                  ) : (
                    <ul className="max-h-56 overflow-y-auto divide-y divide-border">
                      {results.map((page) => (
                        <li key={page.id}>
                          <button
                            type="button"
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                            onClick={() => handleSelect(page)}
                          >
                            {page.pictureUrl ? (
                              <img src={page.pictureUrl} alt={page.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm truncate">{page.name}</span>
                                {page.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {page.category && (
                                  <span className="text-xs text-muted-foreground truncate">{page.category}</span>
                                )}
                                {page.fanCount > 0 && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5 flex-shrink-0">
                                    <Users className="w-3 h-3" />
                                    {formatFanCount(page.fanCount)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Manual entry fallback */
            <div className="space-y-3 p-3 rounded-md border border-border bg-muted/20">
              <div className="space-y-1.5">
                <Label htmlFor="manualName">Competitor Name</Label>
                <Input id="manualName" placeholder="e.g. Kalshi" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manualPageId">Facebook Page ID</Label>
                <Input id="manualPageId" placeholder="e.g. 123456789" value={manualPageId} onChange={(e) => setManualPageId(e.target.value)} />
              </div>
            </div>
          )}

          {/* Notes */}
          {(selected || showManual) && (
            <div className="space-y-2">
              <Label htmlFor="notes">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="e.g. Direct prediction market competitor"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {/* Manual toggle */}
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setShowManual(!showManual); setSelected(null); setSearchQuery(""); }}
          >
            {showManual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showManual ? "Back to search" : "Enter Page ID manually"}
          </button>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isAdding || !canSubmit}>
              {isAdding ? "Adding..." : "Add Competitor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
