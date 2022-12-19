# Toypack
#### A sandbox bundler for browsers.

Toypack is a library for bundling codes in the browser. It is particularly useful for creating code playgrounds and sandboxes like Codepen or CodeSandbox, as it allows developers to easily package and organize codes for testing and experimentation.

### Installation
```bash
npm i toypack
```

### Usage
```js
import Toypack from "toypack";

let toypack = new Toypack(/* options */);

toypack.bundle().then(code => {
   // do something
});
```