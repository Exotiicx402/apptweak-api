import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import type { CompetitorAd } from "@/hooks/useCompetitorAdLibrary";

interface CompetitorAdCardProps {
  ad: CompetitorAd;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "FB",
  instagram: "IG",
  messenger: "MSG",
  audience_network: "AN",
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  instagram: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  messenger: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  audience_network: "bg-secondary text-secondary-foreground border-border",
};

function DaysRunningBadge({ days }: { days: number | null }) {
  if (days === null) return null;

  const config =
    days >= 30
      ? { label: `${days}d`, dot: "bg-green-500", text: "text-green-400", bg: "bg-green-500/10 border-green-500/20", title: "Likely profitable — running 30+ days" }
      : days >= 7
      ? { label: `${days}d`, dot: "bg-yellow-500", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", title: "Still testing — 7–29 days" }
      : { label: `${days}d`, dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40 border-border", title: "Too early to tell — under 7 days" };

  return (
    <span
      title={config.title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}

function AdPreviewDialog({ ad, open, onClose }: { ad: CompetitorAd; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate">{ad.pageName}</span>
            {ad.daysRunning !== null && <DaysRunningBadge days={ad.daysRunning} />}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {ad.snapshotUrl && (
              <a
                href={ad.snapshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Open in Meta Ad Library
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <DialogClose asChild>
              <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </DialogClose>
          </div>
        </div>

        {/* Preview iframe */}
        <div className="bg-muted" style={{ height: "500px" }}>
          {ad.snapshotUrl ? (
            <iframe
              src={ad.snapshotUrl}
              title="Ad creative preview"
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-popups"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              No preview available
            </div>
          )}
        </div>

        {/* Footer — ad copy + metadata */}
        <div className="px-5 py-4 border-t border-border bg-card space-y-3">
          {ad.body && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {ad.body}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {ad.platforms.map((p) => (
              <span
                key={p}
                className={`px-2 py-0.5 rounded text-xs font-medium border ${PLATFORM_COLORS[p] ?? "bg-secondary text-secondary-foreground border-border"}`}
              >
                {PLATFORM_LABELS[p] ?? p}
              </span>
            ))}
            {ad.impressionsRange && (
              <span className="px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground border border-border ml-auto">
                {ad.impressionsRange} impressions
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompetitorAdCard({ ad }: CompetitorAdCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition-colors group cursor-pointer"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(true); }}
      >
        {/* Thumbnail preview */}
        <div className="relative bg-muted aspect-[4/3] overflow-hidden">
          {ad.snapshotUrl ? (
            <iframe
              src={ad.snapshotUrl}
              title="Ad creative preview"
              className="w-full h-full border-0 scale-[0.85] origin-top-left pointer-events-none"
              style={{ width: "118%", height: "118%" }}
              sandbox="allow-same-origin allow-scripts"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              No preview
            </div>
          )}
          {/* Click-to-expand overlay */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity">
            <span className="text-white text-xs font-medium bg-black/60 px-3 py-1.5 rounded-lg">
              Click to expand
            </span>
          </div>
        </div>

        {/* Card body */}
        <div className="p-3 flex flex-col gap-2 flex-1">
          {ad.body && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {ad.body}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1 mt-auto pt-1">
            <DaysRunningBadge days={ad.daysRunning} />

            {ad.platforms.map((p) => (
              <span
                key={p}
                className="px-1.5 py-0.5 rounded text-xs bg-secondary text-secondary-foreground border border-border"
              >
                {PLATFORM_LABELS[p] ?? p}
              </span>
            ))}

            {ad.impressionsRange && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-secondary text-secondary-foreground border border-border ml-auto">
                {ad.impressionsRange}
              </span>
            )}
          </div>
        </div>
      </div>

      <AdPreviewDialog ad={ad} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
