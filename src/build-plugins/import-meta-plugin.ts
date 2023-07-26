import { Plugin, PluginContext, Toypack } from "../types.js";
import { NodePath } from "@babel/traverse";
import {
   stringLiteral,
   MemberExpression,
   CallExpression,
   arrowFunctionExpression,
   callExpression,
   isMemberExpression,
   isMetaProperty,
   isStringLiteral,
   nullLiteral,
} from "@babel/types";
import { dirname } from "path-browserify";
import { PluginContextBase } from "src/plugin/hook-types.js";

function transformMetaResolve(
   this: PluginContextBase,
   chunkSource: string,
   path: NodePath<CallExpression>
) {
   const callee = path.node.callee;
   if (!isMemberExpression(callee)) return;
   const isResolve =
      callee.property.type == "Identifier" && callee.property.name == "resolve";
   const isImportMeta =
      isMetaProperty(callee.object) &&
      callee.object.meta.type == "Identifier" &&
      callee.object.meta.name == "import";
   if (!isImportMeta || !isResolve) return;
   const args = path.node.arguments;
   const source = args[0];
   const parent = args[1];
   if (!isStringLiteral(source) || !(!parent || isStringLiteral(parent))) {
      this.emitError("import.meta.resolve() must have arguments in string.")
      return;
   }
   const resolved = this.bundler.resolve(source?.value, {
      baseDir: dirname(parent?.value || chunkSource),
   });
   let replacement = resolved
      ? stringLiteral(`file://${resolved}`)
      : nullLiteral();
   path.replaceWith(
      callExpression(arrowFunctionExpression([], replacement), [])
   );
}

function transformMetaUrl(path: NodePath<MemberExpression>, source: string) {
   const { node } = path;
   if (
      node.object.type != "MetaProperty" ||
      node.object.meta.name != "import" ||
      node.object.property.name != "meta" ||
      node.property.type != "Identifier"
   ) {
      return;
   }

   if (node.property.name == "url") {
      path.replaceWith(stringLiteral(`file://${source}`));
   }
}

export default function (): Plugin {
   return {
      name: "import-meta-plugin",
      transform(context) {
         if (context.type != "script") return;
         context.traverse({
            MemberExpression(path) {
               transformMetaUrl(path, context.source);
            },
            CallExpression: (path) => {
               transformMetaResolve.call(this, context.source, path);
            },
         });
      },
   };
}
