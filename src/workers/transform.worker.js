import { transform as babelTransform } from "@babel/standalone";

addEventListener("message", event => {
  postMessage(event.data + 1);
});