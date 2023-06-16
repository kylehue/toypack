import { Node } from "@babel/traverse";
import { IAsset } from "./asset.js";
import type { ITraverseOptions } from "./bundle/compileScript.js";
import { CodeComposer } from "./CodeComposer.js";

const eventMap = {
   onError: (event: IErrorEvent) => {},
   onBeforeResolve: (event: IBeforeResolveEvent) => {},
   onAfterResolve: (event: IAfterResolveEvent) => {},
   onBeforeFinalizeScriptContent: (
      event: IBeforeFinalizeScriptContentEvent
   ) => {},
   onAfterFinalizeScriptContent: (
      event: IAfterFinalizeScriptContentEvent
   ) => {},
   onTranspile: (event: ITranspileEvent) => {},
} as const;

export class Hooks implements IHooks {
   private _listeners = new Map<keyof IEventMap, IListener[]>();

   private _getListeners<K extends keyof IEventMap>(key: K): IListener[] {
      return this._listeners.get(key) as IListener[];
   }

   private _createListener<T extends keyof IEventMap>(
      key: T,
      callback: IEventMap[T]
   ) {
      const group = this._getListeners(key);
      group.push({
         callback,
      });

      return () => {
         for (let i = 0; i < group.length; i++) {
            const cb = group[i];
            if (cb.callback === callback) {
               group.splice(i, 1);
               break;
            }
         }
      };
   }

   constructor() {
      // Instantiate listener arrays
      for (const key in eventMap) {
         this._listeners.set(key as keyof IEventMap, []);
      }
   }

   /**
    * Triggers the listeners for the specified event with the
    * provided arguments.
    * @param eventName - The name of the event to trigger.
    * @param args - The arguments to pass to the event listeners.
    */
   async trigger<K extends keyof IEventMap>(
      eventName: K,
      ...args: Parameters<IEventMap[K]>
   ) {
      const group = this._getListeners(eventName);
      for (const evt of group) {
         (evt.callback as any)(...args);
      }
   }

   /**
    * An event emitted when an error occurs.
    */
   onError(callback: IEventMap["onError"]): Function {
      return this._createListener("onError", callback);
   }

   /**
    * An event emitted when a module is being resolved.
    */
   onBeforeResolve(callback: IEventMap["onBeforeResolve"]): Function {
      return this._createListener("onBeforeResolve", callback);
   }

   /**
    * An event emitted when a module is resolved.
    */
   onAfterResolve(callback: IEventMap["onAfterResolve"]): Function {
      return this._createListener("onAfterResolve", callback);
   }

   /**
    * An event emitted when a module is being transpiled.
    */
   onTranspile(callback: IEventMap["onTranspile"]): Function {
      return this._createListener("onTranspile", callback);
   }

   /**
    * An event emitted before the script bundle gets finalized.
    */
   onBeforeFinalizeScriptContent(
      callback: IEventMap["onBeforeFinalizeScriptContent"]
   ): Function {
      return this._createListener("onBeforeFinalizeScriptContent", callback);
   }

   /**
    * An event emitted after the script bundle is finalized.
    */
   onAfterFinalizeScriptContent(
      callback: IEventMap["onAfterFinalizeScriptContent"]
   ): Function {
      return this._createListener("onAfterFinalizeScriptContent", callback);
   }
}

export type IEventMap = typeof eventMap;

export type IHooks = {
   [K in keyof IEventMap]: (callback: IEventMap[K], async: boolean) => Function;
};

export interface IErrorEvent {
   code: number;
   reason: string;
}

export interface IBeforeResolveEvent {
   parent: IAsset;
   source: string;
   changeSource: (newSource: string) => void;
}

export interface IAfterResolveEvent {
   parent: IAsset;
   source: string;
   resolvedAsset: IAsset;
}

export interface ITranspileEvent {
   AST: Node;
   traverse: (traverseOptions: ITraverseOptions) => void;
   source: string;
}

export interface IBeforeFinalizeScriptContentEvent {
   content: CodeComposer;
}

export interface IAfterFinalizeScriptContentEvent {
   content: CodeComposer;
}

interface IListener {
   callback: IEventMap[keyof IEventMap];
}
