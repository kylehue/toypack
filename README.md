# Toypack

### A sandbox bundler for browsers.

Toypack is a library for bundling codes in the browser. It is particularly useful for creating JS playgrounds like Codepen or CodeSandbox.

### Supported Languages
 - JavaScript
 - HTML
 - CSS
 - TypeScript
 - Sass
 - JSX
 - Vue
 - JSON

### Features
 - Package Manager
 - Source maps
 - Caching
 - Plugins

### Limitations
 - Code-splitting
 - Tree shaking
 - Web workers

### Installation

```bash
npm i toypack
```

### Usage

```js
import Toypack from "toypack";

let toypack = new Toypack(/* options */);

toypack.bundle().then((code) => {
   // do something
});
```

### API
 - [`addAsset`](#addasset)
 - [`bundle`](#bundle)
 - [`defineOptions`](#defineoptions)
 - [`use`](#use)

### `addAsset`
Adds an asset to the bundler.

#### Type
```ts
(source: string, content?: string | ArrayBuffer, options?: AssetOptions) => Promise<Asset>;
```
#### Example
```js
toypack.addAsset("src/index.js", "console.log('Hello World!');");
```
or if you want to add an external asset, do this:
```js
await toypack.addAsset(/* CDN Link */);
```

### `bundle`
Bundles the assets starting from the entry point.

#### Type
```ts
(options?: BundleOptions) => Promise<BundleResult>;
```
#### Example
```js
toypack.bundle({
   mode: "production"
});
```

### `defineOptions`
Modify the Toypack options.

#### Type
```ts
(options?: ToypackOptions) => void;
```
#### Example
```js
toypack.defineOptions({
   bundleOptions: {
      mode: "development"
   }
});
```

### `use`
Add a plugin.

#### Type
```ts
(plugin: ToypackPlugin) => void;
```
#### Example
```js
toypack.use(/* plugin */);
```

### Loaders
Please note that Babel, Vue, and Sass loaders are not included in the default set of loaders to optimize initial page load times. It is more efficient to include these loaders only when they are needed, rather than including them all at once. Example below shows how to add a loader:

```js
async function sassIsNeeded() {
   // Import dinamically
   let sassLoader = await import("toypack/lib/SassLoader.js");
   toypack.loaders.push(sassLoader);
}
```