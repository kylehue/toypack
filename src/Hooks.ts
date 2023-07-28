import type { PackageAsset } from "./package-manager/fetch-package";
import type { Asset, Error } from "./types";

const eventMap = {
   onError: (error: Error) => undefined,
   onInstallPackage: (packageInfo: PackageInfo) => undefined,
   onAddOrUpdateAsset: (asset: Asset) => undefined,
   onRemoveAsset: (asset: Asset) => undefined,
   onResolve: (resolveInfo: ResolveInfo) => undefined,
} as const;

export class Hooks implements IHooks {
   private _listeners = new Map<keyof EventMap, Listener[]>();

   private _getListeners<K extends keyof EventMap>(key: K): Listener[] {
      return this._listeners.get(key)!;
   }

   private _createListener<T extends keyof EventMap>(
      key: T,
      callback: EventMap[T]
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
         this._listeners.set(key as keyof EventMap, []);
      }
   }

   /**
    * Triggers the listeners for the specified event with the
    * provided arguments.
    * @param eventName - The name of the event to trigger.
    * @param args - The arguments to pass to the event listeners.
    */
   protected async _trigger<K extends keyof EventMap>(
      eventName: K,
      ...args: Parameters<EventMap[K]>
   ) {
      const group = this._getListeners(eventName);
      for (const evt of group) {
         (evt.callback as any)(...args);
      }
   }

   /**
    * Emit a function everytime an error occurs.
    */
   onError(callback: EventMap["onError"]): Function {
      return this._createListener("onError", callback);
   }

   /**
    * Emit a function everytime an asset gets added or updated.
    */
   onAddOrUpdateAsset(callback: EventMap["onAddOrUpdateAsset"]): Function {
      return this._createListener("onAddOrUpdateAsset", callback);
   }

   /**
    * Emit a function everytime a package is installed.
    */
   onInstallPackage(callback: EventMap["onInstallPackage"]): Function {
      return this._createListener("onInstallPackage", callback);
   }

   /**
    * Emit a function everytime an asset gets deleted.
    */
   onRemoveAsset(callback: EventMap["onRemoveAsset"]): Function {
      return this._createListener("onRemoveAsset", callback);
   }

   /**
    * Emit a function everytime a module is resolved.
    */
   onResolve(callback: EventMap["onResolve"]): Function {
      return this._createListener("onResolve", callback);
   }
}

export type EventMap = typeof eventMap;

export type IHooks = {
   [K in keyof EventMap]: (callback: EventMap[K], async: boolean) => Function;
};

export interface PackageInfo {
   name: string;
   version: string;
   subpath: string;
   assets: PackageAsset[];
   dtsAssets: PackageAsset[];
}

export interface ResolveInfo {
   rawRequest: string;
   request: string;
   params: Record<string, string | boolean>;
   resolved: string;
   parent: string;
}

interface Listener {
   callback: EventMap[keyof EventMap];
}
