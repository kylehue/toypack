---
outline: deep
---

# Plugin API

This page demonstrates how to create your own plugin.

## Example of a plugin

```ts
function coolPlugin() {
   return {
      name: "cool-plugin",
      load() {
         // do something
      },
      // you can also change how the hook will be handled by doing this:
      load: {
         /**
          * Use this option to change the hook's order.
          * Set to "pre" if you want it to be first, and "post" if last.
          */
         order: "pre",
         /**
          * Set to true if you want it to be asynchronous.
          * @default false
          */
         async: false,
         /**
          * Set to false if you don't want this hook to chain with other
          * hooks.
          * @default true
          */
         chaining: true,
         handler() {
            // do something
         },
      },
   };
}
```

## Hooks

Below shows you the different types of plugin hooks.

### load

Allows custom handling for module loading, similar to webpack's loader system. Use this hook to define how specific types of modules are processed before they are added to the bundle.

**Type**

```ts
(this: PluginContext, moduleInfo: ModuleInfo) => LoadResult | string | void
```

**ModuleInfo Interface**

```ts
type ModuleInfo = ModuleInfoText | ModuleInfoResource;

interface ModuleInfoText {
   type: "script" | "style";
   source: string;
   content: string;
   map?: EncodedSourceMap | null;
   isEntry: boolean;
}

interface ModuleInfoResource {
   type: "resource";
   source: string;
   content: Blob;
   isEntry: boolean;
}
```

**LoadResult Interface**

```ts
type LoadResult = LoadTextResult | LoadResourceResult;

interface LoadTextResult {
   type?: "script" | "style";
   content: string;
   map?: EncodedSourceMap | null;
}

interface LoadResourceResult {
   type?: "resource";
   content: Blob;
}
```

### resolve

Use this hook to change where a module points to or just to check out which modules are being used.

**Type**

```ts
/**
 * @param id The request that is being resolved.
 */
(this: PluginContext, id: string) => string | void
```

### transform

Use this hook to transform script modules.

-  See [@babel/traverse](https://babeljs.io/docs/babel-traverse) for `TraverseOptions`
-  See [@babel/types](https://babeljs.io/docs/babel-types) for `File`

**Type**

```ts
(
   this: PluginContext,
   source: string,
   content: string,
   ast: File
) => TraverseOptions | void
```

### transformStyle

Use this hook to transform style modules.

-  See [csstree documentation](https://github.com/csstree/csstree/blob/master/docs/ast.md) for more info.

**Type**

```ts
(
   this: PluginContext,
   source: string,
   content: string,
   ast: CssNode
) => EnterOrLeaveFn<CssNode> | WalkOptions | void
```

### transformHtml

Use this hook to transform the main html.

-  See [node-html-parser](https://github.com/taoqf/node-html-parser) for `HTMLElement`, `TextNode`, `CommentNode`.

**Type**

```ts
/**
 * @param ast The parsed html.
 * @param indexScriptUrl The url of the bundled script.
 * @param indexStyleUrl The url of the bundled style.
 */
(
   this: PluginContextBase,
   ast: HTMLElement,
   indexScriptUrl: string,
   indexStyleUrl: string
) => TraverseHtmlOptions | void;
```

**TraverseHtmlOptions Interface**

```ts
interface TraverseHtmlOptions {
   Comment?: (node: CommentNode) => void;
   Element?: (node: HTMLElement) => void;
   Text?: (node: TextNode) => void;
   /**
    * string represents the tagname in PascalCase.
    * So if you want to scan for Span elements, add "SpanElement".
    */
   `${string}Element`: (node: HTMLElement) => void;
}
```

### buildStart

This hook is triggered at the very start of the bundling process.

**Type**

```ts
(this: PluginContextBase) => void
```

### buildEnd

This hook is triggered at the very end of the bundling process.

-  See [BundleResult Interface](./interfaces.md#bundleresult)

**Type**

```ts
(this: PluginContextBase, bundleResult: BundleResult) => void
```

### parsed

This hook is triggered whenever a module gets parsed.

**Type**

```ts
(this: PluginContext, parseInfo: ParseInfo) => void
```

**ParseInfo Interface**

```ts
type ParseInfo = ScriptParseInfo | StyleParseInfo;

interface ScriptParseInfo {
   type: "script";
   chunk: ScriptModule;
   parsed: ParsedScriptResult;
}

interface StyleParseInfo {
   type: "style";
   chunk: StyleModule;
   parsed: ParsedStyleResult;
}
```

### setup

Use this to setup things in the bundler. This hook only gets triggered once, and it's when the plugin gets added to the bundler.

**Type**

```ts
(this: PluginContextBase) => void
```

## Context

Every hook mentioned earlier comes with a context. This context provides details about the current module and includes some handy utility functions.

```ts
interface PluginContextBase {
   bundler: Toypack;
   cache: Map<any, any>;
   /**
    * Convert a resource's source path to a useable source path.
    * If in development mode, the resource path will become a blob url.
    * If in production mode, the resource path will have a unique hash as
    * its basename.
    */
   getUsableResourcePath: (source: string, baseDir: string) => string | null;
   /** Constructs an import code using the provided request and specifiers. */
   getImportCode: (
      request: string,
      specifiers?: (SpecifierOptions | string)[]
   ) => string;
   /**
    * Returns the default export code.
    * - e.g. `export default ... ;` or `module.exports = ... ;`
    */
   getDefaultExportCode: (exportCode: string) => string;
   /** Emits an error message. */
   emitError: (message: string) => void;
   /** Emits a warning message. */
   emitWarning: (message: string) => void;
   /** Emits an info message. */
   emitInfo: (message: string) => void;
}

interface PluginContext extends PluginContextBase {
   graph: DependencyGraph;
   /** Returns the modules that imported the current module. */
   getImporters: () => Importers;
   /**
    * Returns the module that imported the current module. If it's the
    * entry, then it will return undefined.
    */
   getCurrentImporter: () => ScriptModule | StyleModule | undefined;
   /** Returns true if the current module should have source maps or not. */
   shouldMap: () => boolean;
   /** Pre-loads an asset. */
   load: (source: string) => Promise<LoadResult>;
}
```