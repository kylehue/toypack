import { createSafeName } from "../utils.js";
import {
   ICompileData,
   ICompileRecursive,
   ICompileResult,
   ILoader,
   Toypack,
} from "../Toypack.js";

export class CSSLoader implements ILoader {
   public name = "CSSLoader";
   public test: RegExp = /\.css$/;

   constructor(public bundler: Toypack) {

   }

   compile(data: ICompileData) {
      const result: ICompileResult = {
         type: "result",
         content: ""
      };

      const id = createSafeName(data.source);

      let code = `
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
