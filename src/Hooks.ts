import { Node, TraverseOptions } from "@babel/traverse";
import { Asset } from "./asset";
import { ITraverseOptions } from "./bundle";
import { IApplicationDependency } from "./graph";

const eventMap = {
   onError: (event: IErrorEvent) => {},
   onBeforeResolve: (event: IBeforeResolveEvent) => {},
   onAfterResolve: (event: IAfterResolveEvent) => {},
   onTranspile: (event: ITranspileEvent) => {},
} as const;

export type IEventMap = typeof eventMap;

export type IHooks = {
   [K in keyof IEventMap]: (callback: IEventMap[K]) => Function;
};

export interface IErrorEvent {
   code: number;
   reason: string;
}

export interface IBeforeResolveEvent {
   parent: Asset;
   source: string;
}

export interface IAfterResolveEvent {
   parent: Asset;
   source: { relative: string; absolute: string };
}

export interface ITranspileEvent {
   AST: Node;
   traverse: (traverseOptions: ITraverseOptions) => void;
   dependency: IApplicationDependency;
}

export class Hooks implements IHooks {
   private _listeners = new Map<
      keyof IEventMap,
      IEventMap[keyof IEventMap][]
   >();

   private _getListeners<K extends keyof IEventMap>(key: K): IEventMap[K][] {
      return this._listeners.get(key) as IEventMap[K][];
   }

   constructor() {
      // Instantiate listener arrays
      for (const key in eventMap) {
         this._listeners.set(key as keyof IEventMap, []);
      }
   }

   /**
    * Triggers the listeners for the specified event with the provided arguments.
    *
    * @param eventName - The name of the event to trigger.
    * @param args - The arguments to pass to the event listeners.
    */
   trigger<K extends keyof IEventMap>(
      eventName: K,
      ...args: Parameters<IEventMap[K]>
   ) {
      const group = this._getListeners(eventName);
      for (const evt of group) {
         (evt as any)(...args);
      }
   }

   /**
    * An event emitted when an error occurs.
    *
    * @param callback - The function to emit.
    * @returns {Function} A dispose function.
    */
   onError(callback: IEventMap["onError"]): Function {
      const group = this._getListeners("onError");
      group.push(callback);

      return () => {
         for (let i = 0; i < group.length; i++) {
            const cb = group[i];
            if (cb === callback) {
               group.splice(i, 1);
               break;
            }
         }
      };
   }

   /**
    * An event emitted when a module is being resolved.
    *
    * @param callback - The function to emit.
    * @returns {Function} A dispose function.
    */
   onBeforeResolve(callback: IEventMap["onBeforeResolve"]): Function {
      const group = this._getListeners("onBeforeResolve");
      group.push(callback);

      return () => {
         for (let i = 0; i < group.length; i++) {
            const cb = group[i];
            if (cb === callback) {
               group.splice(i, 1);
               break;
            }
         }
      };
   }

   /**
    * An event emitted when a module is resolved.
    *
    * @param callback - The function to emit.
    * @returns {Function} A dispose function.
    */
   onAfterResolve(callback: IEventMap["onAfterResolve"]): Function {
      const group = this._getListeners("onAfterResolve");
      group.push(callback);

      return () => {
         for (let i = 0; i < group.length; i++) {
            const cb = group[i];
            if (cb === callback) {
               group.splice(i, 1);
               break;
            }
         }
      };
   }

   /**
    * An event emitted when a module is being transpiled.
    *
    * @param callback - The function to emit.
    * @returns {Function} A dispose function.
    */
   onTranspile(callback: IEventMap["onTranspile"]): Function {
      const group = this._getListeners("onTranspile");
      group.push(callback);

      return () => {
         for (let i = 0; i < group.length; i++) {
            const cb = group[i];
            if (cb === callback) {
               group.splice(i, 1);
               break;
            }
         }
      };
   }
}
