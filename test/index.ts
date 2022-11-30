import * as Toypack from "@toypack/core";
import sampleCodes from "./sampleCodes";
//import "./sourceMaps";
//import "./resolve";
console.log(Toypack);

// Add assets
for (let [src, content] of Object.entries(sampleCodes)) {
	Toypack.addAsset({
		moduleName: "Wonder",
		source: src,
		content: content
	});
}

Toypack.bundle({ entry: "./index.html" });
console.log(Toypack.vol.toJSON());