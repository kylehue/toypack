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
import confetti from "canvas-confetti";
import * as uuid from "uuid";
import "../styles/main.css";
//import App from "./App.vue";
import pkg from "../package";
console.log(Circle);
console.log(pkg);
console.log(confetti);
console.log(uuid);
setTimeout(() => {
   console.log("%c CONGRATS!!", "color: yellow;");
   confetti();
}, 1000);
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
