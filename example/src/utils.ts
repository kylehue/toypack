import * as monaco from "monaco-editor";
import path from "path-browserify";

export function switchModelToNewUri(
   oldModel: monaco.editor.IModel,
   newUri: monaco.Uri
) {
   const newModel = monaco.editor.createModel(
      oldModel.getValue(),
      getLang(newUri.path),
      newUri
   );

   const fsPath = newUri.fsPath; // \\filename
   const formatted = newUri.toString(); // file:///filename

   // @ts-ignore
   const editStacks = oldModel._commandManager._undoRedoService._editStacks;

   const newEditStacks = new Map();

   function adjustEditStack(c: any) {
      c.actual.model = newModel;
      c.resourceLabel = fsPath;
      c.resourceLabels = [fsPath];
      c.strResource = formatted;
      c.strResources = [formatted];
   }

   editStacks.forEach((s: any) => {
      s.resourceLabel = fsPath;
      s.strResource = formatted;

      s._future.forEach(adjustEditStack);
      s._past.forEach(adjustEditStack);

      newEditStacks.set(formatted, s);
   });

   // @ts-ignore
   newModel._commandManager._undoRedoService._editStacks = newEditStacks;

   oldModel.dispose();

   return newModel;
}

const languages: Record<string, string> = {
   txt: "plaintext",
   html: "html",
   css: "css",
   sass: "scss",
   scss: "scss",
   js: "typescript",
   mjs: "typescript",
   cjs: "typescript",
   jsx: "typescript",
   ts: "typescript",
   mts: "typescript",
   cts: "typescript",
   tsx: "typescript",
   json: "json",
   vue: "vue",
};

export function getLang(str: string) {
   let ext = path.extname(str);

   return languages[ext.substring(1)] || "plaintext";
}
