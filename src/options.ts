import { ParserOptions, TransformOptions } from "@babel/core";
import { AcceptedPlugin, ProcessOptions } from "postcss";

type IModule = "esm" | "cjs";
type IMode = "production" | "development";
type ILogLevel = "error" | "warn" | "info" | "none";
type IBabelTransformOptions = Omit<
   TransformOptions,
   | "sourceType"
   | "sourceFileName"
   | "filename"
   | "sourceMaps"
   | "envName"
   | "ast"
   | "minified"
   | "compact"
   | "comments"
>;
type IBabelParseOptions = Omit<ParserOptions, "sourceType" | "sourceFilename">;

const defaultOptions = {
   /**
    * The options for bundling the program.
    */
   bundleOptions: {
      /**
       * The entry point of the program. If not specified, entry will be `/index.js` or `/index.html`. If those files doesn't exist, entry will be the path specified in the `main` field of `/package.json`.
       */
      entry: "",
      /**
       * The module format of the program.
       * @default "esm"
       */
      module: "esm" as IModule,
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
      sourceMap: true,
      /**
       * Whether to minify the output bundle or not. Sets to `true` when the mode is set to `production`.
       * @default false
       */
      minified: false,
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
    * Configuration for PostCSS.
    */
   postCSSOptions: {
      plugins: [] as AcceptedPlugin[],
      ...({} as Omit<ProcessOptions, "map" | "from" | "to">)
   },
   /**
    * Log level.
    * @default "error"
    */
   logLevel: "error" as ILogLevel,
};

type IOptions = typeof defaultOptions;

export { defaultOptions, IOptions };
