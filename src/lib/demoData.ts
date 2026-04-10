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
export const demoSnapchatDaily = generateDailyRows(8500, 3100, 950, 120);
export const demoGoogleDaily = generateDailyRows(15000, 5800, 1900, 280);
export const demoTiktokDaily = generateDailyRows(10000, 3800, 1200, 160);

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
const snapchatTotals = sumDaily(demoSnapchatDaily);
const googleTotals = sumDaily(demoGoogleDaily);
const tiktokTotals = sumDaily(demoTiktokDaily);

function buildPlatform(totals: ReturnType<typeof sumDaily>, daily: DailyRow[], prevMultipliers: { spend: number; installs: number; cpi: number; registrations: number; ftds: number; clicks: number; impressions: number }) {
  return {
    ...totals,
    previousSpend: totals.spend * prevMultipliers.spend,
    previousInstalls: totals.installs * prevMultipliers.installs,
    previousCpi: totals.cpi * prevMultipliers.cpi,
    previousRegistrations: totals.registrations * prevMultipliers.registrations,
    previousFtds: totals.ftds * prevMultipliers.ftds,
    previousClicks: totals.clicks * prevMultipliers.clicks,
    previousImpressions: totals.impressions * prevMultipliers.impressions,
    daily,
    isLoading: false,
    error: null,
  };
}

