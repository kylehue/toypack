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
      <script defer type="module" src="${scriptSrc}"></script>
   </head>
   <body>
   </body>
</html>
`.trim();
}

export function requireFunction() {
   const result = `
var ${identifiers.modules} = {};
var _modules_cache_ = {};

/* Require function */
function ${identifiers.require}(path) {
   var _module_ = ${identifiers.modules}[path];
   if (!_module_) {
      return {};
   }

   var initialize = _module_[0];
   var dependencyMap = _module_[1];

   var module = { exports: {} };
   _modules_cache_[dependencyMap[path]] = module.exports;

   function localRequire(path) {
      var resolvedPath = dependencyMap[path];
      if (!_modules_cache_[resolvedPath]) {
         _modules_cache_[resolvedPath] = module.exports;
         
         var exports = ${identifiers.require}(resolvedPath);
         _modules_cache_[resolvedPath] = exports;
         return exports;
      }

      return _modules_cache_[resolvedPath];
   }

   initialize(module, module.exports, localRequire);
   return module.exports;
}
`.trim();

   return result;
}

export function getModuleWrapper() {
   const varStr = `${identifiers.modules}["\${source}"]`;
   return {
      head: `
${varStr} = [function (module, exports, require) {
`.trim(),
      foot: `
return module.exports;
}, \${dependencyMap}]
`.trim(),
   };
}

export function requireCall(source: string) {
   return `${identifiers.require}("${source}");`;
}
