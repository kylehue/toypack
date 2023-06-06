import * as MagicString from "magic-string";
import { getUniqueIdFromString } from "./utils.js";
import { CodeComposer } from "./CodeComposer.js";

export function indentPrefix() {
   return "  ";
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

export function requireFunction() {
   // prettier-ignore
   let result = `var ${identifiers.modules} = {};
var _modules_cache_ = {};

// Require function
function ${identifiers.require}(path) {
   var init = ${identifiers.modules}[path];
   var module = { exports: {} };
   _modules_cache_[path] = module.exports;

   function localRequire(path) {
      if (!_modules_cache_[path]) {
         _modules_cache_[path] = module.exports;
         if (!path) {
            throw new Error("Could not resolve '" + path + "'.");
         }
         
         var exports = ${identifiers.require}(path);
         _modules_cache_[path] = exports;
         return exports;
      }

      return _modules_cache_[path];
   }

   init(module, module.exports, localRequire);
   return module.exports;
}`.replaceAll("   ", indentPrefix());

   return result;
}

export function moduleWrap(source: string, code: string, isEntry = false) {
   const id = getUniqueIdFromString(source);

   const composer = new CodeComposer(code);
   composer.indent(indentPrefix()).wrap(
      `// ${source.replace(/^\//, "")}
      ${identifiers.modules}.${id} = function (module, exports, require) {
         <CODE_BODY>

         return module.exports;
      }

      ${isEntry ? `${identifiers.require}("${id}");` : ""}`
   );

   return composer.toString();
}
