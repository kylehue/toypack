import { Drawer } from "@kylehue/drawer";
import "@kylehue/drawer/build/styles/style.css";
import {
   mdiLanguageJavascript,
   mdiLanguageTypescript,
   mdiLanguageCss3,
   mdiLanguageHtml5,
   mdiSass,
   mdiVuejs,
   mdiCodeJson,
   mdiReact,
} from "@mdi/js";

function createIconFromPaths(paths: string, size = 24, color = "red") {
   const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
   const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
   svg.setAttribute("viewBox", "0 0 24 24");
   svg.setAttribute("width", size.toString());
   svg.setAttribute("height", size.toString());
   path.setAttribute("d", paths);
   path.setAttribute("fill", color);
   svg.append(path);
   return svg;
}

const drawer = new Drawer({
   element: document.querySelector(".container-files > .body") as HTMLElement,
   fileIcon: (source) => {
      if (/\.js$/.test(source)) {
         return createIconFromPaths(mdiLanguageJavascript, 20, "#ffda4b");
      } else if (/\.ts$/.test(source)) {
         return createIconFromPaths(mdiLanguageTypescript, 20, "#62bcd3");
      } else if (/\.css$/.test(source)) {
         return createIconFromPaths(mdiLanguageCss3, 20, "#66d3ff");
      } else if (/\.(sass|scss)$/.test(source)) {
         return createIconFromPaths(mdiSass, 20, "#ff818c");
      } else if (/\.html$/.test(source)) {
         return createIconFromPaths(mdiLanguageHtml5, 20, "#dd7934");
      } else if (/\.vue$/.test(source)) {
         return createIconFromPaths(mdiVuejs, 20, "#8dc149");
      } else if (/\.json$/.test(source)) {
         return createIconFromPaths(mdiCodeJson, 20, "#ffda4b");
      } else if (/\.[tj]sx$/.test(source)) {
         return createIconFromPaths(mdiReact, 20, "#62bcd3");
      }

      return "bi bi-file-earmark";
   },
   folderIcon: "bi bi-folder2-open",
   folderIconClosed: "bi bi-folder",
   folderIconChevron: "bi bi-chevron-down",
   horizontalScroll: false,
   animated: true,
   editFolderNameOnDoubleClick: true,
});

export { drawer };
