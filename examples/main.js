import "../lib/Toypack.js";
import sampleAssets from "./sampleAssets.js";
let toypack = new Toypack({
   bundleOptions: {
      mode: "development",
      entry: "index.html",
      output: {
         path: "lib",
         filename: "path/to/[base]",
         assetFilename: "my/cool/assets/[dir][base]",
         name: "CoolLibrary",
         resourceType: "external",
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

(async () => {
   for (let [source, content] of Object.entries(sampleAssets)) {
      await toypack.addAsset(source, content);
   }
   //await toypack.packageManager.install("bootstrap");
   await toypack.packageManager.install("vue");
   //await toypack.packageManager.install("uuid");
   await toypack.packageManager.install("react");
   await toypack.packageManager.install("react-dom/client");

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
