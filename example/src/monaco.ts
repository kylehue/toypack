import * as monaco from "monaco-editor";

self.MonacoEnvironment = {
   async getWorker(_, label) {
      let worker;

      switch (label) {
         case "json":
            worker = await import(
               "monaco-editor/esm/vs/language/json/json.worker?worker"
            );
            break;
         case "css":
         case "scss":
         case "less":
            worker = await import(
               "monaco-editor/esm/vs/language/css/css.worker?worker"
            );
            break;
         case "html":
         case "handlebars":
         case "razor":
            worker = await import(
               "monaco-editor/esm/vs/language/html/html.worker?worker"
            );
            break;
         case "typescript":
         case "javascript":
            worker = await import(
               "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
            );
            break;
         default:
            worker = await import(
               "monaco-editor/esm/vs/editor/editor.worker?worker"
            );
      }

      return new worker.default();
   },
};

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

const opts: monaco.editor.IStandaloneEditorConstructionOptions = {
   theme: "vs-dark",
   wordWrap: "on",
   model: null,
   roundedSelection: true,
   automaticLayout: true,
   autoIndent: "advanced",
   autoClosingBrackets: "languageDefined",
   autoClosingDelete: "auto",
   autoClosingQuotes: "languageDefined",
   autoSurround: "languageDefined",
   codeLens: true,
   detectIndentation: false,
   formatOnPaste: false,
   formatOnType: false,
   insertSpaces: true,
   lineNumbers: "on",
   matchBrackets: "always",
   mouseWheelScrollSensitivity: 1,
   mouseWheelZoom: true,
   scrollBeyondLastLine: true,
   renderWhitespace: "selection",
   showDeprecated: true,
   smoothScrolling: false,
   tabCompletion: "on",
   tabSize: 4,
   wrappingIndent: "indent",
};

monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
   target: monaco.languages.typescript.ScriptTarget.ES2020,
   moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
   module: monaco.languages.typescript.ModuleKind.ESNext,
   jsx: monaco.languages.typescript.JsxEmit.None,
   skipLibCheck: true,
   esModuleInterop: true,
   allowSyntheticDefaultImports: true,
   forceConsistentCasingInFileNames: true,
   resolveJsonModule: true,
   allowJs: true,
   strict: true,
   allowNonTsExtensions: true,
});

const container = document.querySelector(".container-monaco") as HTMLElement;
const editor = monaco.editor.create(container, opts);

export { editor };
