import { format, subDays } from "date-fns";
import type { DailyRow } from "@/hooks/useReportingData";
import type { EnrichedCreative } from "@/hooks/useMultiPlatformCreatives";
import { parseCreativeName } from "@/lib/creativeNamingParser";

// Generate dates for the last N days
const generateDates = (days: number) =>
  Array.from({ length: days }, (_, i) => format(subDays(new Date(), days - i), "yyyy-MM-dd"));

const last7 = generateDates(7);

// --- Rankings ---
export const demoRankings = [
  { value: 3, date: format(new Date(), "yyyy-MM-dd"), category: "6013", category_name: "Sports", chart_type: "free", fetch_depth: 200 },
  { value: 18, date: format(new Date(), "yyyy-MM-dd"), category: "36", category_name: "Overall", chart_type: "free", fetch_depth: 200 },
];

// --- Ranking History ---
export const demoRankingHistory = last7.map((date, i) => ({
  date,
  rank: [8, 6, 5, 4, 4, 3, 3][i],
  displayDate: format(new Date(`${date}T00:00:00`), "MMM d"),
}));

// --- Downloads History (AppTweak) ---
export const demoDownloadsHistory = last7.map((date, i) => ({
  date,
  downloads: [42100, 45300, 51200, 48900, 53400, 55800, 52100][i],
  displayDate: format(new Date(`${date}T00:00:00`), "MMM d"),
}));

// --- ASC Downloads ---
export const demoASCDownloads = last7.map((date, i) => ({
  date,
  downloads: [38200, 41500, 47800, 44600, 49200, 51300, 48000][i],
  displayDate: format(new Date(`${date}T00:00:00`), "MMM d"),
}));

// --- AppsFlyer Downloads ---
export const demoAppsFlyerDownloads = last7.map((date, i) => ({
  date,
  downloads: [35800, 39200, 44100, 42300, 46800, 48900, 45600][i],
  displayDate: format(new Date(`${date}T00:00:00`), "MMM d"),
}));

// --- Competitor Downloads ---
export const demoCompetitorApps = [
  { id: "6648798962", name: "Polymarket", color: "hsl(224, 100%, 59%)" },
  { id: "1514665962", name: "Underdog", color: "hsl(38, 92%, 50%)" },
  { id: "1375031369", name: "DraftKings", color: "hsl(142, 71%, 45%)" },
  { id: "1413721906", name: "FanDuel", color: "hsl(0, 0%, 15%)" },
  { id: "6446244878", name: "Kalshi", color: "hsl(280, 67%, 55%)" },
  { id: "1476207837", name: "PrizePicks", color: "hsl(350, 80%, 50%)" },
];

export const demoCompetitorData = last7.map((date, i) => ({
  displayDate: format(new Date(`${date}T00:00:00`), "MMM d"),
  Polymarket: [42100, 45300, 51200, 48900, 53400, 55800, 52100][i],
  Underdog: [18200, 17800, 19500, 18900, 20100, 19400, 18700][i],
  DraftKings: [31500, 33200, 35800, 34100, 36400, 37900, 35200][i],
  FanDuel: [28700, 30100, 32400, 31200, 33800, 35100, 32600][i],
  Kalshi: [8200, 9100, 10400, 9800, 11200, 12100, 10800][i],
  PrizePicks: [15400, 16200, 17800, 17100, 18500, 19200, 17900][i],
}));

