import type { Node } from "@babel/traverse";
import type { CssNode } from "css-tree";
import type { RawSourceMap } from "source-map-js";
import type { SourceMapConfig, Toypack } from "../types";
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
   const providers = this._getPackageProviders();
   const pkg: Package = {
      name,
      version,
      assets: {},
   };

   if (!providers.length) {
      this._trigger(
         "onError",
         ERRORS.any("[package-manager] Error: No providers were found.")
      );

      return pkg;
   }

   pkg.assets = await fetchAssets.call(this, providers, name, version);

   const assetCount = Object.values(pkg.assets).length;
   DEBUG.info(
      config.logLevel,
      `[package-manager]: Successfully fetched ${assetCount} assets in ${name}@${version}.`
   );

   return pkg;
}

/**
 * For testing.
 */
export async function test(this: Toypack, name?: string, version = "latest") {
   const testCases: { name: string; version: string }[] = [
      { name: "vue/compiler-sfc", version: "3.2.13" },
      { name: "bootstrap/dist/css/bootstrap.min.css", version: "5.1.2" },
      { name: "vue", version: "3.2.13" },
      { name: "@kylehue/drawer", version: "latest" },
      { name: "react", version: "17.0.2" },
      { name: "@types/babel__core", version: "latest" },
   ];

   const providers = this._getPackageProviders();
   const skypackProvider = providers.find((p) => p.host == "cdn.skypack.dev")!;
   const esmshProvider = providers.find((p) => p.host == "esm.sh")!;
   const jsdelivrProvider = providers.find(
      (p) => p.host == "cdn.jsdelivr.net"
   )!;
   console.log(skypackProvider, esmshProvider, jsdelivrProvider);
   for (const testCase of testCases) {
      (this as any)._packageProviders = [
         skypackProvider,
         esmshProvider,
         jsdelivrProvider,
      ];
      const esmsh = await fetchPackage.call(
         this,
         testCase.name,
         testCase.version
      );
      console.info("esm.sh:", testCase.name, esmsh.assets);
      (this as any)._packageProviders = [
         esmshProvider,
         skypackProvider,
         jsdelivrProvider,
      ];
      const skypack = await fetchPackage.call(
         this,
         testCase.name,
         testCase.version
      );
      console.info("skypack:", testCase.name, skypack.assets);
      // jsdelvr doesn't support @types/*
      if (testCase.name != "@types/babel__core") {
         (this as any)._packageProviders = [
            jsdelivrProvider,
            skypackProvider,
            esmshProvider,
         ];
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

export interface PackageProvider {
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
   /**
    * Function to change the path of fetched modules. Must return either
    * a string (path in absolute form) or an object containing the `path`
    * and the `importPath` (the path used to import the module).
    */
   handlePath?: (moduleInfo: {
      url: string;
      subpath: string;
      filename: string;
      name: string;
      version: string;
      provider: PackageProvider;
   }) => string | { path: string; importPath: string } | void;
   /**
    * Function to check whether the fetch response is ok or not. Return true
    * if not ok and false if ok.
    */
   isBadResponse?: (
      response: Response,
      packageInfo: {
         name: string;
         version: string;
      }
   ) => Promise<boolean> | boolean;
   /**
    * Function to extract the package info from a url. A package info contains
    * the following:
    * - `scope` - The scope of the package.
    * - `name` - The name of the package.
    * - `version` - The version of the package. Defaults to "latest".
    * - `filename` - The filename in the url.
    */
   handlePackageInfo?: (url: string) => {
      scope?: string;
      name: string;
      version?: string;
      filename?: string;
   } | void;
   /**
    * Function to extract the real version of a fetched entry module.
    * @returns
    */
   handleEntryVersion?: (entryInfo: {
      response: Response;
      rawContent: string;
      name: string;
      version: string;
   }) => string | void;
}

export interface PackageManagerConfig {
   /**
    * An array of package providers, where the first provider
    * in the array is considered the primary provider.
    * If the primary provider fails to fetch a package, the
    * package manager will fallback to the next provider.
    */
   /**
    * Whether to fetch dts files or not.
    * @default false
    */
   dts?: boolean;
   overrides?: {
      sourceMap?: boolean;
   };
}
