import * as Toypack from "@toypack/core/Toypack";
export * from "@toypack/core/Toypack";
import sampleCodes from "./sampleCodes";
//import "./sourceMaps";
//import "./resolve";
console.log(Toypack);

// Add assets
for (let [source, content] of Object.entries(sampleCodes)) {
	Toypack.addAsset({
		source,
		content
	});
}

Toypack.bundle({ entry: "./index.html" });
console.log(Toypack.vol.toJSON());
