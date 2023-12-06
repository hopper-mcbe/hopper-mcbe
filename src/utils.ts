import * as fs from "fs";
import * as path from "path";

export async function writeFileRecursive(
  filePath: string,
  data: string | Buffer,
) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  return fs.promises.writeFile(filePath, data);
}

export function splitAndConvertElementsToNumber(s: string, splitter: string) {
  return s.split(splitter).map((v) => Number(v));
}

export function resolveFilePathEnvironmentVariables(filePath: string) {
  return filePath.replace(
    /%([^%]+)%/g,
    (original, matched: string) => process.env[matched] || "",
  );
}
