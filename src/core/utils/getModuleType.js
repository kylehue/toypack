let externalRegex = /https?:\/\/((?:[\w\d-]+\.)+[\w\d]{2,})/i;

export default function (url) {
	if (url.startsWith("../") || url.startsWith("./") || url.startsWith("/")) {
		return "source";
	} else if (externalRegex.test(url)) {
		return "external";
	} else {
		return "core";
	}
}
