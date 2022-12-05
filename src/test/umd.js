(function (root, factory) {
	if (typeof exports === "object" && typeof module === "object") {
		module.exports = factory();
	} else if (typeof define === "function" && define.amd) {
		define([], factory);
	} else if (typeof exports === "object") {
		exports["Sample"] = factory();
	} else {
		root["Sample"] = factory();
	}
})(self, function () {
	var __modules__ = {
		"/index.html": {
			init: function (module, exports, require) {
				/*
      let __toypack_node_5__ = document.head || document.getElementsByTagName("head")[0];
      let __toypack_node_18__ = document.body || document.getElementsByTagName("body")[0];
      let __toypack_node_21__ = document.createTextNode(`Hello World!`);
      let __toypack_node_20__ = document.createElement("div");
      let __toypack_node_14__ = document.createTextNode(`cool website!!!!`);
      let __toypack_node_13__ = document.createElement("title");
      let __toypack_node_7__ = document.createElement("meta");

      __toypack_node_7__.setAttribute("name", "viewport");
      __toypack_node_7__.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui");
      __toypack_node_5__.appendChild(__toypack_node_7__);
      __toypack_node_5__.appendChild(__toypack_node_13__);
      __toypack_node_13__.appendChild(__toypack_node_14__);
      __toypack_node_20__.setAttribute("id", "greet");
      __toypack_node_18__.appendChild(__toypack_node_20__);
      __toypack_node_20__.appendChild(__toypack_node_21__);
      export {__toypack_node_5__ as head, __toypack_node_18__ as body};*/
				"use strict";

				exports.__esModule = true;
				exports.head = exports.body = void 0;
				var __toypack_node_5__ =
					document.head || document.getElementsByTagName("head")[0];
				exports.head = __toypack_node_5__;
				var __toypack_node_18__ =
					document.body || document.getElementsByTagName("body")[0];
				exports.body = __toypack_node_18__;
				var __toypack_node_21__ = document.createTextNode("Hello World!");
				var __toypack_node_20__ = document.createElement("div");
				var __toypack_node_14__ = document.createTextNode("cool website!!!!");
				var __toypack_node_13__ = document.createElement("title");
				var __toypack_node_7__ = document.createElement("meta");
				__toypack_node_7__.setAttribute("name", "viewport");
				__toypack_node_7__.setAttribute(
					"content",
					"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui"
				);
				__toypack_node_5__.appendChild(__toypack_node_7__);
				__toypack_node_5__.appendChild(__toypack_node_13__);
				__toypack_node_13__.appendChild(__toypack_node_14__);
				__toypack_node_20__.setAttribute("id", "greet");
				__toypack_node_18__.appendChild(__toypack_node_20__);
				__toypack_node_20__.appendChild(__toypack_node_21__);
			},
			map: {
				"/src/index.js": "/src/index.js",
				"/styles/main.css": "/styles/main.css",
			},
		},
		"/src/index.js": {
			init: function (module, exports, require) {
				/*
   	import { PI } from "../scripts/PI.js";
   	import { Circle } from "../scripts/Circle.js";
   	//import App from "./App.vue";
   	import "../styles/main.css";
   	console.log(Circle);
   	console.log("              ");
   	export const myPI = PI;*/
				"use strict";

				exports.__esModule = true;
				exports.myPI = void 0;
				var _PI = require("../scripts/PI.js");
				var _Circle = require("../scripts/Circle.js");
				require("../styles/main.css");
				//import App from "./App.vue";

				console.log(_Circle.Circle);
				console.log("              ");
				var myPI = _PI.PI;
				exports.myPI = myPI;
			},
			map: {
				"../scripts/PI.js": "/scripts/PI.js",
				"../scripts/Circle.js": "/scripts/Circle.js",
				"../styles/main.css": "/styles/main.css",
			},
		},
		"/scripts/PI.js": {
			init: function (module, exports, require) {
				/*

   	import "./Test.js";
   	export const PI = 3.14;
   	import { Circle } from "./Circle.js";
   	console.log(Circle);*/
				"use strict";

				exports.__esModule = true;
				exports.PI = void 0;
				require("./Test.js");
				var _Circle = require("./Circle.js");
				var PI = 3.14;
				exports.PI = PI;
				console.log(_Circle.Circle);
			},
			map: {
				"./Test.js": "/scripts/Test.js",
				"./Circle.js": "/scripts/Circle.js",
			},
		},
		"/scripts/Test.js": {
			init: function (module, exports, require) {
				/*
   	console.log("I'm a test!");*/
				"use strict";

				console.log("I'm a test!");
			},
			map: {},
		},
		"/scripts/Circle.js": {
			init: function (module, exports, require) {
				/*
      import { PI } from "./PI.js";
      import "https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js";
      import "./Test.js"
      export class Circle {
         constructor() {
            this.PI = PI;
         }
      }*/
				"use strict";

				exports.__esModule = true;
				exports.Circle = void 0;
				var _PI = require("./PI.js");
				require("https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js");
				require("./Test.js");
				var Circle = function Circle() {
					this.PI = _PI.PI;
				};
				exports.Circle = Circle;
			},
			map: {
				"./PI.js": "/scripts/PI.js",
				"https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js":
					"https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js",
				"./Test.js": "/scripts/Test.js",
			},
		},
		"/styles/main.css": {
			init: function (module, exports, require) {
				/*
      let __styleContent__ = `      body {
         margin: 0;
         background: black;
         color: white;
      }

      * {
         box-sizing: border-box;
      }`;

      let __head__ = document.head || document.getElementsByTagName("head")[0];
      let __stylesheet__ = document.createElement("style");
      __stylesheet__.dataset.toypackId = "/styles/main.css";
      __stylesheet__.setAttribute("type", "text/css");
      __head__.appendChild(__stylesheet__);

      if (__stylesheet__.styleSheet){
        __stylesheet__.styleSheet.cssText = __styleContent__;
      } else {
        __stylesheet__.appendChild(document.createTextNode(__styleContent__));
      }

      export default __stylesheet__;
      */
				"use strict";

				exports.__esModule = true;
				exports.default = void 0;
				var __styleContent__ =
					"body {\n   margin: 0;\n   background: black;\n   color: white;\n}\n\n* {\n   box-sizing: border-box;\n}";
				var __head__ =
					document.head || document.getElementsByTagName("head")[0];
				var __stylesheet__ = document.createElement("style");
				__stylesheet__.dataset.toypackId = "/styles/main.css";
				__stylesheet__.setAttribute("type", "text/css");
				__head__.appendChild(__stylesheet__);
				if (__stylesheet__.styleSheet) {
					__stylesheet__.styleSheet.cssText = __styleContent__;
				} else {
					__stylesheet__.appendChild(document.createTextNode(__styleContent__));
				}
				var _default = __stylesheet__;
				console.log(4444444444444);
				exports.default = _default;
			},
			map: { "./colors.css": "/styles/colors.css" },
		},
		"/styles/colors.css": {
			init: function (module, exports, require) {
				/*
      let __styleContent__ = `      :root {
         --accent: blue;
         --grey: #333;
      }`;

      let __head__ = document.head || document.getElementsByTagName("head")[0];
      let __stylesheet__ = document.createElement("style");
      __stylesheet__.dataset.toypackId = "/styles/colors.css";
      __stylesheet__.setAttribute("type", "text/css");
      __head__.appendChild(__stylesheet__);

      if (__stylesheet__.styleSheet){
        __stylesheet__.styleSheet.cssText = __styleContent__;
      } else {
        __stylesheet__.appendChild(document.createTextNode(__styleContent__));
      }

      export default __stylesheet__;
      */
				"use strict";

				exports.__esModule = true;
				exports.default = void 0;
				var __styleContent__ =
					":root {\n   --accent: blue;\n   --grey: #333;\n}";
				var __head__ =
					document.head || document.getElementsByTagName("head")[0];
				var __stylesheet__ = document.createElement("style");
				__stylesheet__.dataset.toypackId = "/styles/colors.css";
				__stylesheet__.setAttribute("type", "text/css");
				__head__.appendChild(__stylesheet__);
				if (__stylesheet__.styleSheet) {
					__stylesheet__.styleSheet.cssText = __styleContent__;
				} else {
					__stylesheet__.appendChild(document.createTextNode(__styleContent__));
				}
				var _default = __stylesheet__;
				exports.default = _default;
			},
			map: {},
		},
	};
	/* Require function */
	const __moduleCache__ = {};
	function __require__(modulePath) {
		const { init, map } = __modules__[modulePath];
		const __module__ = { exports: {} };
		__moduleCache__[modulePath] = __module__.exports;
		function localRequire(assetRelativePath) {
			if (!__moduleCache__[map[assetRelativePath]]) {
				__moduleCache__[map[assetRelativePath]] = __module__.exports;
				var __exports__ = __require__(map[assetRelativePath]);
				__moduleCache__[map[assetRelativePath]] = __exports__;
				return __exports__;
			}
			return __moduleCache__[map[assetRelativePath]];
		}
		console.log(modulePath);
		init(__module__, __module__.exports, localRequire);
		return __module__.exports;
	}
	/* Start */
	return __require__("/index.html");
});
