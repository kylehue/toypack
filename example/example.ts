import { sampleFiles } from "./sample.js";
import { Toypack, Babel } from "../build/Toypack.js";
import DefinePlugin from "../build/plugins/DefinePlugin.js";

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
   bundle: {
      entry: "",
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

console.log(toypack, Babel.availablePlugins, Babel.availablePresets);

runButton.onclick = async () => {
   console.log(await toypack.run());
};

downloadButton.onclick = async () => {
   toypack.config.bundle.mode = "production";
   let result = await toypack.run();
   toypack.config.bundle.mode = "development";

   for (let resource of result.resources) {
      saveData(resource.content, resource.source, resource.content.type);
   }

   saveData(
      result.js.content,
      result.js.source,
      "application/javascript"
   );

   saveData(result.css.content, result.css.source, "text/css");

   saveData(result.html.content, result.html.source, "text/html");
};

toypack.hooks.onError((e) => {
   //console.error(e.reason);
});

toypack.setIFrame(iframe);

const definePlugin = toypack.usePlugin(
   DefinePlugin({
      foo: "bar",
   })
);

definePlugin.add("bingbong", "beepboop");

(async () => {
   const samplePic = await (
      await fetch(
         "https://cdn.discordapp.com/attachments/898027973272305674/1073582900991242260/image.png"
      )
   ).blob();
   toypack.addOrUpdateAsset("/images/cat.png", samplePic);

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
