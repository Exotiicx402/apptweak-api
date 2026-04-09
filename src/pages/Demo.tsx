import { Link } from "react-router-dom";
import { BarChart3, Apple, Database, FileText, Eye, Coins, TrendingUp, Download, Trophy, ExternalLink } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AppSectionHeader } from "@/components/AppSectionHeader";
import { RankingCard } from "@/components/RankingCard";
import {
  demoRankings,
  demoRankingHistory,
  demoDownloadsHistory,
  demoASCDownloads,
  demoAppsFlyerDownloads,
  demoCompetitorApps,
  demoCompetitorData,
  demoTopCharts,
} from "@/lib/demoData";

const POLYMARKET_ICON = "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a8/b2/d2/a8b2d29c-9278-62d8-348e-a04ac433ebde/AppIcon1-0-1x_U007ephone-0-1-0-sRGB-85-220-0.png/100x100bb.jpg";
const POLYMARKET_APP_ID = "6648798962";

const chartTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
};

function DownloadsChart({ data, title, badge, badgeVariant, lineColor }: {
  data: { displayDate: string; downloads: number }[];
  title: string;
  badge: string;
  badgeVariant?: "outline" | "secondary";
  lineColor?: string;
}) {
  const total = data.reduce((s, d) => s + d.downloads, 0);
  const avg = Math.round(total / data.length);
  const stroke = lineColor || "hsl(var(--primary))";

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">{title}</h3>
            <Badge variant={badgeVariant || "outline"} className={badgeVariant === "secondary" ? "text-xs bg-blue-500/10 text-blue-500 border-blue-500/20" : "text-xs"}>{badge}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-muted-foreground">Total: <span className="font-medium text-foreground">{total.toLocaleString()}</span></div>
            <div className="text-muted-foreground">Avg: <span className="font-medium text-foreground">{avg.toLocaleString()}/day</span></div>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="displayDate" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} formatter={(value: number) => [value.toLocaleString(), "Downloads"]} />
              <Line type="monotone" dataKey="downloads" stroke={stroke} strokeWidth={2} dot={{ fill: stroke, strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: stroke }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function Demo() {
  const competitorTotals = demoCompetitorApps.map(app => {
    const total = demoCompetitorData.reduce((sum, point) => sum + (Number((point as any)[app.name]) || 0), 0);
    return { name: app.name, total, color: app.color };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(160 84% 40% / 0.1), transparent)" }} />
      <div className="relative max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="pulse-dot" />
            <span className="text-sm text-muted-foreground">Live data from AppTweak API</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/demo" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
              <Eye className="w-4 h-4" />Competitors
            </Link>
            <Link to="/demo" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
              <Coins className="w-4 h-4" />FTD
            </Link>
            <Link to="/demo/reporting" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors">
              <FileText className="w-4 h-4" />Reporting
            </Link>
          </div>
        </div>

        {/* App Header */}
        <AppSectionHeader appName="Polymarket" appId="6648798962" iconUrl={POLYMARKET_ICON} />

        {/* Ranking Cards */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {demoRankings.map((ranking, i) => (
            <RankingCard key={i} ranking={ranking} />
          ))}
        </div>

        {/* Ranking History */}
        <div className="mb-8">
          <div className="rounded-xl bg-card border border-border p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Polymarket - Ranking History (Sports - Free)</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={demoRankingHistory} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="displayDate" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                  <YAxis reversed stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} label={{ value: "Rank", angle: -90, position: "insideLeft", style: { fill: "hsl(var(--muted-foreground))" } }} />
                  <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} formatter={(value: number) => [`#${value}`, "Rank"]} />
                  <Line type="monotone" dataKey="rank" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: "hsl(var(--primary))" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">Lower rank number = higher position in charts</p>
          </div>
        </div>

        {/* AppTweak Downloads */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" />AppTweak Data</h3>
          <DownloadsChart data={demoDownloadsHistory} title="Polymarket - Downloads (Last 7 Days)" badge="AppTweak" />
        </div>

        {/* ASC Downloads */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Apple className="w-4 h-4" />App Store Connect (Official)</h3>
          <DownloadsChart data={demoASCDownloads} title="Polymarket - Downloads (Last 7 Days)" badge="App Store Connect" badgeVariant="secondary" lineColor="hsl(210 100% 50%)" />
        </div>

        {/* AppsFlyer Downloads */}
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Database className="w-4 h-4" />AppsFlyer SSOT</h3>
          <DownloadsChart data={demoAppsFlyerDownloads} title="Polymarket - Downloads (Last 7 Days)" badge="AppsFlyer" />
        </div>

        {/* Competitor Downloads */}
        <div className="mb-12">
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Competitor Downloads (Last 7 Days)</h3>
              </div>
            </div>
            <div className="px-4 py-3 border-b border-border flex flex-wrap gap-4">
              {competitorTotals.map(({ name, total, color }) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-muted-foreground">{name}:</span>
                  <span className="font-medium text-foreground">{total.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="p-4">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={demoCompetitorData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="displayDate" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} formatter={(value: number, name: string) => [value.toLocaleString(), name]} />
                    {demoCompetitorApps.map(app => (
                      <Line key={app.id} type="monotone" dataKey={app.name} stroke={app.color} strokeWidth={2} dot={{ fill: app.color, strokeWidth: 2, r: 3 }} activeDot={{ r: 5, fill: app.color }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Top Charts */}
        <div className="mb-8">
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Top Free Sports Apps (US)</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Updated: {new Date(demoTopCharts.date).toLocaleDateString()}</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>App</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoTopCharts.apps.map((app) => (
                    <TableRow key={app.id} className={app.id === POLYMARKET_APP_ID ? "bg-primary/10 border-l-2 border-l-primary" : ""}>
                      <TableCell className="font-medium">#{app.rank}</TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-3 ${app.id === POLYMARKET_APP_ID ? "font-semibold" : ""}`}>
                          {app.icon ? (
                            <img src={app.icon} alt={app.title} className="h-10 w-10 rounded-lg object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><span className="text-xs text-muted-foreground">?</span></div>
                          )}
                          <span className={app.id === POLYMARKET_APP_ID ? "text-primary" : "text-foreground"}>{app.title}</span>
                          {app.id === POLYMARKET_APP_ID && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">Polymarket</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">Data provided by AppTweak API • App ID: 6648798962</p>
        </div>
      </div>
    </div>
  );
}
