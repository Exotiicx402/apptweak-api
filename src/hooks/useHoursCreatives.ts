import { useMemo } from "react";
import { parseCreativeName, ParsedCreativeName } from "@/lib/creativeNamingParser";

export type CampaignType = "install" | "waitlist" | "ftd";
type Objective = "App Install" | "First-Time Deposit" | "Waitlist Signup" | "Lead Signup" | "Landing Page View";

interface StaticAd {
  rank: number;
  adName: string;
  objective: Objective;
  costPerResult: number;
  results: number;
  totalSpend: number;
  cpm: number | null;
}

export interface HoursCreative {
  adId: string;
  adName: string;
  campaignName: string;
  campaignType: CampaignType;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  ctr: number;
  cpi: number;
  signUps: number;
  costPerSignUp: number;
  ftds: number;
  costPerFtd: number;
  parsed: ParsedCreativeName;
  assetUrl: string | null;
  assetType: string | null;
  fullAssetUrl: string | null;
  posterUrl: string | null;
  originalUrl: string | null;
  objective: string;
  costPerResult: number;
  results: number;
  cpm: number | null;
}

function objectiveToCampaignType(obj: Objective): CampaignType {
  switch (obj) {
    case "First-Time Deposit": return "ftd";
    case "Waitlist Signup":
    case "Lead Signup": return "waitlist";
    default: return "install";
  }
}

