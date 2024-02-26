#!/usr/bin/env node
import { Command } from "commander";
import ora from "ora";
import { build, getOutPath } from "./build.js";
import * as path from "path";
import * as fs from "fs";
import inquirer from "inquirer";
import * as uuid from "uuid";
import * as childProcess from "child_process";
import {
  resolveFilePathEnvironmentVariables,
  splitAndConvertElementsToNumber,
  writeFileRecursive,
} from "./utils.js";
import chalk from "chalk";
import chokidar from "chokidar";
import { VERSION } from "./common.js";

const program = new Command();

const MINECRAFT_SCRIPT_MODULES = {
  "@minecraft/server-gametest": { alias: "serverGametest" },
  "@minecraft/server-ui": { alias: "serverUi" },
  "@minecraft/server": { alias: "server" },
  "@minecraft/server-editor": { alias: "serverEditor" },
  "@minecraft/server-admin": { alias: "serverAdmin" },
  "@minecraft/server-net": { alias: "serverNet" },
};

const DEFAULT_COM_MOJANG_PATH =
  "%localappdata%\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe\\LocalState\\games\\com.mojang";

program
  .name("hopper")
  .description(
    "Minecraft add-on preprocessor designed to make add-ons more organized.",
  )
  .version(VERSION);

program
  .command("clean")
  .description("Remove a project from the com.mojang directory")
  .argument("<name>", "The name of the project")
  .argument(
    "[path]",
    "The path to the com.mojang directory",
    DEFAULT_COM_MOJANG_PATH,
  )
  .action(async (name: string, comMojangPath: string) => {
    const spinner = ora("Cleaning").start();

    const resolvedComMojangPath =
      resolveFilePathEnvironmentVariables(comMojangPath);

    await Promise.all([
      fs.promises.rm(
        path.join(resolvedComMojangPath, "development_behavior_packs", name),
        { force: true, recursive: true },
      ),
      fs.promises.rm(
        path.join(resolvedComMojangPath, "development_resource_packs", name),
        { force: true, recursive: true },
      ),
    ]);

    spinner.succeed();
  });

program
  .command("watch")
  .description(
    "Watch a project and automatically build it when a file is updated",
  )
  .argument("<name>", "The name of the project")
  .option(
    "-m, --com-mojang [path]",
    `Specify the com.mojang path. Use '--out' to specify a specific out directory. If [path] is not specified it will be '${DEFAULT_COM_MOJANG_PATH}'`,
  )
  .option(
    "-o, --out <path>",
    "Specify the out directory path. Use '--com-mojang' to output to the com.mojang directory",
  )
  .option("--no-rp", "Do not include a RP")
  .option("-O, --optimize", "Should optimize the output script bundle")
  .option("--src <path>", "Path to the source directory", "src")
  .option("--entry <path>", "Path to the entry file", "src/index.ts")
  .option("--assets <path>", "Path to the assets directory", "assets")
  .action(
    (
      name: string,
      options: {
        comMojang?: boolean | string;
        out?: string;
        rp: boolean;
        optimize?: boolean;
        src: string;
        entry: string;
        assets: string;
      },
    ) => {
      if (!options.comMojang && !options.out) {
        return void ora().fail("'--com-mojang' or '--out' must be specified");
      }

      if (options.comMojang && options.out) {
        return void ora().fail(
          "Cannot specify both '--com-mojang' and '--out'. Use one",
        );
      }

      const buildOptions = {
        name,
        copyAssets: false,
        includeRp: options.rp,
        indexPath: options.entry,
        assetsPath: options.assets,
        optimize: !!options.optimize,
        out: options.out
          ? { outPath: resolveFilePathEnvironmentVariables(options.out) }
          : {
              comMojangPath: resolveFilePathEnvironmentVariables(
                typeof options.comMojang === "string"
                  ? options.comMojang
                  : DEFAULT_COM_MOJANG_PATH,
              ),
            },
      };

      const ui = new inquirer.ui.BottomBar({
        bottomBar: `\n${chalk.bold("[Hopper]")} Watching ${name}`,
      });

      function log(
        type: "scriptUpdate" | "assetUpdate" | "error" | "info",
        message: string,
      ) {
        ui.log.write(
          `${
            type === "scriptUpdate"
              ? chalk.green("[Script Update]")
              : type === "assetUpdate"
                ? chalk.green("[Asset Update]")
                : type === "error"
                  ? chalk.red("[Error]")
                  : chalk.blue("[Info]")
          } ${message}`,
        );
      }

      let isRebuilding = true;
      let shouldRebuild = false;

      // initial build
      log("info", "Running initial build");
      build({ ...buildOptions, copyAssets: true })
        .then(() => {
          log("info", "Completed initial build");
        })
        .catch((err) => {
          log("error", (err as Error).message);
        })
        .finally(() => {
          if (shouldRebuild) {
            shouldRebuild = false;
            scriptRebuild();
          } else {
            isRebuilding = false;
          }
        });
      // --

      function scriptRebuild() {
        isRebuilding = true;

        log("info", "Rebuilding scripts");

        build(buildOptions)
          .then(() => {
            log("info", "Completed script rebuild");
          })
          .catch((err) => {
            log("error", (err as Error).message);
          })
          .finally(() => {
            if (shouldRebuild) {
              shouldRebuild = false;
              scriptRebuild();
            } else {
              isRebuilding = false;
            }
          });
      }

      chokidar.watch(options.src).on("change", (filePath) => {
        log("scriptUpdate", filePath);

        if (isRebuilding) {
          shouldRebuild = true;
          return;
        }

        scriptRebuild();
      });

      chokidar.watch(options.assets).on("change", (filePath) => {
        log("assetUpdate", filePath);

        try {
          const relPath = path.relative(options.assets, filePath);
          const { outDirBp, outDirRp } = getOutPath(name, buildOptions.out);
          const outPath = path.join(
            relPath.startsWith("BP") ? outDirBp : outDirRp,
            relPath.slice(3),
          );
          writeFileRecursive(outPath, fs.readFileSync(filePath)).catch(
            (err) => {
              log("error", (err as Error).message);
            },
          );
        } catch (err) {
          log("error", (err as Error).message);
        }
      });
    },
  );

