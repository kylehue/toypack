import template from "@babel/template";
import { getNamespaceWithError } from "./get-with-error";
import { isValidVar } from "./is-valid-var";
import type { ScriptModule } from "src/types";
import { UidTracker } from "../link/UidTracker";

export function createNamespace(uidTracker: UidTracker, module: ScriptModule) {
   const name = getNamespaceWithError(uidTracker, module.source);
   const exportsMap = uidTracker.getModuleExports(module.source);

   if (!exportsMap) {
      throw new Error(`No exports map found for '${module.source}'.`);
   }

   const exports = Object.entries(Object.fromEntries(exportsMap));

   const exportObject =
      "{\n" +
      exports
         .map(([name, id]) => {
            if (!isValidVar(name)) name = `"${name}"`;
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
