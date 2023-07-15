import traverse, { NodePath, TraverseOptions, Scope } from "@babel/traverse";
import * as t from "@babel/types";

let takenVars: {
   scopeId: string;
   value: string;
   path: NodePath;
}[] = [];

export function reset() {
   takenVars = [];
}

function getKind(decl: NodePath<t.Node> | null) {
   if (!decl) return "var";
   if (!t.isVariableDeclaration(decl.node)) return "var";
   const kind =
      decl.node.kind != "await using" && decl.node.kind != "using"
         ? decl.node.kind
         : "var";

   return kind;
}

export function initialize(
   scopeId: string,
   ast: t.File,
   traverseFn?: (options: TraverseOptions) => void
) {
   const options: TraverseOptions = {
      Identifier(path) {
         // Only deconflict top-level vars
         if (path.find((a) => a.isFunctionDeclaration())) {
            return;
         }

         const { node } = path;
         let { name } = node;
         const dupe = takenVars.find(
            (f) => f.value === name && f.scopeId !== scopeId
         );
         if (dupe) {
            name = path.scope.generateUid(name);
            path.scope.rename(node.name, name);
            if (!dupe.path.scope.hasBinding(node.name)) {
               const varDecl = path.find((a) => a.isVariableDeclaration());
               const kind = getKind(varDecl);
               dupe.path.scope.registerBinding(kind, path);
            }
         }

         takenVars.push({
            scopeId,
            value: name,
            path: path,
         });
      },
   };

   if (traverseFn) {
      traverseFn(options);
   } else {
      traverse(ast, options);
   }
}
