import type { Toypack } from "../types";
import { DEBUG, ERRORS } from "../utils";
import { PackageAsset, fetchPackage } from "./fetch-package.js";

/**
 * Fetch a package from the specified provider(s).
 * @param name The name of the package.
 * @param version The version of the package.
 * @returns An object containing the assets of the package.
 */
export async function getPackage(this: Toypack, packageSource: string) {
   const result = {
      assets: [] as PackageAsset[],
      dtsAssets: [] as PackageAsset[],
   };

   const providers = this._getPackageProviders();
   const config = this.getConfig();
   if (!providers.length) {
      this._trigger(
         "onError",
         ERRORS.any("[package-manager] Error: No providers were found.")
      );

      return result;
   }

   try {
      const pkg = await fetchPackage(this, providers, packageSource);
      result.assets = Object.values(pkg.assets);
      result.dtsAssets = Object.values(pkg.dtsAssets);

      const assetCount = result.assets.length + result.dtsAssets.length;
      DEBUG.info(
         config.logLevel,
         `[package-manager]: Successfully fetched ${assetCount} assets in ${packageSource}.`
      );
   } catch (error: any) {
      this._trigger(
         "onError",
         ERRORS.packageInstallFailure(packageSource, error)
      );
   }

   return result;
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
   // for (const testCase of testCases) {
   //    (this as any)._packageProviders = [
   //       skypackProvider,
   //       esmshProvider,
   //       jsdelivrProvider,
   //    ];
   //    const esmsh = await getPackage.call(
   //       this,
   //       testCase.name,
   //       testCase.version
   //    );
   //    console.info("esm.sh:", testCase.name, esmsh.assets);
   //    (this as any)._packageProviders = [
   //       esmshProvider,
   //       skypackProvider,
   //       jsdelivrProvider,
   //    ];
   //    const skypack = await getPackage.call(
   //       this,
   //       testCase.name,
   //       testCase.version
   //    );
   //    console.info("skypack:", testCase.name, skypack.assets);
   //    // jsdelvr doesn't support @types/*
   //    if (testCase.name != "@types/babel__core") {
   //       (this as any)._packageProviders = [
   //          jsdelivrProvider,
   //          skypackProvider,
   //          esmshProvider,
   //       ];
   //       const jsdelvr = await getPackage.call(
   //          this,
   //          testCase.name,
   //          testCase.version
   //       );
   //       console.info("jsdelvr:", testCase.name, jsdelvr.assets);
   //    }
   // }
}

export interface PackageProvider {
   /**
    * The host of the package provider.
    */
   host: string;
   /**
    * If provided, the package manager will use it to fetch .d.ts files.
    */
   dtsHeader?: string;
   /**
    * Additional query parameters to be appended to the package requests.
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
    * Function to check whether the fetch response is ok or not.
    * Return true if not ok and false if ok.
    */
   isBadResponse?: (response: Response) => Promise<boolean> | boolean;
}

export interface PackageManagerConfig {
   /**
    * Whether to fetch dts files or not.
    * @default false
    */
   dts?: boolean;
   /**
    * An array of URLs used to remove duplicate packages. If a package's
    * URL is in that array, it won't use `fetch()` and will just simply
    * export everything from the package that has the same URL.
    */
   dedupe?: string[][];
}
