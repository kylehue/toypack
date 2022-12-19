export interface ResolveOptions {
	baseDir: string;
}

export interface OutputOptions {
	/**
	 * The output directory of the bundle.
	 */
	path: string;
	/**
	 * The output filename of the bundle.
	 */
	filename: string;
	/**
	 * - Set to `true` to generate a sourcemap and append it in the bundle content as a data URL.
	 */
	sourceMap?: boolean;
	/**
	 * The name of your library.
	 */
	name?: string;
	/**
	 * Whether to add object URLs in the bundle output or not. This is useful if you want to use the bundle in an <iframe>.
	 */
	contentURL?: boolean;
}

export interface BundleOptions {
	mode?: "development" | "production";
	entry: string;
	output: OutputOptions;
}

export interface ToypackOptions {
	bundleOptions: BundleOptions;
}
