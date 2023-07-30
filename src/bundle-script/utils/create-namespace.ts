import { ScriptDependency } from "src/types";
import { UidTracker } from "../link/UidTracker";
import template from "@babel/template";

export function createNamespace(module: ScriptDependency) {
   const name = UidTracker.getNamespaceFor(module.source);
   const exports = Object.entries(UidTracker.getModuleExports(module.source));

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
