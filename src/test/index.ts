import * as Toypack from "@toypack/core/Toypack";
export * from "@toypack/core/Toypack";
import sampleCodes from "./sampleCodes";
console.log(Toypack);
// Add assets
for (let [source, content] of Object.entries(sampleCodes)) {
	Toypack.addAsset({
		source,
		content
	});
}

Toypack.bundle({ entry: "./index.html" });

setTimeout(() => {
	console.log(Toypack.vol.toJSON());
}, 1000);

//import "./resolve";
//import "./sourceMaps";

