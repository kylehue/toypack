const skypackURL = "https://cdn.skypack.dev/";
import { parse as getAST } from "@babel/parser";
import traverseAST, { NodePath, VisitNode } from "@babel/traverse";
import Toypack from "./Toypack";
import path from "path-browserify";
import MagicString from "magic-string";
import { BabelLoader, CSSLoader } from "@toypack/loaders";
import { AssetInterface } from "./types";
import { parse as parsePackageName } from "parse-package-name";

interface Asset {
	content: string;
	source: string;
}

export interface InstallationResult {
	name: string;
	version: string;
	graph: Asset[];
	path: string;
}

const versionRegexString = "@v?[0-9]+\\.[0-9]+\\.[0-9]+";
const versionRegex = new RegExp(versionRegexString);

let babelLoader = new BabelLoader();
let cssLoader = new CSSLoader();

export default class PackageManager {
	private _cache = new Map();

	constructor(public bundler: Toypack) {}

	private async _createGraph(targetSource: string, graph: any[] = []) {
		// Entries will be considered as a javascript file
		let isEntry = graph.length == 0;

		// Get dirname
		let dirname = path.dirname(targetSource);

		// Replace "|" with "/"
		targetSource = targetSource.replace(/\|/g, "/");

		// Fetch
		let url = `${skypackURL}${targetSource.replace(/^\//, "")}`;
		let fetchResponse = await fetch(url);
		let content = await fetchResponse.text();

		let dependencies: string[] = [];
		let chunk = new MagicString(content);
		let errorRegex = /^\/error\//;

		let facadeAsset = {
			id: ++this.bundler._lastId,
			source: targetSource,
			content,
		} as AssetInterface;

		let facadeBundler = {
			options: {},
		} as Toypack;

		// Load
		if (cssLoader.test.test(targetSource)) {
			let compiled = cssLoader.compile(facadeAsset, facadeBundler);
			facadeAsset.content = compiled.content.toString();
		} else if (babelLoader.test.test(targetSource) || isEntry) {
			// Transform to cjs
			let parsed = babelLoader.parse(facadeAsset, facadeBundler);

			chunk = parsed.metadata.compilation;

			for (let node of parsed.metadata.depNodes) {
				let argNode = node.arguments[0];
				let id = argNode.value;
				if (dependencies.some((ex) => ex == id)) continue;
				dependencies.push(id);

				if (errorRegex.test(id)) {
					// Remove import if error
					chunk.update(node.start, node.end, "");
				} else {
					// Make path relative
					let relative = path.relative(dirname, id);
					chunk.update(argNode.start, argNode.end, `"./${relative}"`);
				}
			}

			facadeAsset.content = chunk.toString();
		}

		graph.push(facadeAsset);

		// Scan dependencies
		for (let dep of dependencies) {
			let depAbsolutePath = path.resolve(dirname, dep);

			// Skip if it is in the graph already
			if (graph.some((d) => d.source == depAbsolutePath)) {
				continue;
			}

			// Skip if error
			if (errorRegex.test(dep) || errorRegex.test(fetchResponse.url)) {
				console.warn(`Failed to fetch ${depAbsolutePath}`);
				continue;
			}

			await this._createGraph(depAbsolutePath, graph);
		}

		return graph;
	}

	public async get(
		name: string,
		version: string = ""
	): Promise<InstallationResult> {
		let result: InstallationResult = {
			name: "",
			version: "",
			path: "",
			graph: [],
		};

		// Get proper package name and version
		let parsedPackageName = parsePackageName(name);
		name = parsedPackageName.name;
		version = parsedPackageName.version;
		result.name = name;
		result.path = parsedPackageName.path;
		
		// Temporarily replace "/" with "|" so the we can properly get the dirname
		let target = `${name}@${version}${parsedPackageName.path}`.replace(
			/\//g,
			"|"
		);

		// Check cache
		let cached = this._cache.get(target);
		if (cached) {
			return cached;
		}

		// Get graph
		let graph = await this._createGraph(target);
		graph[0].source = "index" + ".js";
		result.graph = graph;

		// Get version
		let fetchedVersion: any = new RegExp(name + versionRegexString).exec(
			graph[0].content
		);

		if (fetchedVersion) {
			fetchedVersion = versionRegex
				.exec(fetchedVersion[0])?.[0]
				.substring(1)
				.replace("v", "");
		}

		result.version = fetchedVersion || version;

		// Cache
		this._cache.set(target, result);

		return result;
	}
}
