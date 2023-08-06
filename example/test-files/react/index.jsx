import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.jsx";

ReactDOM.createRoot(document.querySelector("#reactApp")).render(<App />);

/* CJS */
// const React = require("react");
// const ReactDOM = require("react-dom/client");
// const { App } = require("./App");

// ReactDOM.createRoot(document.querySelector("#reactApp")).render(<App />);