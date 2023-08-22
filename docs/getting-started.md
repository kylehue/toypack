# Getting started

This page demonstrates how to install Toypack.

## Installation

**NPM**

```shell
npm install toypack;
```

::: warning
If you're opting for the npm installation (as you should) instead of using the CDN version, please ensure you add polyfills for `path`, `fs`, `process`, and `Buffer` to avoid any issues.
:::

**CDN**

```html
<script src="https://jsdelivr.com/package/npm/toypack"></script>
```

## Basic Usage

```ts
import { Toypack } from "toypack";
const toypack = new Toypack();

// Add assets
toypack.addOrUpdateAsset("/index.js", "console.log(123);");

// Run
const result = await toypack.run();
console.log(result.js.content);
```
