export default function getBtoa(content: string | ArrayBuffer) {
   if (typeof window !== "undefined" && typeof window.btoa === "function") {
      if (content instanceof ArrayBuffer) {
         return window.btoa(
            new Uint8Array(content).reduce(
               (data, byte) => data + String.fromCharCode(byte),
               ""
            )
         );
      }

      return window.btoa(unescape(encodeURIComponent(content)));
   } else if (typeof Buffer === "function") {
      if (content instanceof ArrayBuffer) {
         return Buffer.from(new Uint8Array(content)).toString("base64");
      }

      return Buffer.from(content, "utf-8").toString("base64");
   }
}
