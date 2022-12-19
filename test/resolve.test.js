const {default: Toypack} = require("@toypack/core/Toypack");

let toypack = new Toypack();

test("Resolve", () => {
	let b = toypack.resolve("../hello.js", {
		baseDir: ".",
	});

	expect(b).toBe(undefined);
});
test("hello", () => {
	let b = toypack.resolve("../hello.js", {
		baseDir: ".",
	});

	expect(b).toBe(undefined);
});