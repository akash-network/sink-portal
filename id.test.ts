import assert from "node:assert/strict";
import { test } from "node:test";
import { toBech32 } from "@cosmjs/encoding";
import { decodeSinkId, parseSinkId, sinkIdText } from "./lib/id";
import { portalRoute, recordLink } from "./transfers";

const owner = toBech32("akash", new Uint8Array(20).fill(1));

test("composite IDs preserve integers above JavaScript's safe integer range", () => {
  const text = `${owner}/9223372036854775807/18446744073709551615`;
  assert.equal(parseSinkId(text), text);
  assert.deepEqual(decodeSinkId(text), {
    owner,
    height: 9223372036854775807n,
    sequence: 18446744073709551615n,
  });
  assert.equal(sinkIdText(decodeSinkId(text)), text);
  assert.deepEqual(portalRoute(recordLink(text, "network")), {
    kind: "record",
    id: text,
    networkKey: "network",
  });
});

test("composite IDs reject ambiguous, out-of-range and legacy identities", () => {
  for (const invalid of [
    "1",
    `${owner}/0/1`,
    `${owner}/1/0`,
    `${owner}/01/1`,
    `${owner}/1/01`,
    `${owner}/9223372036854775808/1`,
    `${owner}/1/18446744073709551616`,
    `${owner}/-1/1`,
    `${owner}/1e3/1`,
    `${owner}/1/1/2`,
    `${owner}/1/1 `,
    `${owner.toUpperCase()}/1/1`,
    `${toBech32("akash", new Uint8Array(20))}/1/1`,
    `${toBech32("cosmos", new Uint8Array(20).fill(1))}/1/1`,
  ])
    assert.throws(() => parseSinkId(invalid), undefined, invalid);
});
