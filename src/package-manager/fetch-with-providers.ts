import { PackageProvider, Toypack } from "../types";
import { _cache } from "./fetch-package";
import { getFetchUrlFromProvider, getPackageInfoFromUrl } from "./utils";

const badProvidersUrlMap: Record<string, string[]> = {};
interface FetchResult {
   response: Response;
   url: string;
   provider: PackageProvider;
}

/**
 * Fetch a url. If it fails, use other providers.
 */
export async function fetchWithProviders(
   providers: PackageProvider[],
   url: string,
   name: string,
   version: string
): Promise<FetchResult | null> {
   let currentProviderIndex = 0;
   let provider = providers[currentProviderIndex];

   const recurse: () => Promise<FetchResult | null> = async () => {
      const cached = _cache.get(url);
      const response = cached ? cached.response : await fetch(url);

      // Use backup providers if the current provider can't fetch the url
      const isBadUrl = badProvidersUrlMap[provider.host]?.includes(url);
      if (
         !response.ok ||
         isBadUrl ||
         (await provider.isBadResponse?.(response, { name, version }))
      ) {
         // Put in bad urls
         if (!isBadUrl) {
            badProvidersUrlMap[provider.host] ??= [];
            badProvidersUrlMap[provider.host].push(url);
         }

         // Get next available provider
         let backupProvider =
            providers[++currentProviderIndex % providers.length];
         let isOutOfProviders = false;
         while (badProvidersUrlMap[backupProvider.host]?.includes(url)) {
            backupProvider =
               providers[++currentProviderIndex % providers.length];

            if (backupProvider == provider) {
               isOutOfProviders = true;
               break;
            }
         }

         if (
            backupProvider == provider ||
            isOutOfProviders ||
            !backupProvider
         ) {
            return null;
         }

         const pkgPath = getPackageInfoFromUrl(
            url,
            provider,
            ""
         ).fullPackageName;
         provider = backupProvider;
         url = getFetchUrlFromProvider(provider, pkgPath);
         return await recurse();
      } else {
         return { response, url, provider };
      }
   };

   return await recurse();
}
