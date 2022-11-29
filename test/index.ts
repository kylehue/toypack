import * as Toypack from "../src/core/Toypack";
import sampleCodes from "./sampleCodes";
console.log(Toypack);

// Add assets
for (let [src, content] of Object.entries(sampleCodes)) {
	Toypack.addAsset(src, content, {
		moduleName: "Wonder"
	});
}

Toypack.bundle({ entry: "./index.html" });
console.log(Toypack.vol.toJSON());
