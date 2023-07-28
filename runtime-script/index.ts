import {
  Component,
  ComponentBodyDefine,
  DefineComponentGlobalFuncCallback,
  DefineFileFunc,
  DefineScriptCallback,
} from "../types/script_globals_helper_types.js";

declare const MODULES: { [k: string]: string };

let createAddonCalled = false;

globalThis.createAddon = (mainComponent) => {
  if (createAddonCalled) {
    throw new Error("'createAddon' has already been called");
  }

  for (const scriptCallback of mainComponent._scriptCallbacks) {
    scriptCallback(MODULES);
  }

  createAddonCalled = true;
};

let allFilesCount = 0;
const fileOnceKeys = new Set();

globalThis.defineComponent = <T extends unknown[]>(
  callback: DefineComponentGlobalFuncCallback<T>,
) => {
  if (createAddonCalled) {
    throw new Error(
      "Cannot define a component after 'createAddon' has been called",
    );
  }

  return (...args: T) => {
    let scriptCallbacks: DefineScriptCallback[] = [];

    let functionsAvailable = true;

    const emptyDefine: DefineFileFunc<unknown> = (_content, o = {}) => {
      if (!functionsAvailable) {
        throw new Error("Cannot use 'define' as it is no longer available");
      }

      const onceKey = o.once?.key;
      if (onceKey) {
        if (fileOnceKeys.has(onceKey)) return false;
        fileOnceKeys.add(onceKey);
      }

      const fileName = o.name ?? allFilesCount.toString();
      allFilesCount++;
      return fileName;
    };

    const define: ComponentBodyDefine = {
      serverAnimationController: emptyDefine,
      serverAnimation: emptyDefine,
      biome: emptyDefine,
      block: emptyDefine,
      dialogue: emptyDefine,
      entity: emptyDefine,
      featureRules: emptyDefine,
      feature: emptyDefine,
      item: emptyDefine,
      lootTable: emptyDefine,
      recipe: emptyDefine,
      spawnRules: emptyDefine,
      tradeTable: emptyDefine,
      clientAnimationController: emptyDefine,
      clientAnimation: emptyDefine,
      attachable: emptyDefine,
      clientEntity: emptyDefine,
      particle: emptyDefine,
      renderController: emptyDefine,
      rawText: emptyDefine,
      //
      script(scriptCallback, o = {}) {
        if (!functionsAvailable) {
          throw new Error("Cannot use 'define' as it is no longer available");
        }

        const onceKey = o.once?.key;
        if (onceKey) {
          if (fileOnceKeys.has(onceKey)) return;
          fileOnceKeys.add(onceKey);
        }

        scriptCallbacks.push(scriptCallback);
      },
    };

    function implement(component: Component) {
      if (!functionsAvailable) {
        throw new Error("Cannot use 'implement' as it is no longer available");
      }

      scriptCallbacks = [...component._scriptCallbacks, ...scriptCallbacks];
    }

    callback({ define, implement }, ...args);

    functionsAvailable = false;

    return {
      _fileDefinitions: [],
      _scriptCallbacks: scriptCallbacks,
    };
  };
};
