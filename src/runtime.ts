import { CodeComposer } from "./CodeComposer.js";
import { getUniqueIdFromString } from "./utils.js";

export function indentPrefix() {
   return "  ";
}

const identifiers = {
   modules: "_modules_",
   require: "_require_",
} as const;

export function html(script = "", style = "", asExternalURL = false) {
   return CodeComposer.revampIndent(
      `
   <!DOCTYPE html>
   <html lang="en">
      <head>
         <meta charset="UTF-8" />
         <meta http-equiv="X-UA-Compatible" content="IE=edge" />
         <meta name="viewport" content="width=device-width, initial-scale=1.0" />
         <title>Something</title>
         ${
            asExternalURL
               ? `<link rel="stylesheet" href="${style}"></link>`
               : `<style>${style}</style>`
         }
         ${
            asExternalURL
               ? `<script defer type="application/javascript" src="${script}"></script>`
               : ""
         }
      </head>
      <body>
         ${!asExternalURL ? `<script>${script}</script>` : ""}
      </body>
   </html>
   `,
      4
   );
}

export function requireFunction() {
   const result = CodeComposer.revampIndent(
      `
      var ${identifiers.modules} = {};
      var _modules_cache_ = {};

      // Require function
      function ${identifiers.require}(path) {
         var init = ${identifiers.modules}[path];
         if (!init) {
            return {};
         }

         var module = { exports: {} };
         _modules_cache_[path] = module.exports;

         function localRequire(path) {
            if (!_modules_cache_[path]) {
               _modules_cache_[path] = module.exports;
               
               var exports = ${identifiers.require}(path);
               _modules_cache_[path] = exports;
               return exports;
            }

            return _modules_cache_[path];
         }

         init(module, module.exports, localRequire);
         return module.exports;
      }`,
      4
   );

   return result;
}

export function moduleWrap(source: string, code: string, isEntry = false) {
   const id = getUniqueIdFromString(source);

   const composer = new CodeComposer(code);
   composer.wrap(
      `
      // ${source.replace(/^\//, "")}
      ${identifiers.modules}.${id} = function (module, exports, require) {
         <CODE_BODY>

         return module.exports;
      }

      ${isEntry ? `${identifiers.require}("${id}");` : ""}`
   );

   return composer.toString();
}
