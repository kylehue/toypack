import * as MagicString from "magic-string";
import { getUniqueIdFromString } from "./utils.js";

export function indentPrefix(shouldMinify = false) {
   return !shouldMinify ? "  " : "";
}

const identifiers = {
   modules: "_modules_",
   require: "_require_",
} as const;

// prettier-ignore
export function html(script = "", title = ""){
return `<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
   </head>
   <body>
      <script>
         ${script}
      </script>
   </body>
</html>
`.replaceAll("   ", indentPrefix());}

export function newLine(count = 1, shouldMinify = false) {
   let res = "";
   if (!shouldMinify) {
      for (let i = 0; i < count; i++) {
         res += "\n";
      }
   }

   return res;
}

export function requireFunction(minified = false) {
   // prettier-ignore
   let result = `var ${identifiers.modules} = {};
var _modules_cache_ = {};

${!minified ? "// Require function" : ""}
function ${identifiers.require}(path) {
   var init = ${identifiers.modules}[path];
   var module = { exports: {} };
   _modules_cache_[path] = module.exports;

   function localRequire(path) {
      if (!_modules_cache_[path]) {
         _modules_cache_[path] = module.exports;
         if (!path) {
            throw new Error("Could not resolve " + path);
         }
         
         var exports = ${identifiers.require}(path);
         _modules_cache_[path] = exports;
         return exports;
      }

      return _modules_cache_[path];
   }

   init(module, module.exports, localRequire);
   return module.exports;
}
`.replaceAll("   ", indentPrefix(minified));

   if (minified) {
      result = result.replaceAll("\n", "").replace(/\s\s+/g, " ").trim();
   }

   return result;
}

export function wrapIIFE(source: string, code: string, shouldMinify = false, isEntry = false) {
   const id = getUniqueIdFromString(source, shouldMinify);

   const magicStr = new MagicString.default("");
   magicStr.append(code || "");
   magicStr.append(`${newLine(2, shouldMinify)}return module.exports;`);

   /* code wrap (iife) */
   magicStr.indent(indentPrefix(shouldMinify));
   magicStr.prepend(
      `${identifiers.modules}.${id} = function (module, exports, require) {${newLine(1, shouldMinify)}`
   );
   magicStr.append(`\n}`);

   /* filename comment */
   if (!shouldMinify) {
      magicStr.prepend(`\n// ${source.replace(/^\//, "")}\n`);
   }
   
   /* return entry's exports */
   if (isEntry) {
      magicStr.append(`${newLine(2, shouldMinify)}${identifiers.require}("${id}");`);
   }

   return magicStr;
}
