import React, { useState, useEffect } from "react";

export function App(props) {
   const [counter, setCount] = useState(1);
   useEffect(() => {
      console.log("Hello react");
   }, []);
   return (
      <div className="App">
         <h1>Hello React.</h1>
         <button onClick={() => setCount(counter + 1)}>{counter}</button>
      </div>
   );
}

/* CJS */
// const React = require("react");
// const { useState, useEffect } = require("react");

// exports.App = (props) => {
//    const [counter, setCount] = useState(1);
//    useEffect(() => {
//       console.log("Hello console");
//    }, []);
//    return (
//       <div className="App">
//          <button onClick={() => setCount(counter + 1)}>Click me!</button>
//          <h1>Hello React.</h1>
//          <h2>{counter}</h2>
//       </div>
//    );
// }
