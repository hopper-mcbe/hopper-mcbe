import * as mcDefs from "./minecraft_definition_types.js";

export interface FileDefinition {
  path: string;
  content: string;
}

export interface DefineFileOptions {
  /**
   * The file name. Defaults to a unique string.
   */
  name?: string;
  /**
   * The root directory.
   */
  rootDir?: string;
  /**
   * The file extension.
   */
  ext?: string;
  /**
   * Only create the file with this `key` once.
   */
  once?: {
    key: string;
  };
}

export interface DefineFileOptionsNameRequired extends DefineFileOptions {
  /**
   * The file name.
   */
  name: string;
}

export interface DefineFileRawOptions extends DefineFileOptions {
  rootDir: string;
  ext: string;
}

export type DefineFileFunc<T> = (
  content: T,
  options?: DefineFileOptions,
) => string | false;

export type DefineFileFuncOptionsRequired<
  T,
  O extends DefineFileOptions = DefineFileOptions,
> = (content: T, options: O) => string | false;

export interface Define {
  serverAnimationController: DefineFileFunc<mcDefs.b_animation_controller.Main>;
  serverAnimation: DefineFileFunc<mcDefs.b_animations.Main>;
  biome: DefineFileFunc<mcDefs.b_biomes.Main>;
  block: DefineFileFunc<mcDefs.b_blocks.Main>;
  dialogue: DefineFileFuncOptionsRequired<
    mcDefs.b_dialogue.Main,
    DefineFileOptionsNameRequired
  >;
  entity: DefineFileFunc<mcDefs.b_entities.Main>;
  featureRules: DefineFileFunc<mcDefs.b_feature_rules.Main>;
  feature: DefineFileFunc<mcDefs.b_features.Main>;
  item: DefineFileFunc<mcDefs.b_items.Main>;
  lootTable: DefineFileFuncOptionsRequired<
    mcDefs.b_loot_tables.Main,
    DefineFileOptionsNameRequired
  >;
  recipe: DefineFileFunc<mcDefs.b_recipes.Main>;
  spawnRules: DefineFileFunc<mcDefs.b_spawn_rules.Main>;
  tradeTable: DefineFileFuncOptionsRequired<
    mcDefs.b_trading.Main,
    DefineFileOptionsNameRequired
  >;
  clientAnimationController: DefineFileFunc<mcDefs.r_animation_controller.Main>;
  clientAnimation: DefineFileFunc<mcDefs.r_actor_animation.Main>;
  attachable: DefineFileFunc<mcDefs.r_attachables.Main>;
  clientEntity: DefineFileFunc<mcDefs.r_entity.Main>;
  particle: DefineFileFunc<mcDefs.r_particles.Main>;
  renderController: DefineFileFunc<mcDefs.r_render_controllers.Main>;
  rawText: DefineFileFuncOptionsRequired<string, DefineFileRawOptions>;
}

export interface CompileTimeGlobalObject {
  define: Define;
}
