const URL_RE = /https?:\/\/((?:[\w\d-]+\.)+[\w\d]{2,})/i;

export default function isURL(str: string) {
	return URL_RE.test(str);
}
