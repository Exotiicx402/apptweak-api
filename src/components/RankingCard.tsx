import { TrendingUp, Trophy, Calendar } from "lucide-react";

interface RankingData {
  value: number;
  date: string;
  category: string;
  category_name: string;
  chart_type: string;
  fetch_depth: number;
}

interface RankingCardProps {
  ranking: RankingData;
}

export const RankingCard = ({ ranking }: RankingCardProps) => {
  const formattedDate = new Date(ranking.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="glow-card rounded-xl p-6 border border-border animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-muted-foreground">
            {ranking.category_name}
          </span>
        </div>
        <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full capitalize">
          {ranking.chart_type}
        </span>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="metric-value">#{ranking.value}</span>
          <TrendingUp className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Current ranking in {ranking.category_name}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="w-3 h-3" />
        <span>Last updated: {formattedDate}</span>
      </div>
    </div>
  );
};
