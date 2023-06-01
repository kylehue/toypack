import { sampleFiles } from "./sample.js";
import { Toypack } from "../build/Toypack.js";

const iframe = document.querySelector<HTMLIFrameElement>("#sandbox");
const toypack = new Toypack({
   bundleOptions: {
      entry: "src/main.js",
      format: "esm"
   }
});

// entry should only either be html or js

// should be able to pick whether to use esm or cjs

// dev mode - has to be bundled into one file, transpiled

// prod mode - has to be seperated into multiple files, transpiled

console.log(iframe);

for (let [_, sampleFile] of Object.entries(sampleFiles)) {
   toypack.addOrUpdateAsset(sampleFile.source, sampleFile.content);
}

toypack.run();

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

console.log(toypack, sampleFiles);
