import { BuildHookConfig, BuildHooks } from "./hooks.js";

export type Plugin = () => { name: string } & Partial<BuildHooks>;