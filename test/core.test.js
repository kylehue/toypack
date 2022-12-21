const {default: Toypack} = require("@toypack/core/Toypack");
const path = require("path");
let toypack = new Toypack();

describe("Resolve", () => {
	beforeEach(() => {
		window.URL.createObjectURL = jest.fn();
		toypack.addAsset("src/main.js");
		toypack.addAsset("someFile.js");
		toypack.addAsset("someFolder/file.js");
		toypack.addAsset("someFolder/package.json", JSON.stringify({
			main: "file.js"
		}));
		toypack.addAsset("anotherFolder/index.js");
		toypack.addAsset("node_modules/hello/index.js");
	});

	afterEach(() => {
		window.URL.createObjectURL.mockReset();
	});

	test("Simple resolve", () => {
		let res = toypack.resolve("./src/main.js", {
			baseDir: ".",
		});

		let expected = path.join("/", "src", "main.js");

		expect(res).toBe(expected);

		let noExtensions = toypack.resolve("./src/main.js", {
			baseDir: ".",
			extensions: []
		});

		expect(noExtensions).not.toBe(expected);
	});

	test("Resolve with baseDir", () => {
		let res = toypack.resolve("./main.js", {
			baseDir: "src",
		});

		let expected = path.join("/", "src", "main.js");

		expect(res).toBe(expected);

		let res2 = toypack.resolve("./src/main.js", {
			baseDir: "src",
		});

		expect(res2).not.toBe(expected);
	});

	test("Resolve directory", () => {
		let res = toypack.resolve("./someFolder", {
			baseDir: ".",
		});

		expect(res).toBe(path.join("/", "someFolder", "file.js"));

		let res2 = toypack.resolve("./anotherFolder", {
			baseDir: ".",
		});

		expect(res2).toBe(path.join("/", "anotherFolder", "index.js"));
	});

	test("Resolve core module", () => {
		let res = toypack.resolve("hello", {
			baseDir: ".",
		});

		let expected = path.join("/", "node_modules", "hello", "index.js");

		expect(res).toBe(expected);

		let excludeCoreModules = toypack.resolve("hello", {
			baseDir: ".",
			includeCoreModules: false
		});

		expect(excludeCoreModules).not.toBe(expected);
	});

	test("Resolve external URL", () => {
		let res = toypack.resolve(
			"https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
		);

		expect(res).toBe(
			"https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
		);
	});
});