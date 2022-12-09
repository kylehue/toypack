export default {
	// prettier-ignore
	"package.json":

`{
   "main": "src/index"
}`,

	// prettier-ignore
	"src/index.js":

`import { PI } from "../scripts/PI.js";
import { Circle } from "../scripts/Circle.js";
import pkg from "../package";
// import "../styles/main.css";
// //import App from "./App.vue";
import vue1, {createApp, ref as createRef, reactive} from "vue";
import * as vue2 from "vue";
import vue3, * as vue4 from "vue";
import { "reactive" as createReactive } from "vue";
import { default as vue5 } from "vue";
import vue6 from "vue";
import "vue";
import * as path from "path";

console.log(createRef, createApp, reactive, vue2, vue3, vue4, createReactive, vue5, vue6)
console.log(Circle);
console.log(pkg);
export const myPI = PI;`,

	// prettier-ignore
	"scripts/Circle.js":

`import { PI } from "./PI.js";
//import "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js";
import "./Test.js"
export class Circle {
   constructor() {
      this.PI = PI;
   }
}`,

	// prettier-ignore
	"scripts/Test.js":

`


import "../styles/main.css";
import {PI} from "./PI.js";
import {num} from "./samplets.ts";


console.log(PI, num);




console.log("I'm a test!");`,

	// prettier-ignore
	"scripts/samplets.ts":

`

export const num: number = 127;



console.log(num);`,

	// prettier-ignore
	"scripts/PI.js":

`
import "./Test.js";





console.log("🥧🥧🥧🥧");
export const PI = 3.14;`,

	// prettier-ignore
	"src/App.vue":
      
`<template>
<span>{{greeting}}</span> 
</template>

<script setup>
import { ref } from "vue";
const greeting = ref("Hello world!");
</script>

<style lang="scss" scoped>
@import "../styles/mixins.scss";

body {
   background-color: #333;
   @include flex;

   span {
      color: yellow;
      border: 3px solid black;
   }
}
</style>`,

	// prettier-ignore
	"styles/mixins.scss":

`@mixin flex {
   display: flex;
   flex-direction: row;
   align-items: center;
}`,

	// prettier-ignore
	"styles/colors.css":

`:root {
   --accent: blue;
   --grey: #333;
}`,

	// prettier-ignore
	"styles/main.css":

`@import "./colors.css";
body, html, #app {
   margin: 0;
   background: black;
   color: white;
}

* {
   box-sizing: border-box;
}`,

	// prettier-ignore
	"index.html": 

`<!DOCTYPE html>
<html>

<head>
   <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui">
   <script type="text/javascript" src="src/index.js"></script>
   <link rel="stylesheet" href="styles/main.css"></link>
   <title>cool website!!!!</title>
   <!-- <script>console.log(123);</script> -->
</head>

<body class="theme-test">
   <div id="greet">Hello World!</div>
</body>

</html>`,
};
