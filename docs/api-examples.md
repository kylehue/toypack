---
outline: deep
---

# API Examples

This page demonstrates how to use Toypack.

## run

Starts the bundling process.

-  See [BundleResult Interface](./interfaces#bundleresult)

::: code-group

```ts [example]
const bundleResult = await toypack.run();
```

```ts [typing]
/**
 * @returns A Promise that resolves to the bundle result object.
 */
() => Promise<BundleResult>;
```

:::

## addOrUpdateAsset

Adds or updates an asset.

-  See [Asset Interface](./interfaces#asset)

::: code-group

```ts [example]
toypack.addOrUpdateAsset("/index.js", "console.log(123);");
```

```ts [typing]
/**
 * @param source The source of the asset to add or update.
 * @param content The content of the asset. If the asset doesn't exist yet,
 * this will default to an empty string.
 * @returns The added or updated asset.
 */
(source: string, content?: string | Blob) => Asset;
```

:::

## getAsset

Use this to retrieve an asset by source.

-  See [Asset Interface](./interfaces#asset)

::: code-group

```ts [example]
const asset = toypack.getAsset("/index.js");
```

```ts [typing]
/**
 * @param source The source of the asset to retrieve.
 * @returns The asset that matches the source or null if none.
 */
(source: string) => Asset | null;
```

:::

## removeAsset

Removes an asset by source.

::: code-group

```ts [example]
toypack.removeAsset("/index.js");
```

```ts [typing]
/**
 * @param source The source of the asset to remove.
 */
(source: string) => void
```

:::

## removeDirectory

Removes a directory and returns all the assets the has been removed.

::: code-group

```ts [example]
toypack.removeDirectory("/src");
```

```ts [typing]
/**
 * @param source The source of the directory to remove.
 * @returns An array containing the removed assets.
 */
(source: string) => Asset[]
```

:::

## moveAsset

Moves an asset to another source and returns the moved asset.

::: warning IMPORTANT NOTE
Under the hood, this method deletes and re-adds the asset. So the old asset object won't be equal to the new asset object.
:::

::: code-group

```ts [example]
toypack.moveAsset("/index.js", "/src/index.js");
```

```ts [typing]
/**
 * @param oldSource The source of the asset to move.
 * @param newSource The target source.
 * @returns The asset that has been moved or undefined if nothing is moved.
 */
(oldSource: string, newSource: string) => Asset | undefined;
```

:::

## moveDirectory

Moves a directory and returns all the assets that has been moved.

::: code-group

```ts [example]
toypack.moveDirectory("/src", "/");
```

```ts [typing]
/**
 * @param oldSource The source of the directory to move.
 * @param newSource The target source.
 * @returns An array containing the descriptors of the assets that has
 * been moved.
 */
(oldSource: string, newSource: string) => {
   oldSource: string;
   newSource: string;
   asset: Asset;
}[]
```

:::

## getAssetSources

Use this to retrieve all of the existing assets' sources.

::: code-group

```ts [example]
import type { Asset } from "toypack/types";

const assetSources = toypack.getAssetSources();

// Get all assets
const assets: Record<string, Asset> = {};
for (const source of assetSources) {
   assets[source] = toypack.getAsset(source)!;
}
```

```ts [typing]
/**
 * @returns An array containing the sources of the existing assets.
 */
() => string[]
```

:::

## clearAssets

Removes all of the assets and clears the cache.

::: code-group

```ts [example]
toypack.clearAssets();
```

```ts [typing]
() => void
```

:::

## getPackageProviders

Use this to retrieve all of the registered package providers.

-  See [PackageProvider Interface](./interfaces#packageprovider)

::: code-group

```ts [example]
const providers = toypack.getPackageProviders();
```

```ts [typing]
/**
 * @returns The package providers.
 */
() => PackageProvider[]
```

:::

## usePackageProvider

Adds a package provider.

-  See [PackageProvider Interface](./interfaces#packageprovider)

::: code-group

```ts [example]
toypack.usePackageProvider({
   host: "cdn.skypack.dev",
   /* ... */
});
```

```ts [typing]
/**
 * @param provider The package provider.
 * @param isMainProvider Set to true to always use this provider first.
 * Defaults to false.
 */
(provider: PackageProvider, isMainProvider?: boolean) => void
```

:::

## installPackage

Installs a package from NPM using the registered package providers.

::: warning IMPORTANT NOTE
This isn't the same as node where it installs all of the package's dependencies. It simply uses `fetch` to get the contents of the package from providers such as esm.sh or jsdelivr and adds it to the assets. This means that if you only fetch "bootstrap", deeper imports like "bootstrap/dist/css/bootstrap.min.css" won't be available. To use such subpackages, you'd need to "install" them seperately.
:::

::: code-group

```ts [example]
toypack.installPackage("react");
```

```ts [typing]
/**
 * @param packagePath The path of the package to install.
 * @param version The version of the package. Defaults to "latest".
 * @returns A Promise that resolves to the installed package.
 */
(packagePath: string, version?: string) =>
   Promise<{
      name: string;
      version: string;
      subpath: string;
      assets: PackageAsset[];
      dtsAssets: PackageAsset[];
   } | null>;
```

:::

## usePlugin

Add a plugin.

::: code-group

```ts [example]
import samplePlugin from "sample-plugin";

toypack.usePlugin(samplePlugin());
```

```ts [typing]
/**
 * @param plugin The plugin to add.
 * @returns The added plugin.
 */
(plugin: Plugin) => Plugin;
```

:::

## removePlugin

Removes a plugin. Note that you must pass in the plugin object itself to remove it.

::: warning IMPORTANT NOTE
This will not remove the extensions that was added by the plugin.
:::

::: code-group

```ts [example]
import samplePlugin from "sample-plugin";

const samplePluginInit = toypack.usePlugin(samplePlugin());
toypack.removePlugin(samplePluginInit);
```

```ts [typing]
/**
 * @param plugin The plugin to remove.
 */
(plugin: Plugin) => void
```

:::

## setConfig

Use this to change the Toypack config.

-  See [ToypackConfig Interface](./interfaces#toypackconfig)

::: code-group

```ts [example]
toypack.setConfig({
   bundle: {
      mode: "production",
   },
});
```

```ts [typing]
/**
 * @param config The Toypack config.
 */
(config: Partial<ToypackConfig>) => void
```

:::

## resetConfig

Sets the Toypack's config back to its defaults.

::: code-group

```ts [example]
toypack.resetConfig();
```

```ts [typing]
() => void
```

:::

## resolve

Get the absolute path of the given source path. The source path can be a relative path or a package name.

-  See [ResolveOptions Interface](./interfaces#resolveoptions)

::: info
This function imitates node's [`require.resolve`](https://nodejs.org/api/modules.html#all-together) algorithm but with a few adjustments.
:::

::: code-group

```ts [example]
/**
 * let's say for example these paths exists:
 *
 * /classes/foo.js
 * /node_modules/pkg/index.js
 */

// resolve a relative path
toypack.resolve("../classes/foo"); // null
toypack.resolve("../classes/foo", { baseDir: "src" }); // /classes/foo.js
toypack.resolve("/classes/foo"); // /classes/foo.js

// resolve a package name
toypack.resolve("a"); // null
toypack.resolve("pkg"); // /node_modules/pkg/index.js
```

```ts [typing]
/**
 * @param source The source path to resolve.
 * @param options Optional resolve options.
 * @returns The resolved absolute path, or null if it doesn't exist.
 */
(source: string, options?: Partial<ResolveOptions>) => string | null;
```

:::

## setIFrame

Adds an IFrame element to use for displaying the bundle's result everytime you run in development mode.

::: code-group

```ts [example]
const iframe = document.querySelector("iframe#sandbox")!;
toypack.setIFrame(iframe);
```

```ts [typing]
/**
 * @param iframe The iframe element to use.
 */
(iframe: HTMLIFrameElement) => void
```

:::

## unsetIFrame

Unsets the IFrame element.

::: code-group

```ts [example]
toypack.unsetIFrame();
```

```ts [typing]
() => void
```

:::

## clearCache

Removes all the cached compilations. Useful when you want to do a hard-run.

::: info

This function always gets called everytime you use the following:

-  [clearAssets](#clearassets)
-  [usePlugin](#useplugin)
-  [removePlugin](#removeplugin)
-  [setConfig](#setconfig) _(only when something important has changed)_

:::

::: code-group

```ts [example]
toypack.clearCache();
```

```ts [typing]
() => void
```

:::

## getLastBundleResult

Use this to retrieve the last bundle result.

-  See [BundleResult Interface](./interfaces#bundleresult)

::: code-group

```ts [example]
toypack.getLastBundleResult();
```

```ts [typing]
/**
 * @returns The bundle result object.
 */
() => BundleResult;
```

:::

## Hooks

Everything below will show you how to use hooks.

### onError

Triggered when an error occurs.

::: code-group

```ts [example]
toypack.onError((error) => {
   console.log(error.reason);
});
```

```ts [typing]
(callback: (error: Error) => void) => void;
```

:::

```ts
interface Error {
   code: number;
   reason: string;
}
```

### onAddOrUpdateAsset

Triggered everytime an asset gets added or updated.

-  See [Asset Interface](./interfaces#asset)

::: code-group

```ts [example]
toypack.onAddOrUpdateAsset((asset) => {
   console.log(asset);
});
```

```ts [typing]
(callback: (asset: Asset) => void) => void;
```

:::

### onRemoveAsset

Triggered everytime an asset gets removed.
::: info
Since the [moveAsset](#moveasset) uses [removeAsset](#removeasset) under the hood, this will also be triggered when moveAsset is called.
:::

-  See [Asset Interface](./interfaces#asset)

::: code-group

```ts [example]
toypack.onRemoveAsset((asset) => {
   console.log(asset);
});
```

```ts [typing]
(callback: (asset: Asset) => void) => void;
```

:::

### onInstallPackage

Triggered everytime a package gets installed.

::: code-group

```ts [example]
toypack.onInstallPackage((packageInfo) => {
   console.log(packageInfo);
});
```

```ts [typing]
(callback: (packageInfo: PackageInfo) => void) => void;
```

:::

```ts
interface PackageInfo {
   name: string;
   version: string;
   subpath: string;
   assets: PackageAsset[];
   dtsAssets: PackageAsset[];
}
```

### onResolve

Triggered when a module gets resolved.

::: code-group

```ts [example]
toypack.onResolve((resolveInfo) => {
   console.log(resolveInfo);
});
```

```ts [typing]
(callback: (resolveInfo: ResolveInfo) => void) => void;
```

:::

```ts
interface ResolveInfo {
   rawRequest: string;
   request: string;
   params: Record<string, string | boolean>;
   resolved: string;
   parent: string;
}
```

### onRun

Triggered every bundle execution.

-  See [BundleResult Interface](./interfaces#bundleresult)

::: code-group

```ts [example]
toypack.onRun((bundleResult) => {
   console.log(bundleResult);
});
```

```ts [typing]
(callback: (bundleResult: BundleResult) => void) => void;
```

:::
