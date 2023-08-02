import type { Toypack } from "../types";
import { ERRORS } from "../utils";
import { PackageAsset, fetchPackage } from "./fetch-package.js";

/**
 * Fetch a package from the specified provider(s).
 * @param name The name of the package.
 * @param version The version of the package.
 * @returns An object containing the assets of the package.
 */
export async function getPackage(
   this: Toypack,
   packagePath: string,
   packageVersion: string = "latest"
) {
   const result = {
      name: "",
      version: "",
      subpath: "",
      assets: [] as PackageAsset[],
      dtsAssets: [] as PackageAsset[],
   };

   const providers = this.getPackageProviders();
   if (!providers.length) {
      this._pushToDebugger(
         "error",
         ERRORS.any("[package-manager] Error: No providers were found.")
      );

      return result;
   }

   try {
      const pkg = await fetchPackage(
         this,
         providers,
         packagePath,
         packageVersion
      );
      result.name = pkg.name;
      result.version = pkg.version;
      result.subpath = pkg.subpath;
      result.assets = Object.values(pkg.assets);
      result.dtsAssets = Object.values(pkg.dtsAssets);

      const assetCount = result.assets.length + result.dtsAssets.length;
      this._pushToDebugger(
         "info",
         `[package-manager]: Successfully fetched ${assetCount} assets in ${packagePath}.`
      );
   } catch (error: any) {
      this._pushToDebugger(
         "error",
         ERRORS.packageInstallFailure(
            packagePath,
            error.message || error
         )
      );
   }

   return result;
}

/**
 * For testing.
 */
export async function getPackageTest(
   this: Toypack,
   name?: string,
   version = "latest"
) {
   const testCases: { name: string; version: string }[] = [
      { name: "vue/compiler-sfc", version: "3.2.13" },
      { name: "bootstrap/dist/css/bootstrap.min.css", version: "5.1.2" },
      { name: "vue", version: "3.2.13" },
      { name: "@kylehue/drawer", version: "latest" },
      { name: "react", version: "latest" },
      { name: "@types/babel__core", version: "latest" },
   ];

   const providers = this.getPackageProviders();
   const skypackProvider = providers.find((p) => p.host == "cdn.skypack.dev")!;
   const esmshProvider = providers.find((p) => p.host == "esm.sh")!;
   const jsdelivrProvider = providers.find(
      (p) => p.host == "cdn.jsdelivr.net"
   )!;
   console.log(skypackProvider, esmshProvider, jsdelivrProvider);
   for (const testCase of testCases) {
      (this as any)._packageProviders = [
         esmshProvider,
         skypackProvider,
         jsdelivrProvider,
      ];
      const esmsh = await getPackage.call(
         this,
         testCase.name,
         testCase.version
      );
      console.info("esm.sh:", testCase.name, esmsh);
      (this as any)._packageProviders = [
         skypackProvider,
         esmshProvider,
         jsdelivrProvider,
      ];
      const skypack = await getPackage.call(
         this,
         testCase.name,
         testCase.version
      );
      console.info("skypack:", testCase.name, skypack);
      // jsdelvr doesn't support @types/*
      if (testCase.name != "@types/babel__core") {
         (this as any)._packageProviders = [
            jsdelivrProvider,
            skypackProvider,
            esmshProvider,
         ];
         const jsdelvr = await getPackage.call(
            this,
            testCase.name,
            testCase.version
         );
         console.info("jsdelvr:", testCase.name, jsdelvr);
      }
   }
}

type PackageFilterFunction<T> = (packageInfo: {
   name: string;
   subpath: string;
   version: string;
}) => T;

export interface PackageProvider {
   /**
    * The host of the package provider.
    */
   host: string;
   /**
    * If provided, the package manager will use it to fetch .d.ts files.
    */
   dtsHeader?: string | PackageFilterFunction<string | void>;
   /**
    * Additional query parameters to be appended to the package requests.
    */
   queryParams?:
      | Record<string, string | true>
      | PackageFilterFunction<Record<string, string | true>>;
   /**
    * Specifies an additional path segment to be appended to the
    * package manager requests.
    */
   postpath?: string | PackageFilterFunction<string | void>;
   /**
    * Specifies an additional path segment to be prepended to the
    * package manager requests.
    */
   prepath?: string | PackageFilterFunction<string | void>;
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
    * Callback function triggered whenever a dts asset is fetched.
    */
   onDts?: (dts: {
      source: string;
      content: string;
      packagePath: string;
      packageVersion: string;
   }) => void;
   /**
    * An array of URLs used to remove duplicate packages. If a package's
    * URL is in that array, it won't use `fetch()` and will just simply
    * export everything from the package that has the same URL.
    */
   dedupe?: string[][];
}
