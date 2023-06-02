
type IFormat = "esm" | "cjs";
type IMode = "production" | "development";
type ILogLevel = "error" | "warn" | "info" | "none";

const defaultOptions = {
   bundleOptions: {
      /**
       * The entry point of the program.
       */
      entry: "",
      format: "esm" as IFormat,
      mode: "production" as IMode,
      resolve: {
         alias: {},
         fallback: {},
         extensions: [],
      },
      sourceMap: true,
   },
   iframe: null as HTMLIFrameElement | null,
   logLevel: "error" as ILogLevel,
};

type IOptions = typeof defaultOptions;

export { defaultOptions, IOptions };