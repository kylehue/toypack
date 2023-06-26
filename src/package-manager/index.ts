import type { Node } from "@babel/traverse";
import type { CssNode } from "css-tree";
import type { RawSourceMap } from "source-map-js";
import type { Toypack } from "../types";
import { DEBUG, ERRORS } from "../utils";
import { PackageAsset, fetchAssets } from "./fetch-assets.js";

/**
 * Fetch a package from the specified provider(s).
 * @param name The name of the package.
 * @param version The version of the package.
 * @returns An object containing the assets of the package.
 */
export async function fetchPackage(
   this: Toypack,
   name: string,
   version = "latest"
): Promise<Package> {
   const config = this.getConfig();
   const providers = config.packageManager.providers;
   const pkg: Package = {
      name,
      version,
      assets: {},
   };

   let currentProviderIndex = 0;
   let currentProvider: PackageProviderConfig | null =
      providers[currentProviderIndex] || null;
   if (!currentProvider) {
      this._trigger(
         "onError",
         ERRORS.any("[package-manager] Error: No providers were found.")
      );

      return pkg;
   }

   pkg.assets = await fetchAssets.call(
      this,
      currentProvider,
      name,
      version,
      () => {
         currentProvider = providers[currentProviderIndex++] || null;
         return currentProvider;
      }
   );

   const assetCount = Object.values(pkg.assets).length;
   if (!assetCount) {
      this._trigger(
         "onError",
         ERRORS.any(
            `[package-manager] Error: Failed to fetch ${name}@${version}.`
         )
      );
   } else {
      DEBUG.info(
         config.logLevel,
         `[package-manager]: Successfully fetched ${assetCount} assets in ${name}@${version}.`
      );
   }

   return pkg;
}

/**
 * For testing.
 */
export async function test(this: Toypack, name?: string, version = "latest") {
   const testCases: { name: string; version: string }[] = [
      { name: "bootstrap/dist/css/bootstrap.min.css", version: "5.1.2" },
      { name: "vue", version: "3.1.2" },
      { name: "@kylehue/drawer", version: "latest" },
      { name: "react", version: "17.0.2" },
      { name: "@types/babel__core", version: "latest" },
   ];

   if (name) {
      testCases.unshift({ name, version });
   }

   const config = this.getConfig();
   config.packageManager.dts = true;
   for (const testCase of testCases) {
      config.packageManager.providers[0] = {
         host: "https://esm.sh/",
         dtsHeader: "X-Typescript-Types",
      };
      const esmsh = await fetchPackage.call(
         this,
         testCase.name,
         testCase.version
      );
      console.info("esm.sh:", testCase.name, esmsh.assets);
      config.packageManager.providers[0] = {
         host: "https://cdn.skypack.dev/",
         dtsHeader: "X-Typescript-Types",
         queryParams: {
            dts: true,
         },
      };
      const skypack = await fetchPackage.call(
         this,
         testCase.name,
         testCase.version
      );
      console.info("skypack:", testCase.name, skypack.assets);

      // jsdelvr doesn't support @types/*
      if (testCase.name != "@types/babel__core") {
         config.packageManager.providers[0] = {
            host: "https://cdn.jsdelivr.net/",
            postpath: "+esm",
            prepath: "npm",
         };
         const jsdelvr = await fetchPackage.call(
            this,
            testCase.name,
            testCase.version
         );
         console.info("jsdelvr:", testCase.name, jsdelvr.assets);
      }
   }
}

export interface Package {
   name: string;
   version: string;
   assets: Record<string, PackageAsset>;
}

export interface PackageProviderConfig {
   /**
    * The host of the package provider.
    */
   host: string;
   /**
    * If provided, the package manager will use it to fetch
    * .d.ts files.
    */
   dtsHeader?: string;
   /**
    * Additional query parameters to be appended to the package
    * manager requests.
    */
   queryParams?: Record<string, string | true>;
   /**
    * Specifies an additional path segment to be appended to the
    * package manager requests.
    */
   postpath?: string;
   /**
    * Specifies an additional path segment to be prepended to the
    * package manager requests.
    */
   prepath?: string;
}

export interface PackageManagerConfig {
   /**
    * An array of package providers, where the first provider
    * in the array is considered the primary provider.
    * If the primary provider fails to fetch a package, the
    * package manager will fallback to the next provider.
    */
   providers: PackageProviderConfig[];
   /**
    * Whether to fetch dts files or not.
    * @default false
    */
   dts?: boolean;
}
