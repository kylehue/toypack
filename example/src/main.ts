import "./style.css";
import { sampleFiles } from "./sampleFiles.js";
import { Toypack as ToypackESM, Babel } from "toypack";

var saveData = (function () {
   var a = document.createElement("a");
   document.body.appendChild(a);
   a.style.display = "none";
   return function (data: any, fileName: string, type: string) {
      var blob = new Blob([data], { type }),
         url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
   };
})();

const iframe = document.querySelector<HTMLIFrameElement>("#sandbox")!;
const runButton = document.querySelector<HTMLButtonElement>("#runSandbox")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const toypack = new ToypackESM({
   bundle: {
      entry: "index.html",
      moduleType: "esm",
      resolve: {
         alias: {
            "@classes": "/classes/",
         },
         fallback: {
            path: false,
         },
      },
      mode: "development",
   },
   babel: {
      transform: {
         presets: ["typescript"],
      },
      parse: {
         plugins: ["typescript"],
      },
   },
});

await toypack.installPackage("react");
await toypack.installPackage("vue", "3.1.2");

(window as any).toypack = toypack;
console.log(toypack, Babel.availablePlugins, Babel.availablePresets);

runButton.onclick = async () => {
   console.log(await toypack.run());
};

downloadButton.onclick = async () => {
   let result = await toypack.run(true);

   for (let resource of result.resources) {
      saveData(resource.content, resource.source, resource.content.type);
   }

   saveData(result.js.content, result.js.source, "application/javascript");
   saveData(result.css.content, result.css.source, "text/css");
   saveData(result.html.content, result.html.source, "text/html");
};

toypack.setIFrame(iframe);

// const definePlugin = toypack.usePlugin(
//    DefinePlugin({
//       foo: "bar",
//    })
// );

// definePlugin.add("bingbong", "beepboop");

for (let [source, content] of Object.entries(sampleFiles)) {
   toypack.addOrUpdateAsset(source, content);
}

console.log(await toypack.run());