program
  .command("build")
  .description("Build a project")
  .argument("<name>", "The name of the project")
  .option(
    "-m, --com-mojang [path]",
    `Specify the com.mojang path. Use '--out' to specify a specific out directory. If [path] is not specified it will be '${DEFAULT_COM_MOJANG_PATH}'`,
  )
  .option(
    "-o, --out <path>",
    "Specify the out directory path. Use '--com-mojang' to output to the com.mojang directory",
  )
  .option("--no-rp", "Do not include a RP")
  .option("-O, --optimize", "Should optimize the output script bundle")
  .option("--entry <path>", "Path to the entry file", "src/index.ts")
  .option("--assets <path>", "Path to the assets directory", "assets")
  .action(
    (
      name: string,
      options: {
        comMojang?: boolean | string;
        out?: string;
        rp: boolean;
        optimize?: boolean;
        entry: string;
        assets: string;
      },
    ) => {
      if (!options.comMojang && !options.out) {
        return void ora().fail("'--com-mojang' or '--out' must be specified");
      }

      if (options.comMojang && options.out) {
        return void ora().fail(
          "Cannot specify both '--com-mojang' and '--out'. Use one",
        );
      }

      const spinner = ora("Building project").start();

      build({
        name,
        copyAssets: true,
        includeRp: options.rp,
        indexPath: options.entry,
        assetsPath: options.assets,
        optimize: !!options.optimize,
        out: options.out
          ? { outPath: resolveFilePathEnvironmentVariables(options.out) }
          : {
              comMojangPath: resolveFilePathEnvironmentVariables(
                typeof options.comMojang === "string"
                  ? options.comMojang
                  : DEFAULT_COM_MOJANG_PATH,
              ),
            },
      })
        .then(() => spinner.succeed())
        .catch((error) => spinner.fail((error as Error).message));
    },
  );

