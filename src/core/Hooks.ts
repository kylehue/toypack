import { IAsset, CompiledAsset } from "./types";

export type HookName = keyof Omit<Hooks, "taps" | "trigger">;

export interface IFailedResolveDescriptor {
	target: string;
	parent: IAsset;
	changeResolved: (newResolved: string) => void;
}

type IFailedResolveCallback = (
	descriptor: IFailedResolveDescriptor
) => void | Promise<any>;

export interface IAfterCompileDescriptor {
	compilation: CompiledAsset;
	asset: IAsset;
}

type IAfterCompileCallback = (
	descriptor: IAfterCompileDescriptor
) => void | Promise<any>;

export default class Hooks {
	public taps: Map<HookName, Function[]> = new Map();

	constructor() {}

	private _tapHook(hookName: HookName, hookFunction: Function) {
		if (typeof hookFunction == "function") {
			if (!this.taps.get(hookName)) {
				this.taps.set(hookName, []);
			}

			let hookGroup = this.taps.get(hookName);
			if (hookGroup) {
				hookGroup.push(hookFunction);
			}
		}
	}

	public async trigger(hookName: HookName, ...args) {
		let hooks = this.taps.get(hookName);
		if (hooks) {
			for (let fn of hooks) {
				await fn(...args);
			}
		}
	}

	public failedResolve(fn: IFailedResolveCallback) {
		this._tapHook("failedResolve", fn);
	}

	public afterCompile(fn: IAfterCompileCallback) {
		this._tapHook("afterCompile", fn);
	}
}