const TOP_50_ADS: StaticAd[] = [
  { rank: 1, adName: "Polymarket | TextGraphic | IMG | SOTU Boosted Post | Traffic | Website | 02/24", objective: "Landing Page View", costPerResult: 0.82, results: 29475, totalSpend: 24251, cpm: null },
  { rank: 2, adName: "Polymarket | SocialSnapshot | IMG | 32 | All-In-One | NewInTheUS | K1BillboardSnapchatBanner | Hype | Matthis | Install | IOS LP | 1/23", objective: "App Install", costPerResult: 13.16, results: 1071, totalSpend: 14093, cpm: 12.64 },
  { rank: 3, adName: "Polymarket | TextGraphic | IMG | 89 | Finance | Markets | Bitcoin2026Price | Hype | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 24.95, results: 813, totalSpend: 20284, cpm: 2.79 },
  { rank: 4, adName: "Polymarket | TextGraphic | IMG | 88 | Sports-Soccer | Markets | FifaWorldCupBetSlip | Hype | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 26.05, results: 1015, totalSpend: 26441, cpm: 2.20 },
  { rank: 5, adName: "Polymarket | Trend | IMG | 46 | Culture | OddsBoosts | GrammysSongoftheYear | Comparison | Matthis | Traffic | Market LP | 1/29", objective: "Lead Signup", costPerResult: 57.85, results: 131, totalSpend: 7578, cpm: 8.23 },
  { rank: 6, adName: "Polymarket | Trend | IMG | 48 | Culture | OddsBoosts | GrammysBestNewArtist | Comparison | Matthis | Traffic | Market LP | 1/29", objective: "Lead Signup", costPerResult: 63.80, results: 118, totalSpend: 7529, cpm: 7.99 },
  { rank: 7, adName: "Polymarket | Trend | IMG | 49 | Culture | OddsBoosts | GrammysAlbumoftheYear | Comparison | Matthis | Traffic | Market LP | 1/29", objective: "Lead Signup", costPerResult: 72.24, results: 107, totalSpend: 7729, cpm: 7.78 },
  { rank: 8, adName: "Polymarket | Trend | IMG | 50 | Culture | OddsBoosts | GrammysAlbumoftheYearV2 | Comparison | Matthis | Traffic | Market LP | 1/29", objective: "Lead Signup", costPerResult: 80.59, results: 100, totalSpend: 8059, cpm: 7.65 },
  { rank: 9, adName: "Polymarket | TextGraphic | IMG | 91 | Culture | Markets | OscarsBestActorV2 | Hype | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 37.25, results: 880, totalSpend: 32779, cpm: 2.59 },
  { rank: 10, adName: "Polymarket | TextGraphic | IMG | 90 | Culture | Markets | SpotifyArtistof2026 | Hype | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 33.90, results: 789, totalSpend: 26746, cpm: 2.70 },
  { rank: 11, adName: "Polymarket | TextGraphic | IMG | 86 | Sports-Soccer | Markets | FifaWorldCupSpain | Hype | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 33.18, results: 364, totalSpend: 12077, cpm: 2.42 },
  { rank: 12, adName: "Fees on trade($1,000)IMAGE _v1 (usasports_URL)", objective: "Waitlist Signup", costPerResult: 8.90, results: 1977, totalSpend: 17601, cpm: 164.16 },
  { rank: 13, adName: "Polymarket | TextGraphic | IMG | 33 | Sports-Football | FutureWinner | K2GuyGetPaidToBeRight | Aspirational | Matthis | Install | IOS LP | 1/23", objective: "App Install", costPerResult: 18.80, results: 31, totalSpend: 583, cpm: 13.57 },
  { rank: 14, adName: "Polymarket | TextGraphic | IMG | 34 | Sports-Football | FutureWinner | K2GuyKnowFootball | Aspirational | Matthis | Install | IOS LP | 1/23", objective: "App Install", costPerResult: 14.32, results: 12, totalSpend: 172, cpm: 9.23 },
  { rank: 15, adName: "Fees on trade($100)IMAGE _v2 (usasports_URL) - Copy", objective: "Waitlist Signup", costPerResult: 8.78, results: 1255, totalSpend: 11021, cpm: 153.42 },
  { rank: 16, adName: "HOURS | WAITLIST | IMAGE | FEE COMPARISON", objective: "App Install", costPerResult: 21.35, results: 44, totalSpend: 939, cpm: 21.48 },
  { rank: 17, adName: "Polymarket | Trend | IMG | 47 | Culture | OddsBoosts | GrammysRecordoftheYear | Comparison | Matthis | Traffic | Market LP | 1/29", objective: "Lead Signup", costPerResult: 106.04, results: 43, totalSpend: 4560, cpm: 9.05 },
  { rank: 18, adName: "Polymarket | TextGraphic | IMG | 14 | All-In-One | LowestFees | TOF_Fee Comparison Chart | Comparison | Matthis | DOWNLOAD | 12/2", objective: "App Install", costPerResult: 22.74, results: 290, totalSpend: 6595, cpm: 11.37 },
  { rank: 19, adName: "Fees on trade_IMAGE _11/09 (usasports_URL)", objective: "Waitlist Signup", costPerResult: 9.47, results: 2435, totalSpend: 23067, cpm: 151.66 },
  { rank: 20, adName: "Coming Soon_P (11/19) v2 - IMAGE (usa)", objective: "Waitlist Signup", costPerResult: 9.47, results: 1357, totalSpend: 12849, cpm: 56.40 },
  { rank: 21, adName: "Polymarket | TextGraphic | IMG | 13 | All-In-One | AllInOne | TOF_Sports Books Are Dead v2 | Comparison | Matthis | DOWNLOAD | 12/4", objective: "App Install", costPerResult: 26.82, results: 1235, totalSpend: 33126, cpm: 13.83 },
  { rank: 22, adName: "Polymarket | TextGraphic | IMG | 12 | All-In-One | AllInOne | TOF_Sports Books Are Dead v1 | Comparison | Matthis | DOWNLOAD | 12/4", objective: "App Install", costPerResult: 25.89, results: 276, totalSpend: 7145, cpm: 8.84 },
  { rank: 23, adName: "HOURS | WAITLIST | IMAGE | BE EARLY", objective: "App Install", costPerResult: 29.47, results: 1695, totalSpend: 49951, cpm: 21.52 },
  { rank: 24, adName: "Polymarket | TextGraphic | IMG | 87 | Product | FOMO | GetPaidtoBeRight | SocialProof | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 40.31, results: 181, totalSpend: 7297, cpm: 2.93 },
  { rank: 25, adName: "Coming Soon_P v4 (11/19) - IMAGE (usa)", objective: "Waitlist Signup", costPerResult: 8.27, results: 140, totalSpend: 1158, cpm: 32.83 },
  { rank: 26, adName: "Polymarket | Meme | IMG | 36 | All-In-One | AntiSportsbook | K3ComparativeMeme | Comparison | Matthis | Install | IOS LP | 1/23", objective: "App Install", costPerResult: 22.34, results: 7, totalSpend: 156, cpm: 7.84 },
  { rank: 27, adName: "Coming Soon_P v5 (11/19) - IMAGE (usa)", objective: "Waitlist Signup", costPerResult: 7.74, results: 105, totalSpend: 813, cpm: 35.33 },
  { rank: 28, adName: "Polymarket | SocialSnapshot | IMG | 32 | All-In-One | PaidToBeRight | K1BillboardSnapchatBanner | Hype | Matthis | Install | IOS LP | 1/23", objective: "App Install", costPerResult: 26.68, results: 23, totalSpend: 614, cpm: 6.75 },
  { rank: 29, adName: "Polymarket | TextGraphic | IMG | 82 | Product | Markets | MarketsforEverything | Educational | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 45.01, results: 167, totalSpend: 7516, cpm: 3.05 },
  { rank: 30, adName: "Polymarket | TextGraphic | IMG | 83 | Product | Markets | TradeonAnything | Educational | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 50.07, results: 615, totalSpend: 30790, cpm: 2.70 },
  { rank: 31, adName: "Polymarket | TextGraphic | IMG | 84 | Product | Markets | MarketsonEverythingBetSlip | Educational | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 48.88, results: 270, totalSpend: 13197, cpm: 2.99 },
  { rank: 32, adName: "Polymarket | TextGraphic | IMG | 85 | Culture | Markets | OscarsBestActor | Hype | Marc | Deposit | Website | 02/17", objective: "First-Time Deposit", costPerResult: 48.57, results: 167, totalSpend: 8111, cpm: 2.70 },
  { rank: 33, adName: "Fees on trade_IMAGE _11/06 (usasports_URL)", objective: "Waitlist Signup", costPerResult: 10.62, results: 1341, totalSpend: 14248, cpm: 161.87 },
  { rank: 34, adName: "Homecoming - IMAGE (usasports)", objective: "Waitlist Signup", costPerResult: 10.49, results: 442, totalSpend: 4638, cpm: 89.61 },
  { rank: 35, adName: "HOURS | WAITLIST | IMAGE | SPORTSBOOKS ARE DEAD V2", objective: "App Install", costPerResult: 58.80, results: 9, totalSpend: 529, cpm: 17.71 },
  { rank: 36, adName: "Loading v2 (11/17) - IMAGE (usasports) - Copy 6", objective: "Waitlist Signup", costPerResult: 9.11, results: 74, totalSpend: 674, cpm: 34.47 },
  { rank: 37, adName: "HOURS | WAITLIST | IMAGE | KNOW THE OUTCOME", objective: "App Install", costPerResult: 80.85, results: 11, totalSpend: 889, cpm: 17.23 },
  { rank: 38, adName: "before the crowd_P - Image (usa)", objective: "Waitlist Signup", costPerResult: 6.22, results: 18, totalSpend: 112, cpm: 47.47 },
  { rank: 39, adName: "HOURS | WAITLIST | IMAGE | JOIN WAITLIST", objective: "App Install", costPerResult: 92.05, results: 6, totalSpend: 552, cpm: 16.92 },
  { rank: 40, adName: "Is Coming Home.v2 - IMAGE - 10/03 (usasports_URL)", objective: "Waitlist Signup", costPerResult: 14.24, results: 3398, totalSpend: 48402, cpm: 60.90 },
  { rank: 41, adName: "Coming Soon (11/16) v2 - IMAGE (usasports) - Copy", objective: "Waitlist Signup", costPerResult: 10.72, results: 128, totalSpend: 1373, cpm: 58.62 },
  { rank: 42, adName: "Is Coming Home - IMAGE (usasports)", objective: "Waitlist Signup", costPerResult: 12.69, results: 604, totalSpend: 7666, cpm: 92.97 },
  { rank: 43, adName: "Loading v2_P (11/19) - IMAGE (usa)", objective: "Waitlist Signup", costPerResult: 11.59, results: 182, totalSpend: 2110, cpm: 30.35 },
  { rank: 44, adName: "before the call - Image (usasports_URL)", objective: "Waitlist Signup", costPerResult: 10.58, results: 51, totalSpend: 540, cpm: 47.05 },
  { rank: 45, adName: "before the call - Image (usasports_URL) - Copy", objective: "Waitlist Signup", costPerResult: 9.49, results: 25, totalSpend: 237, cpm: 59.30 },
  { rank: 46, adName: "before the buzzer - Image (usasports_URL) - Copy", objective: "Waitlist Signup", costPerResult: 12.45, results: 416, totalSpend: 5181, cpm: 119.09 },
  { rank: 47, adName: "Is Coming Home.v2 - IMAGE -10/03 (usasports_URL)", objective: "Waitlist Signup", costPerResult: 14.04, results: 422, totalSpend: 5926, cpm: 89.72 },
  { rank: 48, adName: "Loading (11/17) - IMAGE (usasports) - Copy 5", objective: "Waitlist Signup", costPerResult: 10.11, results: 11, totalSpend: 111, cpm: 44.89 },
  { rank: 49, adName: "Coming Soon_P v6 (11/19) - IMAGE (usa)", objective: "Waitlist Signup", costPerResult: 11.58, results: 65, totalSpend: 753, cpm: 26.97 },
  { rank: 50, adName: "Coming Soon_P v3 (11/19) - IMAGE (usa)", objective: "Waitlist Signup", costPerResult: 11.06, results: 40, totalSpend: 442, cpm: 29.03 },
];

export function useHoursCreatives() {
  const data: HoursCreative[] = useMemo(() => {
    return TOP_50_ADS.map((ad) => {
      const campaignType = objectiveToCampaignType(ad.objective);
      const parsed = parseCreativeName(ad.adName);

      return {
        adId: `static-${ad.rank}`,
        adName: ad.adName,
        campaignName: ad.objective,
        campaignType,
        spend: ad.totalSpend,
        impressions: 0,
        clicks: 0,
        installs: campaignType === "install" ? ad.results : 0,
        ctr: 0,
        cpi: campaignType === "install" ? ad.costPerResult : 0,
        signUps: campaignType === "waitlist" ? ad.results : 0,
        costPerSignUp: campaignType === "waitlist" ? ad.costPerResult : 0,
        ftds: campaignType === "ftd" ? ad.results : 0,
        costPerFtd: campaignType === "ftd" ? ad.costPerResult : 0,
        parsed,
        assetUrl: null,
        assetType: "image",
        fullAssetUrl: null,
        posterUrl: null,
        originalUrl: null,
        objective: ad.objective,
        costPerResult: ad.costPerResult,
        results: ad.results,
        cpm: ad.cpm,
      };
    });
  }, []);

  return { data, isLoading: false, error: null, fetchData: () => {} };
}
