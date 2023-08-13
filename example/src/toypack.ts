import { Toypack } from "toypack";
import vuePlugin from "toypack-vue";
import sassPlugin from "toypack-sass";
import babelPlugin from "toypack-babel";
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

const toypack = new Toypack({
   bundle: {
      entry: "index.html",
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
   },
   parser: {
      plugins: ["typescript", "jsx"],
   },
   plugins: [
      vuePlugin({
         featureFlags: {
            __VUE_OPTIONS_API__: false,
            __VUE_PROD_DEVTOOLS__: false,
         },
      }),
      sassPlugin(),
      babelPlugin({
         presets: [
            [
               "env",
               {
                  modules: false,
               },
            ],
            "react",
            "typescript",
         ],
         plugins: ["transform-runtime"],
      }),
   ],
   packageManager: {
      // dts: true,
      // onDts(dts) {
      //    console.log(dts);
      // },
   },
   logLevel: "verbose",
});

const iframe = document.querySelector("#preview") as HTMLIFrameElement;
toypack.setIFrame(iframe);

// await toypack.installPackage("react");
// await toypack.installPackage("vue", "3.1.2");
// await toypack.installPackage("matter-js");
// await toypack.installPackage("react", "18");
// await toypack.installPackage("react-dom/client", "18");
await toypack.installPackage("vue");
// await toypack.installPackage("canvas-confetti");
// await toypack.installPackage("path-browserify");
// await toypack.installPackage("is-odd");

const runButton = document.querySelector("#run") as HTMLButtonElement;
runButton.onclick = async () => {
   console.log(await toypack.run());
};

const downloadButton = document.querySelector("#download") as HTMLButtonElement;
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

// for (let [source, content] of Object.entries(testFiles)) {
//    toypack.addOrUpdateAsset(source, content);
// }

// console.log(await toypack.run());

export { toypack };
