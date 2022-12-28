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
import "../styles/sasstest.scss";
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
import Sampletsx2 from "./sampletsx2.tsx";
import React from "react";
import ReactDOM from "react-dom";
console.log(ReactDOM);
ReactDOM.render(
   <React.StrictMode>
	<Sampletsx2></Sampletsx2>
   </React.StrictMode>,
   document.querySelector("body")
);
let domimg = document.createElement("img");
domimg.src = img;
document.body.appendChild(domimg);
console.log(img);
console.log(PI);
console.log("I'm a test!");`,

	// prettier-ignore
	"scripts/sampletsx.tsx":

`
import React from "react";
import {useState} from "react";
export const num: number = 127;
export default function Sampletsx() {
   const greet: string = "hello!";
   let [count, setCount] = useState(0);
   return (
      <div>
         <span>{greet + " " + count}</span>
         <button onClick={() => setCount(count + 1)}>click me!</button>
      </div>
   )
}
console.log(num);`,

	// prettier-ignore
	"scripts/sampletsx2.tsx":

`
import React from "react";
import Sampletsx from "./sampletsx.tsx";
export default function Sampletsx2() {
   return (
      <Sampletsx>
      </Sampletsx>
   )
}`,

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
//@import "../styles/mixins.scss";
body {
   background-color: #333;
   //@include flex;
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
	"styles/sasstest.scss":

`@import "./mixins";
@import "https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css";
@function pow($base, $exponent) {
  $result: 1;
  @for $_ from 1 through $exponent {
    $result: $result * $base;
  }
  @return $result;
}
body {
   @include flex;
   background-color: #333;
   margin-left: pow(4, 3) * 1px;
   p {
      color: yellow;
      border: 3px solid black;
   }
}
`,

	// prettier-ignore
	"styles/mixins.scss":

`@mixin flex {
   background: green !important;
   display: flex;
   flex-direction: row;
   align-items: center;
}
p { color: purple; }`,

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
   <div id="greet">
      <p>Hello World!</p>
      <div>nested test!</div>
   </div>
   <div id="root">
      
   </div>
</body>
</html>`,
};