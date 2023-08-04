import { Binding, NodePath } from "@babel/traverse";
import {
   AssignmentPattern,
   Declaration,
   Identifier,
   Program,
   VariableDeclarator,
} from "@babel/types";
import { ScriptModule } from "src/types";

const scopeMap = new Map<
   string,
   {
      renameMap: Map<string, string>;
      module: ScriptModule;
   }
>();

export function renameId(
   module: ScriptModule,
   oldName: string,
   newName: string
) {
   // console.log(oldName, newName);
   let scope = scopeMap.get(module.source);
   if (!scope) {
      scope = {
         renameMap: new Map(),
         module,
      };
      scopeMap.set(module.source, scope);
   }

   scope.renameMap.set(oldName, newName);

   // binding.referencePaths.forEach((ref) => {
   //    const ids = Object.values(ref.getOuterBindingIdentifiers());
   //    ids.forEach((id) => {
   //       if (id.name === oldName) {
   //          id.name = newName;
   //       }
   //    });
   // });
   // binding.scope.removeOwnBinding(oldName);
   // binding.scope.bindings[newName] = binding;
   // binding.identifier.name = newName;
}

export function startRename(module: ScriptModule) {
   const scope = scopeMap.get(module.source);
   if (!scope) return;
   const { renameMap } = scope;
   module.programPath.traverse({
      ReferencedIdentifier({ node, scope }) {
         const newName = renameMap.get(node.name);
         if (newName /*  && !scope.hasBinding() */) {
            node.name = newName;
         }
      },
      ObjectProperty({ node }) {
         const { name } = node.key as Identifier;
         const newName = renameMap.get(name);
         if (newName && node.shorthand) {
            node.shorthand = false;
            if (node.extra?.shorthand) node.extra.shorthand = false;
         }
      },
      // @ts-ignore
      "AssignmentExpression|Declaration|VariableDeclarator"(
         path: NodePath<AssignmentPattern | Declaration | VariableDeclarator>
      ) {
         if (path.isVariableDeclaration()) return;
         const ids = path.getOuterBindingIdentifiers();
         for (const name in ids) {
            const newName = renameMap.get(name);
            if (newName) {
               ids[name].name = newName;
            }
         }
      },
   });
}
