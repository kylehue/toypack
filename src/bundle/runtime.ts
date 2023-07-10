export const identifiers = {
   modules: "_modules_",
   require: "_require_",
} as const;

export function html(scriptSrc = "", linkHref = "") {
   return `
<!DOCTYPE html>
<html lang="en">
   <head>
      <link rel="stylesheet" href="${linkHref}"></link>
      <script defer type="application/javascript" src="${scriptSrc}"></script>
   </head>
   <body>
   </body>
</html>
`;
}

export function requireFunction() {
   const result = `
var ${identifiers.modules} = {};
var _modules_cache_ = {};

/* Require function */
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

export function moduleWrap(source: string, code: string, call = false) {
   const varStr = `${identifiers.modules}["${source}"]`;
   let result = `
${varStr} = function (module, exports, require) {
${code}
return module.exports;
}
`;
   
   if (call) {
      result += "\n" + requireCall(source);
   }

   return result;
}

export function requireCall(source: string) {
   return `${identifiers.require}("${source}");`;
}
