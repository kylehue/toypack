import "../lib/Toypack.js";
import "../lib/BabelLoader.js";
import "../lib/AssetLoader.js";
import "../lib/CSSLoader.js";
import "../lib/HTMLLoader.js";
import "../lib/JSONLoader.js";
import "../lib/AutoImportJSXPragmaPlugin.js";
import "../lib/NodePolyfillPlugin.js";
import sampleAssets from "./sampleAssets.js";
let toypack = new Toypack({
	bundleOptions: {
		mode: "production",
		entry: "index.html",
		output: {
			path: "lib",
			filename: "path/to/[base]",
			assetFilename: "my/cool/assets/[dir][base]",
			name: "CoolLibrary",
			asset: "external",
			sourceMap: "inline-cheap-sources",
		},
		resolve: {
			alias: {
				"@scripts": "./scripts/",
				"@stuff": "./cool/stuff/",
			},
			fallback: {
				fs: false,
			},
		},
		logs: true,
	},
	packageProvider: "esm.sh",
});

toypack.loaders.push(new BabelLoader());
toypack.loaders.push(new AssetLoader());
toypack.loaders.push(new CSSLoader());
toypack.loaders.push(new HTMLLoader());
toypack.loaders.push(new JSONLoader());
toypack.use(new AutoImportJSXPragmaPlugin());
toypack.use(new NodePolyfillPlugin());

(async () => {
	/* await toypack.addDependency("vue@3.2.23");
				await toypack.addDependency("uuid");
				await toypack.addDependency("react");
				await toypack.addDependency("react-dom");
				await toypack.addDependency("use-state-in-custom-properties"); */
	//await toypack.addDependency("bootstrap");
	await toypack.packageManager.install(
		"bootstrap@5.2.3/dist/css/bootstrap.min.css"
	);
	// await toypack.packageManager.install("vue@3.2.23");
	await toypack.packageManager.install("uuid");
	await toypack.packageManager.install("react");
	await toypack.packageManager.install("react-dom/client");

	for (let [source, content] of Object.entries(sampleAssets)) {
		await toypack.addAsset(source, content);
	}

	await toypack.bundle();
})();

let button = document.getElementById("bundle");
let sandbox = document.getElementById("sandbox");

button.onclick = async () => {
	let bundle = await toypack.bundle();
	sandbox.src = bundle.contentDocURL;
};

window.toypack = toypack;
console.log(toypack);
