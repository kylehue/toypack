---
outline: deep
---

# Interfaces

This page contains the relevant TypeScript interfaces (or types) in Toypack.

## Asset

```ts
type Asset = TextAsset | ResourceAsset;

interface AssetBase {
   id: string;
   source: string;
   modified: boolean;
   metadata: Record<string, any>;
}

interface ResourceAsset extends AssetBase {
   type: "resource";
   content: Blob;
   contentURL: string;
}

interface TextAsset extends AssetBase {
   type: "text";
   content: string;
   map?: EncodedSourceMap | null;
}
```

## BundleResult

```ts
interface BundleResult {
   resources: Resource[];
   js: BundledAsset;
   css: BundledAsset;
   html: BundledAsset;
}

interface Resource {
   source: string;
   content: Blob;
}

interface BundledAsset {
   source: string;
   content: string;
}
```

## PackageProvider

```ts
interface PackageProvider {
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
      | Record<string, string | boolean>
      | PackageFilterFunction<Record<string, string | boolean>>;
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

type PackageFilterFunction<T> = (packageInfo: {
   name: string;
   subpath: string;
   version: string;
}) => T;
```

## ToypackConfig

```ts
interface ToypackConfig {
   bundle: {
      /**
       * The entry point of the program. If not specified, the bundler will
       * try to find it using `resolve("/")`.
       */
      entry: string;
      /**
       * The format of the bundle. Only supports "esm" at the moment.
       */
      format: "esm";
      /**
       * The mode of the bundle. Development mode is optimized for fast
       * workflow during the development process. Production mode is
       * optimized for performance and efficiency in a live production
       * environment.
       * @default "development"
       */
      mode: "production" | "development";
      resolve: {
         /**
          * Used to import certain modules more easily.
          */
         alias: Record<string, string>;
         /**
          * Used to redirect module paths when resolving fails.
          */
         fallback: Record<string, string | false>;
         /**
          * Additional extensions to consider for imported sources without
          * an explicit extension.
          */
         extensions: string[];
         /**
          * An object which maps extension to extension aliases.
          * @default
          * { ".js": [".js", ".ts"] }
          */
         extensionAlias: Record<string, string[]>;
      };
      /**
       * A boolean indicating whether to produce source maps or not.
       * It can also be an object containing the source map configuration.
       * @default true
       */
      sourceMap:
         | {
              /** Whether to include the source contents or not. */
              includeContent?: boolean;
              /** Paths to include from source maps. */
              include?:
                 | string[]
                 | RegExp
                 | ((source: string) => boolean | void);
              /** Paths to exclude from source maps. */
              exclude?:
                 | string[]
                 | RegExp
                 | ((source: string) => boolean | void);
           }
         | boolean;
   };
   /**
    * Configuration for the parser.
    * @see https://babeljs.io/docs/babel-parser#options
    */
   parser: Omit<
      import("@babel/core").ParserOptions,
      "sourceType" | "sourceFilename" | "strictMode"
   >;
   /**
    * Log level.
    * @default "warn"
    */
   logLevel: "error" | "warn" | "info" | "verbose" | "none";
   /**
    * Configuration for the package manager.
    */
   packageManager: PackageManagerConfig;
   /**
    * Toypack plugins.
    */
   plugins: Plugin[];
}
```

## PackageManagerConfig

```ts
interface PackageManagerConfig {
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
      isEntry: boolean;
   }) => void;
   /**
    * An array of URLs used to remove duplicate packages. If a package's
    * URL is in that array, it won't use `fetch()` and will just simply
    * export everything from the package that has the same URL.
    */
   dedupe?: string[][];
}
```

## ResolveOptions

```ts
interface ResolveOptions {
   baseDir: string,
   includeCoreModules: boolean,
   extensions: string[],
   extensionAlias: Record<string, string[]>,
   aliases: Record<string, string>,
   fallbacks: Record<string, string | false>,
}
```
