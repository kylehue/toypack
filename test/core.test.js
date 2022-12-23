const { default: Toypack } = require("@toypack/core/Toypack");
const path = require("path-browserify");
let toypack = new Toypack();

toypack.defineOptions({
	bundleOptions: {
		entry: "src/main.js",
	},
});

beforeAll(async () => {
	window.URL.createObjectURL = jest.fn();
	await toypack.addAsset("src/main.js");
	await toypack.addAsset("assets/image.jpg");
	await toypack.addAsset("someFile.js");
	await toypack.addAsset("someFolder/file.js");
	await toypack.addAsset(
		"someFolder/package.json",
		JSON.stringify({
			main: "file.js",
		})
	);
	await toypack.addAsset("anotherFolder/index.js");
	await toypack.addAsset("node_modules/hello/index.js");
	toypack.defineOptions({
		bundleOptions: {
			resolve: {
				alias: {
					"@utils": "/test/utils/",
				},
			},
		},
	});

	await toypack.addAsset("test/utils/tester/index.js");
	await toypack.addAsset("test/utils/tester/stuff.js");
	await toypack.addAsset("test/utils/foo/bar.js");
});

afterAll(() => {
	window.URL.createObjectURL.mockReset();
});

describe("Resolve", () => {
	test("Simple", () => {
		let res = toypack.resolve("./src/main.js", {
			baseDir: ".",
		});

		let expected = path.normalize("/src/main.js");

		expect(res).toBe(expected);

		let noExtensions = toypack.resolve("./src/main.js", {
			baseDir: ".",
			extensions: [],
		});

		expect(noExtensions).not.toBe(expected);
	});

	test("baseDir", () => {
		let res = toypack.resolve("../assets/image.jpg", {
			baseDir: path.dirname("src/main.js"),
		});

		expect(res).toBe(path.normalize("/assets/image.jpg"));

		let res2 = toypack.resolve("./src/main.js", {
			baseDir: "src",
		});

		expect(res2).not.toBe(path.normalize("/src/main.js"));
	});

	test("Directories", () => {
		let res = toypack.resolve("./someFolder", {
			baseDir: ".",
		});

		expect(res).toBe(path.normalize("/someFolder/file.js"));

		let res2 = toypack.resolve("./anotherFolder", {
			baseDir: ".",
		});

		expect(res2).toBe(path.normalize("/anotherFolder/index.js"));
	});

	test("Alias", async () => {
		let res = toypack.resolve("@utils/foo/bar");
		expect(res).toBe(path.normalize("/test/utils/foo/bar.js"));

		let res2 = toypack.resolve("@utils/tester");
		expect(res2).toBe(path.normalize("/test/utils/tester/index.js"));
	});

	test("Core modules", () => {
		let res = toypack.resolve("hello", {
			baseDir: ".",
		});

		let expected = path.normalize("/node_modules/hello/index.js");

		expect(res).toBe(expected);

		let excludeCoreModules = toypack.resolve("hello", {
			baseDir: ".",
			includeCoreModules: false,
		});

		expect(excludeCoreModules).not.toBe(expected);
	});

	test("External URLs", () => {
		let res = toypack.resolve(
			"https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
		);

		expect(res).toBe(
			"https://cdnjs.cloudflare.com/ajax/libs/canvas-confetti/1.6.0/confetti.min.js"
		);
	});
});
