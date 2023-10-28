import * as vm from "vm";
import * as path from "path";
import * as esbuild from "esbuild";
import * as fs from "fs";
import {
  CompileTimeGlobalObject,
  Define,
  DefineFileOptions,
  DefineFileRawOptions,
  FileDefinition,
} from "../types/script_globals_helper_types.js";
import { writeFileRecursive } from "./utils.js";
import * as babelParser from "@babel/parser";
import babelGenerator from "@babel/generator";
import babelTraverse from "@babel/traverse";
import * as babelTypes from "@babel/types";

function executeAndGetFileDefs(bundleContent: string): FileDefinition[] {
  const ast = babelParser.parse(bundleContent, { sourceType: "module" });

  babelTraverse.default(ast, {
    LabeledStatement(path) {
      if (path.node.label.name !== "$") return;
      path.remove();
    },
    MemberExpression(path) {
      if (
        path.node.object.type !== "Identifier" ||
        path.node.object.name !== "$"
      )
        return;

      path
        .findParent((path) => !path.isMemberExpression())
        ?.replaceWith(babelTypes.nullLiteral());
    },
  });

  const finalCode = babelGenerator.default(ast).code;

  console.log(finalCode);

  let allFilesCount = 0;
  const fileOnceKeys = new Set();

  const fileDefinitions: FileDefinition[] = [];

  function defineFile(content: string, o: DefineFileRawOptions) {
    const onceKey = o.once?.key;
    if (onceKey) {
      if (fileOnceKeys.has(onceKey)) return false;
      fileOnceKeys.add(onceKey);
    }

    const fileName = o.name ?? allFilesCount.toString();

    fileDefinitions.push({
      path: path.join(o.rootDir, `${fileName}.${o.ext}`),
      content,
    });

    allFilesCount++;

    return fileName;
  }

  function defineJsonFile(
    defaultRootDir: string,
    content: object,
    o: DefineFileOptions = {},
  ) {
    return defineFile(JSON.stringify(content), {
      name: o.name,
      rootDir: o.rootDir ?? defaultRootDir,
      ext: o.ext ?? "json",
    });
  }

  const define: Define = {
    serverAnimationController: (content, o) =>
      defineJsonFile("BP/animation_controllers", content, o),
    serverAnimation: (content, o) =>
      defineJsonFile("BP/animations", content, o),
    biome: (content, o) => defineJsonFile("BP/biomes", content, o),
    block: (content, o) => defineJsonFile("BP/blocks", content, o),
    dialogue: (content, o) => defineJsonFile("BP/dialogue", content, o),
    entity: (content, o) => defineJsonFile("BP/entities", content, o),
    featureRules: (content, o) =>
      defineJsonFile("BP/feature_rules", content, o),
    feature: (content, o) => defineJsonFile("BP/features", content, o),
    item: (content, o) => defineJsonFile("BP/items", content, o),
    lootTable: (content, o) => defineJsonFile("BP/loot_tables", content, o),
    recipe: (content, o) => defineJsonFile("BP/recipes", content, o),
    spawnRules: (content, o) => defineJsonFile("BP/spawn_rules", content, o),
    tradeTable: (content, o) => defineJsonFile("BP/trading", content, o),
    clientAnimationController: (content, o) =>
      defineJsonFile("RP/animation_controllers", content, o),
    clientAnimation: (content, o) =>
      defineJsonFile("RP/animations", content, o),
    attachable: (content, o) => defineJsonFile("RP/attachables", content, o),
    clientEntity: (content, o) => defineJsonFile("RP/entity", content, o),
    particle: (content, o) => defineJsonFile("RP/particles", content, o),
    renderController: (content, o) =>
      defineJsonFile("RP/render_controllers", content, o),
    rawText: defineFile,
  };

  const _: CompileTimeGlobalObject = { define };

  const context = vm.createContext({ _ });

  vm.runInContext(finalCode, context);

  return fileDefinitions;
}

type MinecraftManifestDependency =
  | {
      module_name: string;
      version: string;
      "hopper:alias": string;
    }
  | {
      uuid: string;
      version: string;
    };

interface MinecraftManifest {
  dependencies?: MinecraftManifestDependency[];
}

type BuildOutOptions = { outPath: string } | { comMojangPath: string };

