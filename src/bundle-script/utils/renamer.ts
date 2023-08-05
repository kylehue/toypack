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

type ScopeMapValue = typeof scopeMap extends Map<string, infer V> ? V : never;
type RenameMapValue = ScopeMapValue["renameMap"] extends Map<string, infer V>
   ? V
   : never;

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
   mapped: RenameMapValue | null
) {
   if (!mapped) return false;
   const binding = scope.getBinding(name);
   if (!binding) return false;
   if (binding !== mapped.binding) return false;
   if (name === mapped.newName) return false;
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
         if (!shouldBeRenamed(name, scope, mapped)) {
            return;
         }

         node.name = mapped.newName;
      },
      ObjectProperty(path) {
         const { node, scope } = path;
         const { name } = node.key as Identifier;
         const mapped = renameMap.get(name);
         if (!mapped) return;
         if (!shouldBeRenamed(name, scope, mapped)) {
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
            if (!shouldBeRenamed(name, path.scope, mapped)) {
               continue;
            }

            ids[name].name = mapped.newName;
         }
      },
   });

   for (const [_, { binding, newName, oldName }] of renameMap) {
      const scope = binding.scope;
      scope.removeOwnBinding(oldName);
      scope.bindings[newName] = binding;
      binding.identifier.name = newName;
   }
}
