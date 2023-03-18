export default {

   "src/index.js": `
//import "bootstrap/dist/css/bootstrap.min.css";
import pkg from "../package";
console.log(pkg);
import { PI } from "@scripts/PI";
import { stuff } from "@stuff/here/TheStuff";
console.log(PI, stuff);
import confetti from "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js";
console.log(confetti);
import coolImg from "../assets/sample.jpg";
import logo from "../public/logo.svg";
console.log(coolImg, logo);
// import Matter, {Bodies} from "matter-js";
// console.log(Matter, Bodies.rectangle);
//import path, { dirname } from "path";
//console.log(path, dirname("path/to/some/file.txt"));
//import { v4 } from "uuid";
//console.log(v4());
// import fs from "fs";
// console.log(fs);

import "../styles/sampleSass1.scss";
import "../react/main";
import * as Vue from "vue";
import {createApp} from "vue";
console.log(Vue, createApp);
import App from "../vue/App.vue";
createApp(App).mount("#vueroot");
(async() => {
	let dynamicPI = await import("@scripts/PI.js");
	console.log(dynamicPI);
})();`,


   
   "scripts/PI.js": `import Circle from "./Circle";
import coolImage from "https://cdn.pixabay.com/photo/2016/04/13/09/19/curious-1326327_960_720.jpg";
console.log(coolImage);
export const PI = 3.14;`,

   
   
	"scripts/Circle.js": `export default class Circle {}`,
	"styles/colors.css": `:root {
	--accent: yellow;
	--bg: black;
}`,

   
   
	"cool/stuff/here/TheStuff.js": `
import { PI } from "@scripts/PI";
export const stuff = PI + 20;
`,

   
   
	"styles/main.css": `@import "./colors";
html {
	width: 100vw;
	height: 100vh;
}

#greet {
	background-image: url("https://cdn.pixabay.com/photo/2016/04/13/09/19/curious-1326327_960_720.jpg");
}

body {
	color: var(--bg);
}`,
   
	
	
	
	"styles/sampleSass1.scss": `
@import "./sampleSass2";

body {
	background: skyblue;

	p {
		background-image: url("https://cdn.pixabay.com/photo/2016/04/13/09/19/curious-1326327_960_720.jpg");
		font-size: 30px;
		font-weight: bold;
		@include bigRedText;
	}
}
`,
	
	
	
	"styles/sampleSass2.scss": `
@mixin bigRedText {
	font-size: 50px;
	color: red;
}
`,

   
   
	"react/main.jsx": `
import React from "react";
import ReactDOM from 'react-dom/client';
import App from "./App";
const React2 = require("react");
const {default: React3} = require("react");
ReactDOM.createRoot(document.querySelector("#root")).render(
	<App foo="bar"></App>
);
`,

   
   
	"react/App.jsx": `
import { useState, useEffect } from 'react';

export default function App(props) {
	const greet = "Hello react!";
   let [count, setCount] = useState(0);
	useEffect(() => {
		console.log(props);
	}, []);
   return (
      <div className="d-flex flex-column">
         <h1 style={stylesheet.greet}>{ greet + " " + count }</h1>
         <button className="w-100 rounded" onClick={() => setCount(count + 1)}>click me!</button>
      </div>
   )
}

const stylesheet = {
	greet: {
		color: "#47b4c4",
		background: "#26323b",
		padding: 10,
		borderRadius: 5,
		boxShadow: "0 0 10px 5px white"
	}
}
`,

   
     
	"vue/App.vue": `
<template>
<h1 class="vue-theme">Hello vue!</h1>
<button @click="increment">Click me!</button>
<h3>{{counter}}</h3>
</template>

<script lang="ts">
export default {}
console.log(456);
</script>

<script setup lang="ts">
import { ref } from "vue";
var counter = ref(0);
var hello: string = "Hello world!";
function increment() {
	counter.value += 1;
}

console.log(hello);
</script>

<style scoped>
.vue-theme {
	color: #24f05a;
	background: #2a2b30;
}
</style>

<style lang="scss" scoped>
@import "../styles/sampleSass2.scss";
@mixin coolText{
	color: white;
	border: 4px solid gold;
	box-shadow: 0 0 8px 4px yellow;
}

h3 {
	@include coolText;
	@include bigRedText;
}
</style>
`,

   
   
	"index.html":
		`
<!DOCTYPE html>
<html>
<head>
   <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui">
   <title>cool website!!!!</title>
   <script type="text/javascript" src="src/index"></script>
   <link rel="stylesheet" href="styles/main.css"></link>
   <!-- <script>console.log(123);</script> -->
</head>
<body class="theme-test w-100 h-100">
   <div class="d-flex align-items-center justify-content-center" id="greet">
      <p>Hello World!</p>
      <div>nested test!</div>
   </div>
	<div class="w-100 h-100" id="root">
	</div>
	<div class="w-100 h-100" id="vueroot">
	</div>
</body>
</html>`,

   
   
	"package.json": JSON.stringify({
		main: "src/index.js",
		author: "jeff",
	}),



	"assets/sample.jpg": await (
		await fetch(
			"https://cdn.pixabay.com/photo/2016/04/13/09/19/curious-1326327_960_720.jpg"
		)
	).arrayBuffer(),



	"public/logo.svg": "",
};