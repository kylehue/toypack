import { ParserOptions, TransformOptions } from "@babel/core";
import { PackageManagerConfig } from "./package-manager";

export const defaultConfig = {
   /**
    * Configuration for the bundler.
    */
   bundle: {
      /**
       * The entry point of the program. If not specified, the bundler will
       * try to find it using `resolve("/")`.
       */
      entry: "",
      /**
       * The module type of the program.
       * @default "esm"
       */
      moduleType: "esm" as ModuleTypeConfig,
      /**
       * The mode of the bundle. Development mode is optimized for fast
       * workflow during the development process. Production mode is
       * optimized for performance and efficiency in a live production
       * environment.
       * @default "development"
       */
      mode: "development" as ModeConfig,
      /**
       * Configuration for resolving module imports.
       */
      resolve: {
         /**
          * Used to import certain modules more easily.
          */
         alias: {} as Record<string, string>,
         /**
          * Used to redirect module paths when resolving fails.
          */
         fallback: {} as Record<string, string | false>,
         /**
          * Additional extensions to consider for imported sources without
          * an explicit extension.
          */
         extensions: [] as string[],
         /**
          * An object which maps extension to extension aliases.
          * @default
          * { ".js": [".js", ".ts"] }
          */
         extensionAlias: {
            ".js": [".js", ".ts"],
         } as Record<string, string[]>,
      },
      /**
       * A boolean indicating whether to produce source maps or not.
       * It can also be an object containing the source map configuration.
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
   include?: string[] | RegExp | ((source: string) => boolean | void);
   /** Paths to exclude from source maps. */
   exclude?: string[] | RegExp | ((source: string) => boolean | void);
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
