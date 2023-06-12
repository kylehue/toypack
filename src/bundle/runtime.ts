import { CodeComposer } from "../CodeComposer.js";
import { getHash } from "../utils.js";

const identifiers = {
   modules: "_modules_",
   require: "_require_",
} as const;

export function indentPrefix() {
   return "  ";
}

export function html(script = "", style = "", asExternalURL = false) {
   return `
   <!DOCTYPE html>
   <html lang="en">
      <head>
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
   `;
}

export function requireFunction() {
   const result = `
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
      }
      `;

   return result;
}

export function moduleWrap(source: string, code: string) {
   const composer = new CodeComposer(code);
   const varStr = `${identifiers.modules}["${source}"]`;
   composer.wrap(
      `
      ${varStr} = function (module, exports, require) {
         <CODE_BODY>

         return module.exports;
      }
      `
   );

   return composer.toString();
}

export function requireCall(source: string) {
   return `${identifiers.require}("${source}");`;
}
