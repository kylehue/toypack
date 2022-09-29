const path = require("path");

module.exports = {
	mode: "production",
	entry: {
		index: path.resolve(__dirname, "./index.js")
	},
	module: {
		rules: [{
			test: /\.js$/,
			include: path.resolve(__dirname, "./src"),
			exclude: /node_modules/,
			loader: "babel-loader",
			options: {
				presets: [
					["@babel/preset-env", {
						targets: "defaults"
					}]
				]
			}
		}, {
			test: /\.(scss)$/,
			use: [
				"style-loader",
				"css-loader",
				"sass-loader"
			]
		}]
	},
	output: {
		path: path.resolve(__dirname, "./dist"),
		publicPath: "/",
		filename: "[name].js",
		clean: true
	}
};
