import { readFile, writeFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const packageJsonUrl = new URL("package.json", projectRoot);
const buildFileUrl = new URL("build/missneo.js", projectRoot);
const outputFileUrl = new URL("missneo.js", projectRoot);
const placeholder = "__MISSNEO_VERSION__";

const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));
const buildSource = await readFile(buildFileUrl, "utf8");

if (
  typeof packageJson.version !== "string" ||
  packageJson.version.length === 0
) {
  throw new Error("package.json に有効な version がありません。");
}

if (!buildSource.includes(placeholder)) {
  throw new Error("配信用JavaScriptにバージョンの挿入位置がありません。");
}

const outputSource = buildSource.replaceAll(placeholder, packageJson.version);
await writeFile(outputFileUrl, outputSource, "utf8");
