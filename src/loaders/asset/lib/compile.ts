import { Asset } from "@toypack/loaders/types";
import { BUNDLE_CONFIG } from "@toypack/test";

function getBtoa(arr) {
	if (typeof window !== "undefined" && typeof window.btoa === "function") {
		return window.btoa(arr.reduce((data, byte) => data + String.fromCharCode(byte), ""));
	} else if (typeof Buffer === "function") {
		return Buffer.from(arr).toString("base64");
	}
}

async function compile(content: string | Uint8Array, asset: Asset) {
	let chunkContent = `module.exports = "${asset.contentURL || ""}"`;
	
	if (BUNDLE_CONFIG.mode == "production" && content instanceof Uint8Array) {
		let base64 = getBtoa(content);
		let url = `data:${asset.type};base64,${base64}`;
		chunkContent = `module.exports = "${url}"`;
	}

	return {
		map: {},
		content: chunkContent,
	};
}

export default compile;