import fs from "fs";

console.log(fs);

export interface ToypackConfig {
	/** The base name of the core modules directory.
	 ** Default: `node_modules`
	 */
	coreModuleBase: string;
	[key: string | number | symbol]: unknown;
}

const ToypackConfig: ToypackConfig = {
   coreModuleBase: "node_modules"
};

export default ToypackConfig;
