import { ParserOptions, TransformOptions } from "@babel/core";
import { PackageManagerConfig } from "./package-manager";

export const defaultConfig = {
   /**
    * Configuration for the bundler.
    */
   bundle: {
      /**
       * The entry point of the program. If not specified, entry will be
       * `/index.js` or `/index.html`. If those files doesn't exist, entry
       * will be the path specified in the `main` field of `/package.json`.
       */
      entry: "",
      /**
       * The module type of the program.
       * @default "esm"
       */
      moduleType: "esm" as ModuleTypeConfig,
      /**
       * The mode of the bundle. `development` is optimized for a fast
       * and flexible workflow during the development process. `production`
       * is optimized for performance and efficiency in a live production
       * environment.
       * @default "development"
       */
      mode: "development" as ModeConfig,
      /**
       * Configuration for resolving module imports.
       */
      resolve: {
         /**
          * An object mapping aliases to their corresponding paths or modules.
          */
         alias: {} as Record<string, string>,
         /**
          * An object mapping fallback module names to their corresponding
          * paths or modules. Allows for providing fallback modules when a
          * module is not found in the normal resolution process.
          */
         fallback: {} as Record<string, string | false>,
         /**
          * Additional extensions to consider for imported sources without
          * an explicit extension.
          * @default
          * []
          */
         extensions: [] as string[],
      },
      /**
       * Indicates whether to generate source maps for the bundled code.
       * @default true
       */
      sourceMap: true as SourceMapConfig,
   },
   /**
    * Configuration for Babel.
    */
   babel: {
      transform: {
         presets: [],
         plugins: [],
      } as BabelTransformConfig,
      parse: {
         plugins: [],
      } as BabelParseConfig,
   },
   /**
    * Log level.
    * @default "info"
    */
   logLevel: "info" as LogLevelConfig,
   /**
    * Configuration for the package manager.
    */
   packageManager: {
      providers: [
         {
            host: "https://cdn.jsdelivr.net/",
            postpath: "+esm",
            prepath: "npm",
         },
         {
            host: "https://esm.sh/",
            dtsHeader: "X-Typescript-Types",
         },
         {
            host: "https://cdn.skypack.dev/",
            dtsHeader: "X-Typescript-Types",
            queryParams: {
               dts: true,
            },
         },
      ],
      dts: false,
   } as PackageManagerConfig,
};

export type ToypackConfig = typeof defaultConfig;
export type ModuleTypeConfig = "esm" | "cjs";
export type ModeConfig = "production" | "development";
export type LogLevelConfig = "error" | "warn" | "info" | "none";
export type SourceMapConfig = boolean | "nosources";
export type BabelTransformConfig = Pick<
   TransformOptions,
   | "plugins"
   | "presets"
   | "targets"
   | "assumptions"
   | "highlightCode"
   | "shouldPrintComment"
>;

export type BabelParseConfig = Omit<
   ParserOptions,
   "sourceType" | "sourceFilename" | "strictMode"
>;