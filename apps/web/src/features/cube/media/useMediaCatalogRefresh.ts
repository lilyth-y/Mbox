import { useCallback, useState } from "react";
import { syncUserAssetsViaApi } from "../../../shared/api/userAssetsClient";
import { invalidateBackgroundAssetCatalog } from "../../../shared/lib/backgroundAssetCatalog";
import { invalidateUserBgmCatalog } from "../../../shared/lib/userBgmCatalog";

export function useMediaCatalogRefresh() {
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshCatalogs = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await syncUserAssetsViaApi();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("disabled in production")) {
        setRefreshError(message);
      }
    } finally {
      invalidateBackgroundAssetCatalog();
      invalidateUserBgmCatalog();
      setReloadToken((value) => value + 1);
      setRefreshing(false);
    }
  }, []);

  return { reloadToken, refreshing, refreshError, refreshCatalogs };
}
