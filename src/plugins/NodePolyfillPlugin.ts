import Toypack from "@toypack/core/Toypack";
import { ToypackPlugin } from "@toypack/core/types";
import { dirname } from "path-browserify";

const polyfills = {
	assert: "assert/",
	buffer: "buffer/",
	console: "console-browserify",
	constants: "constants-browserify",
	crypto: "crypto-browserify",
	domain: "domain-browser",
	events: "events/",
	http: "stream-http",
	https: "https-browserify",
	os: "os-browserify/browser",
	path: "path-browserify",
	punycode: "punycode/",
	process: "process/browser",
	querystring: "querystring-es3",
	stream: "stream-browserify",
	_stream_duplex: "readable-stream/lib/_stream_duplex",
	_stream_passthrough: "readable-stream/lib/_stream_passthrough",
	_stream_readable: "readable-stream/lib/_stream_readable",
	_stream_transform: "readable-stream/lib/_stream_transform",
	_stream_writable: "readable-stream/lib/_stream_writable",
	string_decoder: "string_decoder/",
	sys: "util/",
	timers: "timers-browserify",
	tty: "tty-browserify",
	url: "url/",
	util: "util/",
	vm: "vm-browserify",
	zlib: "browserify-zlib",
};

export default class NodePolyfillPlugin implements ToypackPlugin {
	apply(bundler: Toypack) {
		// Only add dependency if it's required
		bundler.hooks.failedResolve(async (descriptor) => {
			if (descriptor.target in polyfills) {
				bundler.defineOptions({
					bundleOptions: {
						resolve: {
							fallback: {
								[descriptor.target]: polyfills[descriptor.target],
							},
						},
					},
				});

				await bundler.packageManager.install(polyfills[descriptor.target]);

				let newResolved = await bundler.resolve(descriptor.target, {
					baseDir: dirname(descriptor.parent.source),
				});

				descriptor.changeResolved(newResolved);
			}
		});
	}
}
