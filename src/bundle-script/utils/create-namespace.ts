import { ScriptDependency } from "src/types";
import { UidTracker } from "../link/UidTracker";
import template from "@babel/template";

export function createNamespace(module: ScriptDependency) {
   const name = UidTracker.getNamespaceFor(module.source);
   const exportedNames = Object.keys(module.exports.others);
   const exportObject =
      "{\n" +
      exportedNames
         .map((exportName) => {
            const uid = UidTracker.get(module.source, exportName);

            if (!uid) {
               throw new Error(
                  `Failed to get the assigned id for "${name}" in ${module.source}.`
               );
            }

            // Add quotes if not a valid export name
            const isValidName =
               /^[a-z0-9$_]+$/i.test(exportName) && !/^[0-9]+/.test(exportName);
            if (!isValidName) {
               exportName = `"${exportName}"`;
            }

            let line = `${exportName}: () => ${uid}`;
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
