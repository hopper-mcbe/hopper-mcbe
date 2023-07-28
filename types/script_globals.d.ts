import {
  CreateAddonGlobalFunc,
  DefineComponentGlobalFunc,
} from "./script_globals_helper_types.js";

declare global {
  var createAddon: CreateAddonGlobalFunc;
  var defineComponent: DefineComponentGlobalFunc;
}
export {};
