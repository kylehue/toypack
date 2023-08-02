import template from "@babel/template";
import { getNamespaceWithError } from "./get-with-error";
import type { ScriptModule, Toypack } from "src/types";

export function createNamespace(this: Toypack, module: ScriptModule) {
   const name = getNamespaceWithError.call(this, module.source);
   const exportsMap = this._uidTracker.getModuleExports(module.source);

   if (!exportsMap) {
      throw new Error(`No exports map found for '${module.source}'.`);
   }

   const exports = Object.entries(Object.fromEntries(exportsMap));

   const exportObject =
      "{\n" +
      exports
         .map(([name, id]) => {
            // Add quotes if not a valid export name e.g. string exports
            const isValidName =
               /^[a-z0-9$_]+$/i.test(name) && !/^[0-9]+/.test(name);
            if (!isValidName) {
               name = `"${name}"`;
            }

            let line = `${name}: () => ${id}`;

            return line;
         })
         .join(",\n") +
      "\n}";

   const builtTemplate = template.ast(`
      var ${name} = {};
      __export(${name}, ${exportObject});
   `);

   return builtTemplate;
}
