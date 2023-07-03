const npmRegistryUrl = "https://registry.npmjs.org/";

export async function fetchLatestVersion(packageName: string) {
   let latestVersion: string | null = null;
   const url = `${npmRegistryUrl}${packageName}`;
   let fetchResponse = await fetch(url);
   let json = await fetchResponse.json();
   if (!json) return latestVersion;
   latestVersion = json["dist-tags"].latest || null;
   return latestVersion;
}