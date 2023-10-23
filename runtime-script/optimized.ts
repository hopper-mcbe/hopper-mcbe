import {
  Component,
  ComponentBodyDefine,
  DefineComponentGlobalFuncCallback,
  DefineFileFunc,
  DefineScriptCallback,
  DefineScriptOptions,
} from "../types/script_globals_helper_types.js";

declare const MODULES: { [k: string]: string };

globalThis.createAddon = (mainComponent) => {
  for (const scriptCallback of mainComponent._scriptCallbacks) {
    scriptCallback(MODULES);
  }
};

const fileOnceKeys = new Set();

globalThis.defineComponent = <T extends unknown[]>(
  callback: DefineComponentGlobalFuncCallback<T>,
) => {
  return (...args: T) => {
    let scriptCallbacks: DefineScriptCallback[] = [];

    const emptyDefine: DefineFileFunc<unknown> = (_content, o = {}) => {
      return false;
    };

    const define = new Proxy(
      {
        script(
          scriptCallback: DefineScriptCallback,
          o: DefineScriptOptions = {},
        ) {
          const onceKey = o.once?.key;
          if (onceKey) {
            if (fileOnceKeys.has(onceKey)) return;
            fileOnceKeys.add(onceKey);
          }

          scriptCallbacks.push(scriptCallback);
        },
      },
      {
        get(t, p) {
          return p === "script" ? t.script : emptyDefine;
        },
      },
    );

    function implement(component: Component) {
      scriptCallbacks = [...component._scriptCallbacks, ...scriptCallbacks];
    }

    callback({ define: define as ComponentBodyDefine, implement }, ...args);

    return {
      _scriptCallbacks: scriptCallbacks,
    } as Component;
  };
};
