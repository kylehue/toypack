export type HookName = keyof Omit<Hooks, "taps">;
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

	public failedResolve(fn: Function) {
		this._tapHook("failedResolve", fn);
	}

	public afterCompile(fn: Function) {
		this._tapHook("afterCompile", fn);
	}
}
