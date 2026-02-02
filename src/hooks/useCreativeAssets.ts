import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CreativeAsset {
  creative_name: string;
  thumbnail_url: string | null;
  asset_type: string | null;
  platform: string;
}

export function useCreativeAssets(creativeNames: string[]) {
  return useQuery({
    queryKey: ['creative-assets', creativeNames.sort().join(',')],
    queryFn: async () => {
      if (creativeNames.length === 0) {
        return new Map<string, string>();
      }

      // Query creative_assets table for matching names
      const { data, error } = await supabase
        .from('creative_assets')
        .select('creative_name, thumbnail_url, asset_type, platform')
        .in('creative_name', creativeNames);

      if (error) {
        console.error('Error fetching creative assets:', error);
        return new Map<string, string>();
      }

      // Create a map of creative_name -> thumbnail_url
      const assetMap = new Map<string, string>();
      for (const asset of (data as CreativeAsset[]) || []) {
        if (asset.thumbnail_url) {
          assetMap.set(asset.creative_name, asset.thumbnail_url);
        }
      }

      return assetMap;
    },
    enabled: creativeNames.length > 0,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

// Hook to trigger asset sync for a specific platform
export function useSyncCreativeAssets() {
  const syncAssets = async (platforms?: string[], forceRefresh?: boolean) => {
    const { data, error } = await supabase.functions.invoke('fetch-creative-assets', {
      body: { platforms, forceRefresh },
    });

    if (error) {
      throw new Error(`Failed to sync creative assets: ${error.message}`);
    }

    return data;
  };

  return { syncAssets };
}
