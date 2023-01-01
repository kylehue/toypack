export default {

   "src/index.js": `

import "bootstrap/dist/css/bootstrap.min.css";
import "../react/main"
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
import path, { dirname } from "path";
console.log(path, dirname("path/to/some/file.txt"));
import { v4 } from "uuid";
console.log(v4());
import fs from "fs";
console.log(fs);
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
	const greet = "Hello world!";
   let [count, setCount] = useState(0);
	useEffect(() => {
		console.log(props);
	}, []);
   return (
      <div className="d-flex flex-column">
         <h1>{ greet + " " + count }</h1>
         <button className="w-100 rounded" onClick={() => setCount(count + 1)}>click me!</button>
      </div>
   )
}
`,

   
   
	"index.html":
		'\
<!DOCTYPE html>\
<html>\
<head>\
   <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui">\
   <script type="text/javascript" src="src/index.js"></script>\
   <link rel="stylesheet" href="styles/main.css"></link>\
   <title>cool website!!!!</title>\
   <!-- <script>console.log(123);</script> -->\
</head>\
<body class="theme-test w-100 h-100">\
   <div class="d-flex align-items-center justify-content-center" id="greet">\
      <p>Hello World!</p>\
      <div>nested test!</div>\
   </div>\
	<div class="w-100 h-100" id="root">\
	</div>\
</body>\
</html>',

   
   
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