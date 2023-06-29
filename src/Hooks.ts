const eventMap = {
   onError: (event: ErrorEvent) => {},
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
    * Listen to errors.
    */
   onError(callback: EventMap["onError"]): Function {
      return this._createListener("onError", callback);
   }
}

export type EventMap = typeof eventMap;

export type IHooks = {
   [K in keyof EventMap]: (callback: EventMap[K], async: boolean) => Function;
};

export interface ErrorEvent {
   code: number;
   reason: string;
}

interface Listener {
   callback: EventMap[keyof EventMap];
}
