# Toypack

### The sandbox bundler for static sites.

Toypack is a library for bundling codes in the browser. It is particularly useful for creating JS playgrounds like Codepen or CodeSandbox.

[Read full documentation here](https://kylehue.github.io/toypack)


## Installation

**NPM**

```shell
npm install toypack;
```

**IMPORTANT NOTE:** If you're opting for the npm installation (as you should) instead of using the CDN version, please ensure you add polyfills for `path`, `fs`, `process`, and `Buffer` to avoid any issues.

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
