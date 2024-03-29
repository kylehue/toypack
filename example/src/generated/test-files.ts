export default {
"/classes/adder.js": (await import("../../test-files/classes/adder.js?raw")).default,
"/classes/createNum.js": (await import("../../test-files/classes/createNum.js?raw")).default,
"/classes/createNum2.js": (await import("../../test-files/classes/createNum2.js?raw")).default,
"/images/cat.png": await (await fetch(new URL("../../test-files/images/cat.png", import.meta.url).href)).blob(),
"/images/kitty-cat-sandwich.gif": await (await fetch(new URL("../../test-files/images/kitty-cat-sandwich.gif", import.meta.url).href)).blob(),
"/index.html": (await import("../../test-files/index.html?raw")).default,
"/package.json": (await import("../../test-files/package.json?raw")).default,
"/react/App.jsx": (await import("../../test-files/react/App.jsx?raw")).default,
"/react/index.jsx": (await import("../../test-files/react/index.jsx?raw")).default,
"/src/main.ts": (await import("../../test-files/src/main.ts?raw")).default,
"/src/module.js": (await import("../../test-files/src/module.js?raw")).default,
"/src/testing.mjs": (await import("../../test-files/src/testing.mjs?raw")).default,
"/styles/mixins.scss": (await import("../../test-files/styles/mixins.scss?raw")).default,
"/styles/sample.css": (await import("../../test-files/styles/sample.css?raw")).default,
"/styles/sample.sass": (await import("../../test-files/styles/sample.sass?raw")).default,
"/videos/cat-milk.mp4": await (await fetch(new URL("../../test-files/videos/cat-milk.mp4", import.meta.url).href)).blob(),
"/vue/App.vue": (await import("../../test-files/vue/App.vue?raw")).default,
"/vue/Comp.vue": (await import("../../test-files/vue/Comp.vue?raw")).default,
"/vue/index.ts": (await import("../../test-files/vue/index.ts?raw")).default,

}