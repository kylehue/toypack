import * as monaco from "monaco-editor";
import { editor } from "./monaco";
import { drawer } from "./drawer";
import { toypack } from "./toypack";
import { FileManager } from "./file-manager";
import testFiles from "./generated/test-files";

const fileManager = new FileManager(editor, drawer, toypack);

const addFileButton = document.querySelector("#add-file") as HTMLButtonElement;
addFileButton.addEventListener("click", () => {
   const source = window.prompt("Enter the path");
   if (!source) return;
   fileManager.addFile(source, "");
});

console.log(monaco, editor, drawer, toypack);
(window as any).toypack = toypack;
(window as any).monaco = monaco;
(window as any).drawer = drawer;
(window as any).toypack = toypack;

for (const [source, content] of Object.entries(testFiles)) {
   fileManager.addFile(source, window.localStorage.getItem(source) || content);
}

toypack.run();

// Setup bundle code preview
const previewBundle = document.querySelector("#preview-bundle") as HTMLElement;
const previewIframe = document.querySelector("#preview") as HTMLIFrameElement;
const togglePreviewButton = document.querySelector(
   "#toggle-preview"
) as HTMLButtonElement;
const previewBundleModel = monaco.editor.createModel("", "javascript");
monaco.editor.create(previewBundle, {
   readOnly: true,
   wordWrap: "on",
   model: previewBundleModel,
   automaticLayout: true,
});
togglePreviewButton.onclick = () => {
   const textEl = togglePreviewButton.querySelector(".text")!;
   const text = textEl.textContent?.trim();
   if (text == "View Bundle") {
      previewIframe.classList.add("d-none");
      previewBundle.classList.remove("d-none");
      textEl.textContent = "View HTML";
   } else {
      previewIframe.classList.remove("d-none");
      previewBundle.classList.add("d-none");
      textEl.textContent = "View Bundle";
   }
};
toypack.onRun((bundle) => {
   previewBundleModel.setValue(bundle.js.content);
});

// Setup auto-run
const toggleAutoRunButton = document.querySelector(
   "#toggle-auto-run"
) as HTMLButtonElement;
let autoRun = false;
let autoRunDelayInMs = 500;
toggleAutoRunButton.onclick = () => {
   const textEl = toggleAutoRunButton.querySelector(".text")!;
   let text = textEl.textContent?.trim();
   if (text == "Enable Auto-run") {
      textEl.textContent = "Disable Auto-run";
      autoRun = true;
      autoRunDelayInMs = parseInt(
         window.prompt("Enter the delay", autoRunDelayInMs.toString()) || "500"
      );
   } else {
      textEl.textContent = "Enable Auto-run";
      autoRun = false;
   }
};
const timers: NodeJS.Timeout[] = [];
editor.onDidChangeModelContent((e) => {
   if (autoRun) {
      for (const timer of timers) {
         clearTimeout(timer);
         timers.splice(timers.indexOf(timer), 1);
      }
      const timer = setTimeout(() => {
         toypack.run();
      }, autoRunDelayInMs);
      timers.push(timer);
   }

   // const currentModel = editor.getModel();
   // const source = currentModel?.uri.path;
   // const asset = toypack.getAsset(source || "");
   // console.log(e);
   
   // if (asset) {
   //    asset.modified = true;
   // }
});

// Setup resetting cache
const resetCacheButton = document.querySelector(
   "#reset-cache"
) as HTMLButtonElement;
resetCacheButton.onclick = () => {
   // drawer.root.delete("/");
   if (window.confirm("Are you sure you want to clear the cache?")) {
      window.localStorage.clear();
   }
};

// hot reload
import.meta.hot?.accept();
import.meta.hot?.on("vite:beforeUpdate", () => {
   console.clear();
});
