import { PackageProvider } from "..";

export function getUrlFromProviderHost(provider: PackageProvider) {
   return "https://" + provider.host + "/";
}

export function removeProviderHostFromUrl(
   url: string,
   provider: PackageProvider
) {
   return url.replace(getUrlFromProviderHost(provider), "");
}
