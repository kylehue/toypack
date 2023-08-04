import { Binding, NodePath, Scope } from "@babel/traverse";
import {
   AssignmentPattern,
   Declaration,
   Identifier,
   VariableDeclarator,
} from "@babel/types";
import { ScriptModule } from "src/types";

const scopeMap = new Map<
   string,
   {
      renameMap: Map<
         string,
         {
            oldName: string;
            newName: string;
            binding: Binding;
         }
      >;
      module: ScriptModule;
   }
>();

export function renameBinding(
   module: ScriptModule,
   binding: Binding,
   newName: string
) {
   const oldName = binding.identifier.name;
   let scope = scopeMap.get(module.source);
   if (!scope) {
      scope = {
         renameMap: new Map(),
         module,
      };
      scopeMap.set(module.source, scope);
   }

   scope.renameMap.set(oldName, {
      binding,
      oldName,
      newName,
   });
}

function shouldBeRenamed(
   name: string,
   scope: Scope,
   mappedBinding: Binding | null
) {
   if (!mappedBinding) return false;
   const binding = scope.getBinding(name);
   if (!binding) return false;
   if (binding !== mappedBinding) return false;
   return true;
}

export function beginRename(module: ScriptModule) {
   const scope = scopeMap.get(module.source);
   if (!scope) return;
   const { renameMap } = scope;
   module.programPath.traverse({
      ReferencedIdentifier(path) {
         const { node, scope } = path;
         const name = node.name;
         const mapped = renameMap.get(name);
         if (!mapped) return;
         if (!shouldBeRenamed(name, scope, mapped.binding)) {
            return;
         }

         node.name = mapped.newName;
      },
      ObjectProperty(path) {
         const { node, scope } = path;
         const { name } = node.key as Identifier;
         const mapped = renameMap.get(name);
         if (!mapped) return;
         if (!shouldBeRenamed(name, scope, mapped.binding)) {
            return;
         }
         node.shorthand = false;
         if (node.extra?.shorthand) node.extra.shorthand = false;
      },
      // @ts-ignore
      "AssignmentExpression|Declaration|VariableDeclarator"(
         path: NodePath<AssignmentPattern | Declaration | VariableDeclarator>
      ) {
         if (path.isVariableDeclaration()) return;
         const ids = path.getOuterBindingIdentifiers();
         for (const name in ids) {
            const mapped = renameMap.get(name);
            if (!mapped) continue;
            if (!shouldBeRenamed(name, path.scope, mapped.binding)) {
               continue;
            }

            ids[name].name = mapped.newName;
         }
      },
   });
}