export const demoReportingData = {
  meta: buildPlatform(metaTotals, demoMetaDaily, { spend: 1.08, installs: 1.05, cpi: 1.03, registrations: 1.04, ftds: 0.92, clicks: 1.02, impressions: 1.06 }),
  moloco: buildPlatform(molocoTotals, demoMolocoDaily, { spend: 0.95, installs: 0.98, cpi: 0.97, registrations: 1.02, ftds: 1.06, clicks: 0.99, impressions: 1.01 }),
  snapchat: buildPlatform(snapchatTotals, demoSnapchatDaily, { spend: 1.12, installs: 1.08, cpi: 1.04, registrations: 1.06, ftds: 0.88, clicks: 1.03, impressions: 1.09 }),
  google: buildPlatform(googleTotals, demoGoogleDaily, { spend: 0.92, installs: 0.96, cpi: 0.96, registrations: 0.98, ftds: 1.1, clicks: 0.97, impressions: 0.95 }),
  tiktok: buildPlatform(tiktokTotals, demoTiktokDaily, { spend: 1.15, installs: 1.1, cpi: 1.05, registrations: 1.07, ftds: 0.85, clicks: 1.04, impressions: 1.12 }),
  totals: (() => {
    const allPlatforms = [metaTotals, molocoTotals, snapchatTotals, googleTotals, tiktokTotals];
    const spend = allPlatforms.reduce((s, p) => s + p.spend, 0);
    const installs = allPlatforms.reduce((s, p) => s + p.installs, 0);
    const registrations = allPlatforms.reduce((s, p) => s + p.registrations, 0);
    const ftds = allPlatforms.reduce((s, p) => s + p.ftds, 0);
    const prevSpend = metaTotals.spend * 1.08 + molocoTotals.spend * 0.95 + snapchatTotals.spend * 1.12 + googleTotals.spend * 0.92 + tiktokTotals.spend * 1.15;
    const prevInstalls = metaTotals.installs * 1.05 + molocoTotals.installs * 0.98 + snapchatTotals.installs * 1.08 + googleTotals.installs * 0.96 + tiktokTotals.installs * 1.1;
    const prevRegs = metaTotals.registrations * 1.04 + molocoTotals.registrations * 1.02 + snapchatTotals.registrations * 1.06 + googleTotals.registrations * 0.98 + tiktokTotals.registrations * 1.07;
    const prevFtds = metaTotals.ftds * 0.92 + molocoTotals.ftds * 1.06 + snapchatTotals.ftds * 0.88 + googleTotals.ftds * 1.1 + tiktokTotals.ftds * 0.85;
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

// --- Demo Creatives ---
const demoCreativeNames = [
  "PM | Polymarket | VID | C001 | V1 | Sports | Prediction Markets | Social Proof | Win Big | UGC | EN | JSmith | Install | App Store | 2026-03-15",
  "PM | Polymarket | IMG | C002 | V1 | Politics | Real Money | FOMO | Breaking News | Static | EN | AJones | Install | App Store | 2026-03-18",
  "PM | Polymarket | VID | C003 | V2 | Sports | Prediction Markets | Authority | Expert Pick | UGC | EN | JSmith | Install | App Store | 2026-03-20",
  "PM | Polymarket | IMG | C004 | V1 | Crypto | Portfolio | Curiosity | What If | Graphic | EN | MWilson | Install | App Store | 2026-03-22",
  "PM | Polymarket | VID | C005 | V1 | Sports | Real Money | Testimonial | I Made $500 | UGC | EN | AJones | Install | App Store | 2026-03-25",
  "PM | Polymarket | IMG | C006 | V3 | Politics | Prediction Markets | Urgency | Last Chance | Static | EN | JSmith | Install | App Store | 2026-03-10",
  "PM | Polymarket | VID | C007 | V1 | Pop Culture | Social Proof | FOMO | Everyone Knows | UGC | EN | MWilson | Install | App Store | 2026-03-28",
  "PM | Polymarket | IMG | C008 | V2 | Sports | Real Money | Authority | Analyst Pick | Graphic | EN | AJones | Install | App Store | 2026-04-01",
  "PM | Polymarket | VID | C001 | V3 | Sports | Prediction Markets | Social Proof | Stack Up | UGC | EN | JSmith | Install | App Store | 2026-04-02",
  "PM | Polymarket | IMG | C009 | V1 | Finance | Portfolio | Curiosity | Smart Money | Static | EN | MWilson | Install | App Store | 2026-04-03",
  "PM | Polymarket | VID | C010 | V1 | Politics | Real Money | Testimonial | Called It | UGC | EN | AJones | Install | App Store | 2026-04-04",
  "PM | Polymarket | IMG | C011 | V1 | Sports | Prediction Markets | Urgency | Game Day | Graphic | EN | JSmith | Install | App Store | 2026-04-05",
  "PM | Polymarket | VID | C012 | V2 | Crypto | Social Proof | FOMO | Trending Now | UGC | EN | MWilson | Install | App Store | 2026-04-06",
  "PM | Polymarket | IMG | C013 | V1 | Pop Culture | Real Money | Authority | Insider Tip | Static | EN | AJones | Install | App Store | 2026-04-07",
  "PM | Polymarket | VID | C014 | V1 | Sports | Portfolio | Social Proof | My Portfolio | UGC | EN | JSmith | Install | App Store | 2026-04-08",
  "PM | Polymarket | IMG | C015 | V1 | Politics | Prediction Markets | Curiosity | Will They | Graphic | EN | MWilson | Install | App Store | 2026-03-12",
];

// Real thumbnails from hosted creative assets + stock placeholders
const demoThumbnails = [
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/86/Sports-Soccer.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/85/Culture.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/84/Product.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/91/Culture.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/82/Product.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/928484789802584.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/958045723560075.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/952145187151420.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/762349156678258.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/695667396902876.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/994567407077956.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/948525561339659.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/724260307319279.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/883834527982764.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/791848013479983.png",
  "https://agususzieosizftucxxq.supabase.co/storage/v1/object/public/creative-assets/meta/unknown/795356783608372.png",
];

export const demoCreatives: EnrichedCreative[] = demoCreativeNames.map((name, i) => {
  const parsed = parseCreativeName(name);
  const isVideo = parsed.assetType === "VID";
  const spend = [18500, 14200, 12800, 11500, 9800, 8900, 8200, 7600, 6900, 6200, 5800, 5100, 4700, 4200, 3800, 3200][i];
  const installs = Math.round(spend / (2.5 + Math.random()));
  const impressions = Math.round(installs * (38 + Math.random() * 10));
  const clicks = Math.round(impressions * (0.012 + Math.random() * 0.008));
  const ftds = Math.round(installs * (0.045 + Math.random() * 0.03));
  const regs = Math.round(installs * (0.32 + Math.random() * 0.1));
  const trades = Math.round(ftds * (2 + Math.random()));
  const ftdValue = Math.round(ftds * (75 + Math.random() * 40));
  const tradeValue = Math.round(trades * (28 + Math.random() * 15));

  return {
    adId: `demo_${i}`,
    adName: name,
    adsetId: `adset_${Math.floor(i / 3)}`,
    adsetName: `Adset ${Math.floor(i / 3) + 1}`,
    spend,
    impressions,
    clicks,
    installs,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpi: installs > 0 ? spend / installs : 0,
    registrations: regs,
    ftds,
    trades,
    ftdValue,
    tradeValue,
    cps: regs > 0 ? spend / regs : 0,
    cftd: ftds > 0 ? spend / ftds : 0,
    video3sViews: isVideo ? Math.round(impressions * 0.35) : 0,
    avgWatchTime: isVideo ? 4.2 + Math.random() * 3 : 0,
    thumbstopRate: isVideo ? 0.28 + Math.random() * 0.15 : 0,
    platform: i % 5 === 0 ? "moloco" : "meta",
    parsed,
    assetUrl: demoThumbnails[i] || null,
    assetType: isVideo ? "video" : "image",
    fullAssetUrl: demoThumbnails[i] || null,
    posterUrl: null,
  };
});
