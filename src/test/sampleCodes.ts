export default {
	// prettier-ignore
	"package.json":

`{
   "main": "/",
   "dependencies": {
      "vue": "3.2.0"
   }
}`,

	// prettier-ignore
	"src/index.js":

`import { PI } from "../scripts/PI.js";
import { Circle } from "../scripts/Circle.js";
import pkg from "../package";
import "../styles/main.css";
import App from "./App.vue";
import Comp from "./Comp.vue";
import {createApp} from "vue";
import * as path from "path";
console.log(createApp, path)
console.log(Circle);
console.log(pkg);
export const myPI = PI;`,

	// prettier-ignore
	"scripts/Circle.js":

`import { PI } from "./PI.js";
import confetti from "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js";
setTimeout(() => {
   console.log(confetti);
   confetti();
}, 1000);
import "./Test.js"
export class Circle {
   constructor() {
      this.PI = PI;
   }
}`,

	// prettier-ignore
	"scripts/Test.js":

`
import img from "https://cdn.pixabay.com/photo/2016/04/13/09/19/curious-1326327_960_720.jpg";

import "../styles/main.css";
import {PI} from "./PI.js";
import {num} from "./samplets.ts";

let domimg = document.createElement("img");
domimg.src = img;
document.body.appendChild(domimg);
console.log(img);
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
//import "./Test.js";





console.log("🥧🥧🥧🥧");
export const PI = 3.14;`,

	// prettier-ignore
	"src/App.vue":
      
`<template>
<span>{{greeting}}</span> 
</template>

<script lang="ts" setup>
import { ref } from "vue";
const greeting = ref("Hello world!");
const test: number = 123;
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
   "src/Comp.vue":
      
`<template>
<span>{{greeting}}</span> 
</template>

<script>
export default {
  data() {
    return {
      greeting: 123
    }
  }
}
</script>

<style scoped>

</style>`,

	// prettier-ignore
	/* "styles/mixins.scss":

`@mixin flex {
   display: flex;
   flex-direction: row;
   align-items: center;
}`, */

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
   <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
   <title>cool website!!!!</title>
   <!-- <script>console.log(123);</script> -->
</head>

<body class="theme-test">
   <div id="greet">
      <p>Hello World!</p>
      <div>nested test!</div>
   </div>
</body>

</html>`,
};
