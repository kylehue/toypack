import template from "@babel/template";
import { getNamespaceWithError } from "./get-with-error";
import { isValidVar } from "./is-valid-var";
import { UidTracker } from "../link/UidTracker";
import { ERRORS } from "../../utils";
import type { ScriptModule, Toypack } from "src/types";

export function createNamespace(this: Toypack, uidTracker: UidTracker, module: ScriptModule) {
   const name = getNamespaceWithError.call(this, uidTracker, module.source);
   const exportsMap = uidTracker.getModuleExports(module.source);

   if (!exportsMap) {
      this._pushToDebugger(
         "error",
         ERRORS.any(`No exports map found for '${module.source}'.`)
      );
      return [];
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
      var ${name} = createNamespace({}, ${exportObject});
   `);

   return builtTemplate;
}
