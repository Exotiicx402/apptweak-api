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

function DaysRunningBadge({ days }: { days: number | null }) {
  if (days === null) return null;

  const config =
    days >= 30
      ? { label: `${days}d`, dot: "bg-green-500", text: "text-green-400", bg: "bg-green-500/10 border-green-500/20", title: "Likely profitable" }
      : days >= 7
      ? { label: `${days}d`, dot: "bg-yellow-500", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", title: "Still testing" }
      : { label: `${days}d`, dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/40 border-border", title: "Too early to tell" };

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

export function CompetitorAdCard({ ad }: CompetitorAdCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:border-border/80 transition-colors group">
      {/* Creative Preview */}
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
        {/* Overlay link */}
        {ad.snapshotUrl && (
          <a
            href={ad.snapshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity"
          >
            <span className="text-white text-xs font-medium bg-black/60 px-3 py-1.5 rounded-lg">
              Open full preview ↗
            </span>
          </a>
        )}
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
  );
}
