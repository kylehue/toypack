export default {
   createNamespace: `
var createNamespace = (target, all) => {
   for (var name in all) {
      Object.defineProperty(target, name, { get: all[name], enumerable: true });
   }

   return target;
};
`,
} as const;