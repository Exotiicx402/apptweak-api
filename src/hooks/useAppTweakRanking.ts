import { useQuery } from "@tanstack/react-query";

const APP_ID = "6648798962";
const API_KEY = "BuK3a1Gkzb6IhUw5Y2JDMPBjVy4";
const BASE_URL = "https://public-api.apptweak.com/api/public/store/apps/category-rankings/current.json";

interface RankingData {
  value: number;
  date: string;
  category: string;
  category_name: string;
  chart_type: string;
  fetch_depth: number;
}

interface AppTweakResponse {
  result: {
    [appId: string]: {
      ranking: RankingData[];
    };
  };
}

export const getCurlCommand = () => {
  return `curl --request GET \\
  --url '${BASE_URL}?apps=${APP_ID}&country=us&device=iphone' \\
  --header 'accept: application/json' \\
  --header 'x-apptweak-key: ${API_KEY}'`;
};

export const useAppTweakRanking = () => {
  return useQuery({
    queryKey: ["apptweak-ranking", APP_ID],
    queryFn: async (): Promise<RankingData[] | null> => {
      const url = new URL(BASE_URL);
      url.searchParams.set("apps", APP_ID);
      url.searchParams.set("country", "us");
      url.searchParams.set("device", "iphone");

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "accept": "application/json",
          "x-apptweak-key": API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data: AppTweakResponse = await response.json();
      return data.result?.[APP_ID]?.ranking || null;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: 2,
  });
};