interface BuildOptions {
  includeRp: boolean;
  indexPath: string;
  assetsPath: string;
  optimize: boolean;
  out: BuildOutOptions;
  name: string;
  copyAssets: boolean;
}

export function getOutPath(name: string, outOptions: BuildOutOptions) {
  const outDirBp =
    "outPath" in outOptions
      ? path.join(outOptions.outPath, "BP")
      : path.join(outOptions.comMojangPath, "development_behavior_packs", name);

  const outDirRp =
    "outPath" in outOptions
      ? path.join(outOptions.outPath, "RP")
      : path.join(outOptions.comMojangPath, "development_resource_packs", name);

  return { outDirBp, outDirRp };
}

export async function build(options: BuildOptions) {
  const bpManifestPath = path.join(options.assetsPath, "BP/manifest.json");
  const rpManifestPath = path.join(options.assetsPath, "RP/manifest.json");

  if (!fs.existsSync(bpManifestPath)) {
    throw new Error(`'${bpManifestPath}' does not exist`);
  }

  if (!fs.existsSync(rpManifestPath)) {
    throw new Error(`'${rpManifestPath}' does not exist`);
  }

  if (!fs.existsSync(options.indexPath)) {
    throw new Error(`'${options.indexPath}' does not exist`);
  }

  const bundleContent = (
    await esbuild.build({
      bundle: true,
      entryPoints: [options.indexPath],
      format: "esm",
      write: false,
    })
  ).outputFiles[0].text;

  const fileDefs = executeAndGetFileDefs(bundleContent);

  const { outDirBp, outDirRp } = getOutPath(options.name, options.out);

  await fs.promises.mkdir(outDirBp, { recursive: true });
  if (options.includeRp) await fs.promises.mkdir(outDirRp, { recursive: true });

  const writePromises: Promise<unknown>[] = [];

  if (options.copyAssets) {
    writePromises.push(
      fs.promises.cp(path.join(options.assetsPath, "BP"), outDirBp, {
        recursive: true,
      }),
    );

    if (options.includeRp) {
      writePromises.push(
        fs.promises.cp(path.join(options.assetsPath, "RP"), outDirRp, {
          recursive: true,
        }),
      );
    }
  }

  if (options.includeRp) {
    writePromises.push(
      fs.promises.copyFile(
        rpManifestPath,
        path.join(outDirRp, "manifest.json"),
      ),
    );
  }

  writePromises.push(
    fs.promises.copyFile(bpManifestPath, path.join(outDirBp, "manifest.json")),
  );

  for (const fileDef of fileDefs) {
    const outPath = fileDef.path.startsWith("BP") ? outDirBp : outDirRp;
    writePromises.push(
      writeFileRecursive(
        path.join(outPath, fileDef.path.slice(3)),
        fileDef.content,
      ),
    );
  }

  const bpManifest = JSON.parse(
    await fs.promises.readFile(bpManifestPath, "utf8"),
  ) as MinecraftManifest;

  // create runtime banner
  let imports = "";
  let modulesKeyVal = "";
  for (const [i, dependency] of (bpManifest.dependencies ?? []).entries()) {
    if (!("module_name" in dependency)) continue;

    const alias = dependency["hopper:alias"] || dependency.module_name;
    const importName = `__scriptModule${i}__`;

    imports += `import*as ${importName} from"${dependency.module_name}";`;
    modulesKeyVal += `"${alias}":${importName},`;
  }
  const banner = `${imports}const $={${modulesKeyVal}};`;
  //

  const ast = babelParser.parse(bundleContent, { sourceType: "module" });

  babelTraverse.default(ast, {
    LabeledStatement(path) {
      if (path.node.label.name !== "_") return;
      path.remove();
    },
    MemberExpression(path) {
      if (
        path.node.object.type !== "Identifier" ||
        path.node.object.name !== "_"
      )
        return;

      path
        .findParent((path) => !path.isMemberExpression())
        ?.replaceWith(babelTypes.nullLiteral());
    },
  });

  let finalBundleContent = banner + babelGenerator.default(ast).code;

  if (options.optimize) {
    finalBundleContent = (
      await esbuild.transform(finalBundleContent, {
        format: "esm",
        minify: true,
      })
    ).code;
  }

  writePromises.push(
    writeFileRecursive(
      path.join(outDirBp, "scripts/bundle.js"),
      finalBundleContent,
    ),
  );

  await Promise.all(writePromises);
}
