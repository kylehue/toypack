import { transform as babelTransform } from "@babel/standalone";

addEventListener("message", event => {
  let data = event.data;
  postMessage(babelTransform(data.code, data.options).code);
});