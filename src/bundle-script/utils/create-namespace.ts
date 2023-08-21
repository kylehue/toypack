import template from "@babel/template";
import { getNamespaceWithError } from "./get-with-error";
import { isValidVar } from "./is-valid-var";
import { UidTracker, symbols } from "../link/UidTracker";
import { ERRORS } from "../../utils";
import runtime from "../runtime";
import type { ScriptModule, Toypack } from "src/types";

export function createNamespace(
   this: Toypack,
   runtimes: Set<keyof typeof runtime>,
   uidTracker: UidTracker,
   module: ScriptModule
) {
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
   const mergeNamespaces: string[] = [];

   const exportObject =
      "{\n" +
      exports
         .map(([name, id]) => {
            if (id === symbols.aggregated) {
               const namespace = getNamespaceWithError.call(
                  this,
                  uidTracker,
                  name
               );
               mergeNamespaces.push(namespace);
               return;
            }

            if (typeof id !== "string") return;

            if (!isValidVar(name)) name = `"${name}"`;
            let line = `${name}: () => ${id}`;
            return line;
         })
         .filter((x) => !!x)
         .join(",\n") +
      "\n}";

   const targetObjStr = mergeNamespaces.length
      ? `removeDefault(mergeObjects(${mergeNamespaces.join(`, `)}))`
      : "{}";

   runtimes.add("createNamespace");
   if (mergeNamespaces.length) {
      runtimes.add("mergeObjects");
      runtimes.add("removeDefault");
   }

   const builtTemplate = template.ast(`
      var ${name} = createNamespace(${targetObjStr}, ${exportObject});
   `);

   return builtTemplate;
}