// --- Top Charts ---
export const demoTopCharts = {
  date: format(new Date(), "yyyy-MM-dd"),
  apps: [
    { id: "1562184399", title: "ESPN: Live Sports & Scores", rank: 1, icon: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/12/34/56/12345678-0000-0000-0000-000000000001/AppIcon-0-1x_U007ephone-0-1-0-sRGB-85-220-0.png/100x100bb.jpg" },
    { id: "1056200694", title: "Yahoo Fantasy: Football & more", rank: 2, icon: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/12/34/56/12345678-0000-0000-0000-000000000002/AppIcon-0-1x_U007ephone-0-1-0-sRGB-85-220-0.png/100x100bb.jpg" },
    { id: "6648798962", title: "Polymarket - Pair it up.", rank: 3, icon: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a8/b2/d2/a8b2d29c-9278-62d8-348e-a04ac433ebde/AppIcon1-0-1x_U007ephone-0-1-0-sRGB-85-220-0.png/100x100bb.jpg" },
    { id: "1375031369", title: "DraftKings Sportsbook & Casino", rank: 4, icon: "" },
    { id: "1413721906", title: "FanDuel Sportsbook & Casino", rank: 5, icon: "" },
    { id: "1514665962", title: "Underdog Fantasy Sports", rank: 6, icon: "" },
    { id: "529479190", title: "CBS Sports App: Scores & News", rank: 7, icon: "" },
    { id: "1476207837", title: "PrizePicks - Daily Fantasy", rank: 8, icon: "" },
    { id: "6446244878", title: "Kalshi: Predict & Trade", rank: 9, icon: "" },
    { id: "432469498", title: "theScore: Sports News & Scores", rank: 10, icon: "" },
  ],
};

// --- Reporting Data ---
const reportingDays = generateDates(8);

const generateDailyRows = (
  baseSpend: number,
  baseInstalls: number,
  baseRegs: number,
  baseFtds: number,
): DailyRow[] =>
  reportingDays.map((date, i) => {
    const jitter = 0.85 + Math.sin(i * 1.7) * 0.15 + (i % 3) * 0.05;
    const spend = Math.round(baseSpend * jitter);
    const installs = Math.round(baseInstalls * jitter);
    const registrations = Math.round(baseRegs * jitter);
    const ftds = Math.round(baseFtds * jitter);
    const impressions = Math.round(installs * 42);
    const clicks = Math.round(installs * 3.2);
    return {
      date,
      spend,
      installs,
      impressions,
      clicks,
      registrations,
      ftds,
      ftdValue: Math.round(ftds * 85),
      trades: Math.round(ftds * 2.4),
      tradeValue: Math.round(ftds * 2.4 * 32),
    };
  });

export const demoMetaDaily = generateDailyRows(28000, 9500, 3200, 480);
export const demoMolocoDaily = generateDailyRows(12000, 4200, 1400, 190);

function sumDaily(rows: DailyRow[]) {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const installs = rows.reduce((s, r) => s + r.installs, 0);
  const registrations = rows.reduce((s, r) => s + r.registrations, 0);
  const ftds = rows.reduce((s, r) => s + r.ftds, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  return { spend, installs, registrations, ftds, clicks, impressions, cpi: installs > 0 ? spend / installs : 0 };
}

const metaTotals = sumDaily(demoMetaDaily);
const molocoTotals = sumDaily(demoMolocoDaily);

export const demoReportingData = {
  meta: {
    ...metaTotals,
    previousSpend: metaTotals.spend * 1.08,
    previousInstalls: metaTotals.installs * 1.05,
    previousCpi: metaTotals.cpi * 1.03,
    previousRegistrations: metaTotals.registrations * 1.04,
    previousFtds: metaTotals.ftds * 0.92,
    previousClicks: metaTotals.clicks * 1.02,
    previousImpressions: metaTotals.impressions * 1.06,
    daily: demoMetaDaily,
    isLoading: false,
    error: null,
  },
  moloco: {
    ...molocoTotals,
    previousSpend: molocoTotals.spend * 0.95,
    previousInstalls: molocoTotals.installs * 0.98,
    previousCpi: molocoTotals.cpi * 0.97,
    previousRegistrations: molocoTotals.registrations * 1.02,
    previousFtds: molocoTotals.ftds * 1.06,
    previousClicks: molocoTotals.clicks * 0.99,
    previousImpressions: molocoTotals.impressions * 1.01,
    daily: demoMolocoDaily,
    isLoading: false,
    error: null,
  },
  totals: (() => {
    const spend = metaTotals.spend + molocoTotals.spend;
    const installs = metaTotals.installs + molocoTotals.installs;
    const registrations = metaTotals.registrations + molocoTotals.registrations;
    const ftds = metaTotals.ftds + molocoTotals.ftds;
    const prevSpend = metaTotals.spend * 1.08 + molocoTotals.spend * 0.95;
    const prevInstalls = metaTotals.installs * 1.05 + molocoTotals.installs * 0.98;
    const prevRegs = metaTotals.registrations * 1.04 + molocoTotals.registrations * 1.02;
    const prevFtds = metaTotals.ftds * 0.92 + molocoTotals.ftds * 1.06;
    return {
      spend,
      installs,
      cpi: installs > 0 ? spend / installs : 0,
      registrations,
      cps: registrations > 0 ? spend / registrations : 0,
      ftds,
      cftd: ftds > 0 ? spend / ftds : 0,
      previousSpend: prevSpend,
      previousInstalls: prevInstalls,
      previousCpi: prevInstalls > 0 ? prevSpend / prevInstalls : 0,
      previousRegistrations: prevRegs,
      previousCps: prevRegs > 0 ? prevSpend / prevRegs : 0,
      previousFtds: prevFtds,
      previousCftd: prevFtds > 0 ? prevSpend / prevFtds : 0,
    };
  })(),
};
