import { ParserOptions, TransformOptions } from "@babel/core";

export const defaultOptions = {
   /**
    * Configuration for the bundler.
    */
   bundleOptions: {
      /**
       * The entry point of the program. If not specified, entry will be `/index.js` or `/index.html`. If those files doesn't exist, entry will be the path specified in the `main` field of `/package.json`.
       */
      entry: "",
      /**
       * The module type of the program.
       * @default "esm"
       */
      moduleType: "esm" as IModuleType,
      /**
       * The mode of the bundle. `development` is optimized for a fast and flexible workflow during the development process. `production` is optimized for performance and efficiency in a live production environment.
       * @default "development"
       */
      mode: "development" as IMode,
      /**
       * Configuration for resolving module imports.
       */
      resolve: {
         /**
          * An object mapping aliases to their corresponding paths or modules.
          */
         alias: {} as Record<string, string>,
         /**
          * An object mapping fallback module names to their corresponding paths or modules. Allows for providing fallback modules when a module is not found in the normal resolution process.
          */
         fallback: {} as Record<string, string | false>,
         /**
          * An array of prioritized file extensions to resolve.
          * @default
          * [".js", ".ts", ".json"]
          */
         extensions: [".js", ".ts", ".json"] as string[],
      },
      /**
       * Indicates whether to generate source maps for the bundled code.
       * @default true
       */
      sourceMap: true as ISourceMap,
   },
   /**
    * Configuration for Babel.
    */
   babelOptions: {
      transform: {
         presets: [],
         plugins: [],
      } as IBabelTransformOptions,
      parse: {
         plugins: [],
      } as IBabelParseOptions,
   },
   /**
    * Log level.
    * @default "error"
    */
   logLevel: "error" as ILogLevel,
};

export type IOptions = typeof defaultOptions;
export type IModuleType = "esm" | "cjs";
export type IMode = "production" | "development";
export type ILogLevel = "error" | "warn" | "info" | "none";
export type IBabelTransformOptions = Pick<
   TransformOptions,
   | "plugins"
   | "presets"
   | "targets"
   | "assumptions"
   | "highlightCode"
   | "shouldPrintComment"
>;

export type IBabelParseOptions = Omit<
   ParserOptions,
   "sourceType" | "sourceFilename" | "strictMode"
>;

export type ISourceMap = boolean | "nosources";
