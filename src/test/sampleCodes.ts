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
//import App from "./App.vue";
import mainCSS from "../styles/main.css";
console.log(Circle);
console.log(mainCSS);
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


const mainCSS = require("../styles/main.css");
const PI = require("./PI.js");


console.log(mainCSS);



console.log(PI);




console.log("I'm a test!");`,

	// prettier-ignore
	"scripts/PI.js":

`
require("./Test.js");





console.log("🥧🥧🥧🥧");
exports.PI = 3.14;`,

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
body {
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