program
  .command("init")
  .description("Initialize a new project")
  .action(async () => {
    const inquirerResponse = await inquirer.prompt<{
      name: string;
      includeRp: boolean;
      targetVersion: string;
      scriptModules: string[];
    }>([
      {
        type: "input",
        name: "name",
        message: "Enter the name of your project:",
      },
      {
        type: "confirm",
        name: "includeRp",
        message: "Include a RP?",
      },
      {
        type: "input",
        name: "targetVersion",
        message: "Enter your target Minecraft version (eg. 1.20.0):",
        validate: (input: string) =>
          input.split(".").length === 3 ||
          "Must be in 'x.x.x' format where 'x' is an integer.",
      },
      {
        type: "checkbox",
        name: "scriptModules",
        message: "Which script modules do you plan to use?",
        choices: Object.keys(MINECRAFT_SCRIPT_MODULES),
      },
    ]);

    const scriptModulesSpinner = ora(
      "Fetching script module types from npm",
    ).start();

    let anyExecsFailed = false;
    const typeVersionPrompts: any[] = [];
    const execPromises: Promise<void>[] = [];

    for (const scriptModule of inquirerResponse.scriptModules) {
      execPromises.push(
        new Promise<void>((resolve) => {
          childProcess.exec(
            `npm view ${scriptModule} versions`,
            (error, stdout) => {
              if (error) {
                console.warn(error);
                anyExecsFailed = true;
                return resolve();
              }

              typeVersionPrompts.push({
                type: "list",
                name: scriptModule,
                message: `Which version of ${scriptModule} to use?`,
                choices: (JSON.parse(stdout.replaceAll("'", '"')) as string[])
                  // do not include release candidates
                  .filter((v) => !v.includes("-rc"))
                  // only show 20
                  .slice(-20)
                  // reverse so latest is at the top
                  .reverse(),
              });

              resolve();
            },
          );
        }),
      );
    }

    await Promise.all(execPromises);

    if (anyExecsFailed)
      scriptModulesSpinner.warn("Some script modules could not be fetched");
    else scriptModulesSpinner.succeed();

    const typeVersionPromptResponse = await inquirer.prompt<{
      [k: string]: string;
    }>(typeVersionPrompts);

    const moduleDependencies = Object.entries(typeVersionPromptResponse).map(
      ([moduleName, npmVersion]) => ({
        module_name: moduleName,
        "hopper:alias":
          MINECRAFT_SCRIPT_MODULES[
            moduleName as keyof typeof MINECRAFT_SCRIPT_MODULES
          ].alias,
        version: npmVersion.includes("-beta")
          ? npmVersion.split("-beta")[0] + "-beta"
          : npmVersion,
      }),
    );

    const spinner = ora("Scaffolding project").start();

    try {
      await fs.promises.mkdir(inquirerResponse.name);

      const bpUuid = uuid.v4();
      const rpUuid = uuid.v4();

      const minEngineVersion = splitAndConvertElementsToNumber(
        inquirerResponse.targetVersion,
        ".",
      );

      await Promise.all([
        fs.promises.mkdir(path.join(inquirerResponse.name, "assets")),
        fs.promises.mkdir(path.join(inquirerResponse.name, "types")),
        fs.promises.mkdir(path.join(inquirerResponse.name, "src")),
        fs.promises.writeFile(
          path.join(inquirerResponse.name, ".gitignore"),
          "/build\n/node_modules",
        ),
        fs.promises.writeFile(
          path.join(inquirerResponse.name, "tsconfig.json"),
          JSON.stringify(
            {
              include: ["./src"],
              compilerOptions: {
                types: [
                  "@hopper-mcbe/hopper-mcbe/types/script_globals",
                  "./types/script_globals",
                ],
                forceConsistentCasingInFileNames: true,
                strict: true,
                target: "es2022",
                module: "es2022",
                moduleResolution: "bundler",
                noEmit: true,
                skipLibCheck: true,
              },
            },
            undefined,
            4,
          ),
        ),
        fs.promises.writeFile(
          path.join(inquirerResponse.name, "package.json"),
          JSON.stringify(
            {
              type: "module",
              scripts: {
                "build-dev": `hopper build "${inquirerResponse.name}"${
                  inquirerResponse.includeRp ? "" : " --no-rp"
                } -m`,
                "build-prod": `hopper build "${inquirerResponse.name}"${
                  inquirerResponse.includeRp ? "" : " --no-rp"
                } -Oo build`,
                watch: `hopper watch "${inquirerResponse.name}" -m`,
                clean: `hopper clean "${inquirerResponse.name}"`,
              },
              devDependencies: {
                "@hopper-mcbe/hopper-mcbe": `^${VERSION}`,
                ...typeVersionPromptResponse,
              },
            },
            undefined,
            4,
          ),
        ),
      ]);

      let writePromises: Promise<unknown>[] = [
        fs.promises.mkdir(path.join(inquirerResponse.name, "assets/BP/texts"), {
          recursive: true,
        }),
        fs.promises.writeFile(
          path.join(inquirerResponse.name, "src/index.ts"),
          "",
        ),
        fs.promises.writeFile(
          path.join(inquirerResponse.name, "types/script_globals.d.ts"),
          `declare global {\n\tvar $: {\n\t\t${inquirerResponse.scriptModules
            .map(
              (moduleName) =>
                `"${
                  MINECRAFT_SCRIPT_MODULES[
                    moduleName as keyof typeof MINECRAFT_SCRIPT_MODULES
                  ].alias
                }": typeof import("${moduleName}")`,
            )
            .join("\n\t\t")}\n\t}\n}\nexport {};`,
        ),
      ];

      if (inquirerResponse.includeRp) {
        writePromises.push(
          fs.promises.mkdir(
            path.join(inquirerResponse.name, "assets/RP/texts"),
            {
              recursive: true,
            },
          ),
        );
      }

      await Promise.all(writePromises);

      const languagesJson = '["en_US"]';
      const langContent = `pack.name=${inquirerResponse.name}\npack.description=${inquirerResponse.name}`;

      writePromises = [
        fs.promises.writeFile(
          path.join(inquirerResponse.name, "assets/BP/manifest.json"),
          JSON.stringify(
            {
              format_version: 2,
              header: {
                name: "pack.name",
                description: "pack.description",
                min_engine_version: minEngineVersion,
                uuid: bpUuid,
                version: [1, 0, 0],
              },
              modules: [
                {
                  type: "data",
                  uuid: uuid.v4(),
                  version: [1, 0, 0],
                },
                {
                  type: "script",
                  language: "javascript",
                  uuid: uuid.v4(),
                  entry: "scripts/bundle.js",
                  version: [1, 0, 0],
                },
              ],
              dependencies: [
                ...moduleDependencies,
                ...(inquirerResponse.includeRp
                  ? [{ uuid: rpUuid, version: [1, 0, 0] }]
                  : []),
              ],
            },
            undefined,
            4,
          ),
        ),

        fs.promises.writeFile(
          path.join(inquirerResponse.name, "assets/BP/texts/languages.json"),
          languagesJson,
        ),
        fs.promises.writeFile(
          path.join(inquirerResponse.name, "assets/BP/texts/en_US.lang"),
          langContent,
        ),
      ];

      if (inquirerResponse.includeRp) {
        writePromises.push(
          fs.promises.writeFile(
            path.join(inquirerResponse.name, "assets/RP/manifest.json"),
            JSON.stringify(
              {
                format_version: 2,
                header: {
                  name: "pack.name",
                  description: "pack.description",
                  min_engine_version: minEngineVersion,
                  uuid: rpUuid,
                  version: [1, 0, 0],
                },
                modules: [
                  {
                    type: "resources",
                    uuid: uuid.v4(),
                    version: [1, 0, 0],
                  },
                ],
                dependencies: [{ uuid: bpUuid, version: [1, 0, 0] }],
              },
              undefined,
              4,
            ),
          ),
        );

        writePromises.push(
          fs.promises.writeFile(
            path.join(inquirerResponse.name, "assets/RP/texts/languages.json"),
            languagesJson,
          ),
        );

        writePromises.push(
          fs.promises.writeFile(
            path.join(inquirerResponse.name, "assets/RP/texts/en_US.lang"),
            langContent,
          ),
        );
      }

      await Promise.all(writePromises);

      spinner.succeed();
    } catch (error) {
      spinner.fail((error as Error).message);
    }

    const shouldInstallDependenciesPrompt = await inquirer.prompt<{
      installDependencies: boolean;
    }>([
      {
        type: "confirm",
        name: "installDependencies",
        message: `Automatically run ${chalk.yellowBright(
          "npm install",
        )} in the project directory to install dependencies?`,
      },
    ]);

    const outFullPath = path.join(process.cwd(), inquirerResponse.name);

    if (shouldInstallDependenciesPrompt.installDependencies) {
      const spinner = ora("npm install").start();
      await new Promise<void>((resolve) => {
        childProcess.exec("npm install", { cwd: outFullPath }, (error) => {
          if (error) {
            spinner.fail(error.message);
          } else {
            spinner.succeed();
          }

          resolve();
        });
      });
    }

    ora().succeed(`Your project has been written to '${outFullPath}'`);
  });

program.parse();
