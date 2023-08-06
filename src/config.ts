import { ParserOptions, TransformOptions } from "@babel/core";
import { PackageManagerConfig } from "./package-manager";
import { Plugin } from "./types";

export const defaultConfig = {
   /**
    * Bundling configurations.
    */
   bundle: {
      /**
       * The entry point of the program. If not specified, the bundler will
       * try to find it using `resolve("/")`.
       */
      entry: "",
      /**
       * The format of the bundle.
       * @default "esm"
       */
      format: "esm" as FormatConfig,
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
      /**
       * Inject import map to HTML output.
       */
      importMap: {
         imports: {},
         scopes: {},
      } as ImportMapConfig,
      /**
       * Inject templates to HTML output.
       */
      template: {
         head: [],
         body: [],
         bodyAttributes: {},
      } as TemplateConfig,
   },
   /**
    * Configuration for the parser.
    * @see https://babeljs.io/docs/babel-parser#options
    */
   parser: {
      plugins: [],
   } as BabelParseConfig,
   /**
    * Log level.
    * @default "warn"
    */
   logLevel: "warn" as LogLevelConfig,
   /**
    * Configuration for the package manager.
    */
   packageManager: {} as PackageManagerConfig,
   /**
    * Toypack plugins.
    */
   plugins: [] as Plugin[],
};

export type ToypackConfig = typeof defaultConfig;
export type FormatConfig = "esm";
export type ModeConfig = "production" | "development";
export type LogLevelConfig = "error" | "warn" | "info" | "verbose" | "none";
export type SourceMapConfig = {
   /** Whether to include the source contents or not. */
   includeContent?: boolean;
   /** Paths to include from source maps. */
   include?: string[] | RegExp | ((source: string) => boolean | void);
   /** Paths to exclude from source maps. */
   exclude?: string[] | RegExp | ((source: string) => boolean | void);
};
export type ImportMapConfig = {
   imports: Record<string, string>;
   scopes: Record<string, Record<string, string>>;
};
export type TemplateConfig = {
   head: string[];
   body: string[];
   bodyAttributes: Record<string, string>;
};

export type BabelParseConfig = Omit<
   ParserOptions,
   "sourceType" | "sourceFilename" | "strictMode"
>;
