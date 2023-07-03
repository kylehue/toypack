import satisfies from "semver/functions/satisfies";

const npmRegistryUrl = "https://registry.npmjs.org/";

export async function fetchVersion(
   packageName: string,
   versionToSatisfy = "latest"
) {
   let result = versionToSatisfy;
   const url = `${npmRegistryUrl}${packageName}`;
   let fetchResponse = await fetch(url);
   let json = await fetchResponse.json();
   if (!json) return result;
   if (result == "latest") {
      result = json["dist-tags"].latest;
   } else {
      let satisfied = json["dist-tags"].latest;
      for (const version in json.versions) {
         if (satisfies(version, versionToSatisfy)) {
            satisfied = version;
         }
      }

      result = satisfied;
   }

   return result;
}
