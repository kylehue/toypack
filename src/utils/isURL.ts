const URL_RE = /https?:\/\/((?:[\w\d-]+\.)+[\w\d]{2,})/i;
const DATA_URL_RE = /^(data:)([\w\/\+-]*)(;charset=[\w-]+|;base64){0,1},(.*)/gi;
export default function isURL(str: string) {
   return URL_RE.test(str) || DATA_URL_RE.test(str);
}
