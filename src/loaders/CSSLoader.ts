import {
   ICompileData,
   ICompileRecursive,
   ICompileResult,
   ILoader,
   Toypack,
} from "../Toypack.js";
import { getUniqueIdFromString } from "../utils.js";

export class CSSLoader implements ILoader {
   public name = "CSSLoader";
   public test = /\.css$/;

   constructor(public bundler: Toypack) {
      bundler.extensions.style.push(".css");
   }

   compile(data: ICompileData) {
      const result: ICompileResult = {
         type: "result",
         content: ""
      };

      const id = getUniqueIdFromString(data.source, true);

      const code = `
      if (!document.querySelector("[data-toypack-id~='${id}']")) {
         var head = document.head || document.getElementsByTagName("head")[0];
         var stylestr = \`${data.content}\`;
         var styleElement = document.createElement("style");
         styleElement.setAttribute("type", "text/css");
         styleElement.dataset.toypackId = "${id}";
         if (styleElement.styleSheet){
            styleElement.styleSheet.cssText = stylestr;
         } else {
            styleElement.appendChild(document.createTextNode(stylestr));
         }
         head.appendChild(styleElement);
      }
      `;

      result.content = code;
      
      return result;
   }
}
