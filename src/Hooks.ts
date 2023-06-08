import { Node, TraverseOptions } from "@babel/traverse";
import { IAsset } from "./asset";
import { ITraverseOptions } from "./bundle";

const eventMap = {
   onError: (event: IErrorEvent) => {},
   onBeforeResolve: (event: IBeforeResolveEvent) => {},
   onAfterResolve: (event: IAfterResolveEvent) => {},
   onTranspile: (event: ITranspileEvent) => {},
} as const;

export class Hooks implements IHooks {
   private _listeners = new Map<keyof IEventMap, IListener[]>();

   private _getListeners<K extends keyof IEventMap>(key: K): IListener[] {
      return this._listeners.get(key) as IListener[];
   }

   private _createListener<T extends keyof IEventMap>(
      key: T,
      callback: IEventMap[T],
      async = false
   ) {
      const group = this._getListeners(key);
      group.push({
         async,
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
    * Triggers the listeners for the specified event with the provided arguments.
    *
    * @param eventName - The name of the event to trigger.
    * @param args - The arguments to pass to the event listeners.
    */
   async trigger<K extends keyof IEventMap>(
      eventName: K,
      ...args: Parameters<IEventMap[K]>
   ) {
      const group = this._getListeners(eventName);
      for (const evt of group) {
         if (evt.async) {
            await (evt.callback as any)(...args);
         } else {
            (evt.callback as any)(...args);
         }
      }
   }

   /**
    * An event emitted when an error occurs.
    *
    * @param callback The function to emit.
    * @param async Set to true to make the callback asynchronous.
    * @returns {Function} A dispose function.
    */
   onError<T extends boolean>(
      callback: IEventMap<T>["onError"],
      async?: T
   ): Function {
      return this._createListener("onError", callback, async);
   }

   /**
    * An event emitted when a module is being resolved.
    *
    * @param callback - The function to emit.
    * @param async Set to true to make the callback asynchronous.
    * @returns {Function} A dispose function.
    */
   onBeforeResolve<T extends boolean>(
      callback: IEventMap<T>["onBeforeResolve"],
      async?: T
   ): Function {
      return this._createListener("onBeforeResolve", callback, async);
   }

   /**
    * An event emitted when a module is resolved.
    *
    * @param callback - The function to emit.
    * @param async Set to true to make the callback asynchronous.
    * @returns {Function} A dispose function.
    */
   onAfterResolve<T extends boolean>(
      callback: IEventMap<T>["onAfterResolve"],
      async?: T
   ): Function {
      return this._createListener("onAfterResolve", callback, async);
   }

   /**
    * An event emitted when a module is being transpiled.
    *
    * @param callback - The function to emit.
    * @param async Set to true to make the callback asynchronous.
    * @returns {Function} A dispose function.
    */
   onTranspile<T extends boolean>(
      callback: IEventMap<T>["onTranspile"],
      async?: T
   ): Function {
      return this._createListener("onTranspile", callback, async);
   }
}

export type IEventMap<T extends boolean = false> = T extends false
   ? typeof eventMap
   : {
        [K in keyof typeof eventMap]: (
           ...args: Parameters<(typeof eventMap)[K]>
        ) => Promise<void>;
     };

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
}

export interface IAfterResolveEvent {
   parent: IAsset;
   source: { relative: string; absolute: string };
}

export interface ITranspileEvent {
   AST: Node;
   traverse: (traverseOptions: ITraverseOptions) => void;
   source: string;
}

interface IListener {
   async: boolean;
   callback: IEventMap[keyof IEventMap];
}