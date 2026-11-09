// package-lock.json pins the integrity of whichever .cache/chain-sdk.tgz was packed when it was
// written. A pack from another machine or chain-sdk commit has a different hash, so `npm ci` fails.
// Drop only that entry's integrity; every other dependency stays pinned. Used by CI and the image.
import { readFileSync, writeFileSync } from "node:fs";

const file = "package-lock.json";
const key = "node_modules/@akashnetwork/chain-sdk";
const lock = JSON.parse(readFileSync(file, "utf8"));
if (!lock.packages?.[key]) throw new Error(`${file} has no ${key}`);
delete lock.packages[key].integrity;
writeFileSync(file, JSON.stringify(lock, null, 2) + "\n");
console.log(`Unpinned ${key} integrity in ${file}`);
