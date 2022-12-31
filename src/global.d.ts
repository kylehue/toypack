declare module "posthtml-parser";
declare module "@toypack/resolve";
declare module "postcss-value-parser";
declare module "autoprefixer";
declare module "merge-source-map";
declare module "@jridgewell/sourcemap-codec";
declare module "babel-minify";

declare module "*.worker.ts" {
	// You need to change `Worker`, if you specified a different value for the `workerType` option
	class WebpackWorker extends Worker {
		constructor();
	}

	// Uncomment this if you set the `esModule` option to `false`
	// export = WebpackWorker;
	export default WebpackWorker;
}