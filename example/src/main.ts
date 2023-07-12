import "./style.css";
import { sampleFiles } from "./sampleFiles.js";
import { Toypack as ToypackESM, Babel } from "toypack";
import vuePlugin from "toypack-vue";
import sassPlugin from "toypack-sass";

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
      sourceMap: {
         exclude: ["/node_modules/"],
      },
      globalName: "MyLib",
   },
   babel: {
      transform: {
         presets: ["typescript", "react"],
      },
      parse: {
         plugins: ["typescript", "jsx"],
      },
   },
   plugins: [vuePlugin(), sassPlugin()],
   packageManager: {
      // dts: true,
      // onDts(dts) {
      //    console.log(dts);
      // },
   },
   logLevel: "debug"
});

// await toypack.installPackage("react");
// await toypack.installPackage("vue", "3.1.2");
// await toypack.installPackage("matter-js");
await toypack.installPackage("vue");
await toypack.installPackage("react", "18");
await toypack.installPackage("react-dom/client", "18");
await toypack.installPackage("canvas-confetti");

(window as any).toypack = toypack;
console.log(toypack, Babel.availablePlugins, Babel.availablePresets);

runButton.onclick = async () => {
   console.log(await toypack.run());
};

downloadButton.onclick = async () => {
   toypack.setConfig({ bundle: { mode: "production" } });
   let result = await toypack.run();
   toypack.setConfig({ bundle: { mode: "development" } });

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
