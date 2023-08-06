export function isValidVar(name: string) {
   return /^[\w$]+$/i.test(name) && !/^[0-9]+/.test(name);
}