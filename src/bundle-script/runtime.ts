export default {
   createNamespace: `
function createNamespace(target, all) {
   var names = Object.keys(all);
   for (var i = 0; i < names.length; i++) {
      var name = names[i];
      Object.defineProperty(target, name, { get: all[name], enumerable: true });
   }

   return target;
}
`,
   mergeObjects: `
function mergeObjects() {
   var objects = arguments;
   var result = {};
   for (var i = 0; i < objects.length; i++) {
      var object = objects[i];
      var props = Object.getOwnPropertyDescriptors(object);
      var names = Object.keys(props);
      for (var j = 0; j < names.length; j++) {
         var name = names[j];
         props[name].configurable = true;
      }
      Object.assign(result, props);
   }

   return Object.defineProperties({}, result);
}
`,
   removeDefault: `
function removeDefault(object) {
   if (typeof object["default"] != "undefined") {
      delete object["default"];
   }

   return object;
}
`,
} as const;
