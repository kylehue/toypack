import * as Toypack from "@toypack/core/Toypack";
export * from "@toypack/core/Toypack";
import sampleCodes from "./sampleCodes";
//console.log(Toypack);
// Add assets
for (let [source, content] of Object.entries(sampleCodes)) {
	Toypack.addAsset(source, content);
}

Toypack.defineBundleConfig({
	mode: "development",
	entry: "/",
	output: {
		path: "./dist/",
		filename: "test.js",
		sourceMap: true,
		name: "MyLibrary"
	},
});

Toypack.bundle();

setTimeout(() => {
	//console.log(Toypack.vol.toJSON());
}, 1000);

//import "./resolve";
//import "./sourceMaps";
//import "./sourceMapsMerge";
