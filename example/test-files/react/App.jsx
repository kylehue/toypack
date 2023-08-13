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