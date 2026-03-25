import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DailyRow } from "@/hooks/useReportingData";

interface DailyBreakdownTableProps {
  platform: string;
  logo?: string;
  daily: DailyRow[];
  loading?: boolean;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtInt = (v: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v.toFixed(2)}%`;

const fmtRoas = (v: number) => `${v.toFixed(2)}x`;

const columns = [
  { key: "date", label: "Date", align: "left" as const },
  { key: "spend", label: "Spend" },
  { key: "installs", label: "Installs" },
  { key: "cpi", label: "CPI" },
  { key: "registrations", label: "Registrations" },
  { key: "cps", label: "CPS" },
  { key: "ftds", label: "FTDs" },
  { key: "cftd", label: "CFTD" },
  { key: "ftdValue", label: "FTD Value" },
  { key: "ftdRoas", label: "FTD ROAS" },
  { key: "trades", label: "Trades" },
  { key: "cpaTrade", label: "CPA (Trade)" },
  { key: "tradeValue", label: "Trade Value" },
  { key: "tradeRoas", label: "Trade ROAS" },
  { key: "clicks", label: "Clicks" },
  { key: "cpc", label: "CPC" },
  { key: "ctr", label: "CTR" },
];

function computeRow(d: DailyRow) {
  return {
    date: d.date,
    spend: fmt(d.spend),
    installs: fmtInt(d.installs),
    cpi: d.installs > 0 ? fmt(d.spend / d.installs) : "–",
    registrations: fmtInt(d.registrations),
    cps: d.registrations > 0 ? fmt(d.spend / d.registrations) : "–",
    ftds: fmtInt(d.ftds),
    cftd: d.ftds > 0 ? fmt(d.spend / d.ftds) : "–",
    ftdValue: d.ftdValue > 0 ? fmt(d.ftdValue) : "–",
    ftdRoas: d.ftdValue > 0 && d.spend > 0 ? fmtRoas(d.ftdValue / d.spend) : "–",
    trades: fmtInt(d.trades),
    cpaTrade: d.trades > 0 ? fmt(d.spend / d.trades) : "–",
    tradeValue: d.tradeValue > 0 ? fmt(d.tradeValue) : "–",
    tradeRoas: d.tradeValue > 0 && d.spend > 0 ? fmtRoas(d.tradeValue / d.spend) : "–",
    clicks: fmtInt(d.clicks),
    cpc: d.clicks > 0 ? fmt(d.spend / d.clicks) : "–",
    ctr: d.impressions > 0 ? fmtPct((d.clicks / d.impressions) * 100) : "–",
  };
}

export function DailyBreakdownTable({ platform, logo, daily, loading }: DailyBreakdownTableProps) {
  if (loading) {
    return (
      <div className="mb-8">
        <h3 className="text-md font-medium mb-3 flex items-center gap-2 text-foreground">
          {logo && <img src={logo} alt={platform} className="h-5 w-auto object-contain" />}
          {platform} — Daily Breakdown
        </h3>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!daily.length) return null;

  const sorted = [...daily].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mb-8">
      <h3 className="text-md font-medium mb-3 flex items-center gap-2 text-foreground">
        {logo && <img src={logo} alt={platform} className="h-5 w-auto object-contain" />}
        {platform} — Daily Breakdown
      </h3>
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead
                  key={col.key}
                  className={`whitespace-nowrap text-xs px-3 py-2 ${col.align === "left" ? "text-left" : "text-right"}`}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(d => {
              const row = computeRow(d);
              return (
                <TableRow key={d.date}>
                  {columns.map(col => (
                    <TableCell
                      key={col.key}
                      className={`whitespace-nowrap text-xs px-3 py-2 ${col.align === "left" ? "text-left" : "text-right"}`}
                    >
                      {row[col.key as keyof typeof row]}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
