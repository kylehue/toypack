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
       * Set to true to produce source maps. Can also be an object containing
       * the source map configuration.
       * @default true
       */
      sourceMap: true as SourceMapConfig | boolean,
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
      /**
       * @see https://babeljs.io/docs/babel-preset-minify#options
       */
      minify: {} as Record<string, any>,
   },
   /**
    * Log level.
    * @default "info"
    */
   logLevel: "info" as LogLevelConfig,
   /**
    * Configuration for the package manager.
    */
   packageManager: {} as PackageManagerConfig,
};

export type ToypackConfig = typeof defaultConfig;
export type ModuleTypeConfig = "esm" | "cjs";
export type ModeConfig = "production" | "development";
export type LogLevelConfig = "error" | "warn" | "info" | "none";
export type SourceMapConfig = {
   /** Whether to include the source contents or not. */
   includeContent?: boolean;
   /** Paths to include from source maps. */
   include?: string[];
   /** Paths to exclude from source maps. */
   exclude?: string[];
};
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
