if (typeof window.URL.createObjectURL !== "function") {
	window.URL.createObjectURL = () => {};
}

window.fetch = require("jest-mock-fetch").default;
