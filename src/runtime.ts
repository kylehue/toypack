export const indentPrefix = (shouldMinify = false) => !shouldMinify ? "  " : "";

export const requireFunction = (minified = false) => {
   // prettier-ignore
   let result = 
`${!minified ? "// Require function" : ""}
function require(path) {
   var _r = _modules_[path];
   if (!_r) {
      _r = {};
      _modules_[path] = _r;
   }
   return _r;
}
`.replaceAll("   ", indentPrefix(minified));
   
   if (minified) {
      result = result
         .replaceAll("\n", "")
         .replace(/\s\s+/g, " ");
   }
   
   return result;
};

// prettier-ignore
export const html = (script = "", title = "") =>
`<!DOCTYPE html>
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
`.replaceAll("   ", indentPrefix());

export const newLine = (count = 1, shouldMinify = false) => {
   let res = "";
   if (!shouldMinify) {
      for (let i = 0; i < count; i++) {
         res += "\n";
      }
   }

   return res;
};
