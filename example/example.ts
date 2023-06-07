import { sampleFiles } from "./sample.js";
import d, { Toypack, Babel,Utilities,  } from "../build/Toypack.js";
import { DefinePlugin } from "../build/plugins/DefinePlugin.js";

var saveData = (function () {
   var a = document.createElement("a");
   document.body.appendChild(a);
   a.style.display = "none";
   return function (data, fileName, type) {
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
const toypack = new Toypack({
   bundleOptions: {
      entry: "",
      module: "esm",
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
   babelOptions: {
      transform: {
         presets: ["typescript"],
      },
      parse: {
         plugins: ["typescript"],
      },
   },
});

console.log(toypack, Babel.availablePlugins, Babel.availablePresets);

runButton.onclick = async () => {
   console.log(await toypack.run());
}

downloadButton.onclick = async () => {
   toypack.options.bundleOptions.mode = "production";
   let result = await toypack.run();
   toypack.options.bundleOptions.mode = "development";

   for (let resource of result.resources) {
      saveData(resource.content, resource.source, resource.content.type)
   }

   saveData(
      result.script.content,
      result.script.source,
      "application/javascript"
   );

   saveData(result.style.content, result.style.source, "text/css");

   saveData(result.html.content, result.html.source, "text/html");
}

(async () => {
   const samplePic = await (
      await fetch(
         "https://cdn.discordapp.com/attachments/898027973272305674/1073582900991242260/image.png"
      )
   ).blob();

   toypack.setIFrame(iframe);

   toypack.usePlugin(
      new DefinePlugin({
         foo: "bar",
      })
   );

   toypack.addOrUpdateAsset("/images/cat.png", samplePic);

   toypack.hooks.onError((e) => {
      console.error(e.reason);
   });

   for (let [_, sampleFile] of Object.entries(sampleFiles)) {
      toypack.addOrUpdateAsset(sampleFile.source, sampleFile.content);
   }

   console.log(await toypack.run());

   /* iframe!.srcdoc = `
<!DOCTYPE html>
<html lang="en">
   <head>
      <script type="importmap">
         {
            "imports": {
               "path-browserify": "https://esm.run/path-browserify"
            }
         }
      </script>
      <script type="module" src="${sampleURL}"></script>
   </head>
   <body>
   </body>
</html>
`; */
})();
