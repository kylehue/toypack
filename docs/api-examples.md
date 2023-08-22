---
outline: deep
---

# API Examples

This page demonstrates how to use Toypack.

## addOrUpdateAsset

Adds or updates an asset.

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

## getPackageProviders

Use this to retrieve all of the registered package providers.

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

## usePackageProvider

Adds a package provider.

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
