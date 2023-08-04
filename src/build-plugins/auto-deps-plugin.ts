import { getFetchUrlFromProvider } from "../package-manager/utils.js";
import { fetchVersion } from "../package-manager/fetch-version.js";
import { Plugin, Toypack } from "../types.js";
import { parsePackageName, isLocal } from "../utils/index.js";

async function autoAddImportMap(bundler: Toypack, id: string) {
   if (bundler.config.bundle.importMap.imports[id]) return;
   const provider = bundler.getPackageProviders()[0];
   if (!provider) return;

   const { name, subpath, version: _version } = parsePackageName(id);
   const version = await fetchVersion(name, _version);
   const url = getFetchUrlFromProvider(provider, name, version, subpath);

   bundler.setConfig({
      bundle: {
         importMap: {
            imports: {
               [id]: url,
            },
         },
      },
   });
}

async function autoInstallPackage(bundler: Toypack, id: string) {
   const config = bundler.config;
   if (config.bundle.mode == "development") return;
   return await bundler.installPackage(id);
}

/**
 * Auto-add import maps and packages.
 */
export default function (): Plugin {
   return {
      name: "auto-deps-plugin",
      resolve: {
         async: true,
         async handler(id) {
            if (isLocal(id)) return;
            await autoAddImportMap(this.bundler, id);
            const pkg = await autoInstallPackage(this.bundler, id);
            if (pkg) {
               return pkg.assets.find(x => x.isEntry)?.source;
            }
         },
      },
   };
}
