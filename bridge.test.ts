import {
  boundsAnswer,
  boundsHelp,
  transferBounds,
  transferStatus,
  visibleTransfers,
  transferKey,
  displayAmount,
  shortenIdentifier,
  shortAddress,
  submittedLabel,
  transactionLink,
  recordLink,
  portalRoute,
} from "./transfers";
import assert from "node:assert/strict";
import { test } from "node:test";
import { toBech32 } from "@cosmjs/encoding";
import { BroadcastTxError } from "@cosmjs/stargate";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { AuthInfo, TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import {
  DestType,
  MsgSink,
} from "@akashnetwork/chain-sdk/private-types/akash.v1";
import {
  GUARDIAN_PAUSE_TYPE,
  SINK_MSG_TYPE,
  guardianPauseMessage,
  sinkMessage,
  sinkRegistry,
  sinkAminoTypes,
} from "./lib/sink";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";
import type {
  BridgeConfig,
  BridgeReceipt,
  DiscoveredSubmission,
  SavedSubmission,
  SignedSubmission,
} from "./contracts";
import {
  checkDiscovered,
  loadSubmissions,
  LEGACY_STORAGE_KEY,
  mergeDiscovered,
  STORAGE_KEY,
  saveSubmission,
  submitIntent,
  validateSigned,
  type Intent,
  type SubmissionAdapters,
} from "./bridge";
import {
  amountStyle,
  checkAmount,
  checkDestination,
  clientPause,
  formatAmount,
  fresh,
  matchReceipt,
  parseAmount,
  parseConfig,
  parseHistory,
  parseReceipt,
  parseLookup,
  parseSaved,
  parseSigned,
  publicKey,
  receiptView,
  syncServerClock,
} from "./model";

const secret = new Uint8Array(32).fill(7);
const recipient = base58.encode(ed25519.getPublicKey(secret));
const sender = toBech32("akash", new Uint8Array(20).fill(1));
const sink = toBech32("akash", new Uint8Array(20).fill(2));
const config: BridgeConfig = {
  version: 2,
  checkedAt: new Date().toISOString(),
  akashHeight: "100",
  network: {
    networkKey: JSON.stringify([
      "akash-private-1",
      "2026-10-12T15:29:30.455284000Z",
      recipient,
      recipient,
      recipient,
      sink,
    ]),
    chainId: "akash-private-1",
    akashGenesisTime: "2026-10-12T15:29:30.455284000Z",
    solanaGenesisHash: recipient,
    mint: recipient,
    program: recipient,
    sinkAddress: sink,
  },
  rpcPath: "/rpc/akash",
  restPath: "/rest/akash",
  denom: "uakt",
  decimals: 6,
  fee: { amountUakt: "12500", gas: "500000" },
  limits: {
    enabled: true,
    minTransferUakt: "1",
    maxTransferUakt: "100000000",
    maxEpochAmountTotalUakt: "1000000000000",
    maxEpochAmountPerAccountUakt: "100000000000",
  },
  client: {
    status: "active",
    latestHeight: "99",
    ageSeconds: 5,
    trustingPeriodSeconds: 86_400,
  },
};
function intent(): Intent {
  return {
    config,
    sender,
    recipient,
    amountUakt: "1000001",
    generation: 1,
    expiresAt: Date.now() + 300_000,
    nonce: "test-nonce",
    origin: "https://private.example",
  };
}
function signed(i = intent()): TxRaw {
  return TxRaw.fromPartial({
    bodyBytes: TxBody.encode(
      TxBody.fromPartial({
        messages: [
          {
            typeUrl: SINK_MSG_TYPE,
            value: sinkRegistry().encode(
              sinkMessage({
                sender: i.sender,
                recipient: i.recipient,
                amountUakt: i.amountUakt,
              }),
            ),
          },
        ],
        memo: "",
      }),
    ).finish(),
    authInfoBytes: AuthInfo.encode(
      AuthInfo.fromPartial({
        signerInfos: [
          {
            modeInfo: { single: { mode: SignMode.SIGN_MODE_DIRECT } },
            sequence: 1n,
          },
        ],
        fee: {
          amount: [{ denom: "uakt", amount: config.fee.amountUakt }],
          gasLimit: BigInt(config.fee.gas),
        },
      }),
    ).finish(),
    signatures: [new Uint8Array(64).fill(1)],
  });
}
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
function adapters(
  overrides: Partial<SubmissionAdapters> = {},
): SubmissionAdapters {
  return {
    generation: () => 1,
    now: Date.now,
    sign: async (i) => signed(i),
    save: () => {},
    broadcast: async () => "A".repeat(64),
    stage: () => {},
    saved: () => {},
    ...overrides,
  };
}
function receipt(): Extract<BridgeReceipt, { kind: "deposit" }> {
  return {
    version: 2,
    networkKey: config.network.networkKey,
    txHash: "A".repeat(64),
    checkedAt: new Date().toISOString(),
    kind: "deposit",
    deposit: {
      id: `${sender}/100/4`,
      sender,
      recipient,
      amountUakt: "1000001",
      height: "100",
    },
    akash: {
      status: "transfer_pending",
      hold: "none",
      height: "110",
      timeSeconds: "1800000000",
      challengeEndSeconds: null,
      refundsEnabled: true,
    },
    solana: { kind: "absent", contextSlot: "200" },
  };
}
test("receipts retain native 32-byte and maximum-length Akash owners", () => {
  for (const length of [32, 255]) {
    const owner = toBech32("akash", new Uint8Array(length).fill(7), 500);
    const r = receipt();
    r.deposit.sender = owner;
    r.deposit.id = `${owner}/100/4`;
    assert.deepEqual(parseReceipt(r), r);
  }
});

test("amounts preserve every base unit and reject rounding or scientific notation", () => {
  assert.equal(parseAmount("1.000001"), 1_000_001n);
  assert.equal(parseAmount("0.000001"), 1n);
  assert.equal(formatAmount(1_000_001n), "1.000001");
  assert.equal(
    formatAmount(parseAmount("18446744073709.551615")),
    "18446744073709.551615",
  );
  for (const invalid of [
    "0",
    "-1",
    "1e3",
    "0.0000001",
    "1,000",
    "18446744073709.551616",
  ])
    assert.throws(() => parseAmount(invalid));
});
test("amount input is checked as typed; ambiguous text is an error, never rewritten", () => {
  const valid = (text: string) => {
    const checked = checkAmount(text);
    assert.equal(checked.state, "valid", text);
    return checked.state === "valid" ? checked.amount : -1n;
  };
  assert.equal(valid("0.125"), 125_000n);
  assert.equal(valid(" 5 "), 5_000_000n);
  assert.equal(valid("1."), 1_000_000n);
  assert.equal(valid(".5"), 500_000n);
  assert.equal(valid("01"), 1_000_000n);
  assert.equal(valid("1248.123456"), 1_248_123_456n);
  for (const [text, message] of [
    ["0,125", /period/],
    ["1,248.5", /period/],
    ["12,5", /period/],
    ["-5", /sign/],
    ["+5", /sign/],
    ["1e-7", /digits/],
    ["1E3", /digits/],
    ["12 345", /digits/],
    ["1.2.3", /digits/],
    ["5 AKT", /digits/],
    ["0x10", /digits/],
    ["1.9999999", /6 decimal/],
    ["0.0000001", /6 decimal/],
    ["18446744073709.551616", /too large/],
    ["100000000000000", /too large/],
  ] as const) {
    const checked = checkAmount(text);
    assert.equal(checked.state, "invalid", text);
    if (checked.state === "invalid") assert.match(checked.message, message);
    assert.throws(() => parseAmount(text), message);
  }
  for (const text of ["", "  "]) assert.equal(checkAmount(text).state, "empty");
  for (const text of [".", "0", "0.", "0.000000", "000"])
    assert.equal(checkAmount(text).state, "incomplete", text);
  assert.throws(() => parseAmount("0"), /greater than 0/);
});
test("decimal-comma locales enter and see amounts with a comma only", () => {
  assert.deepEqual(amountStyle("en-US"), { decimal: ".", group: "," });
  const german = amountStyle("de-DE");
  assert.deepEqual(german, { decimal: ",", group: "." });
  assert.equal(amountStyle("fr-FR").decimal, ",");
  const valid = (text: string) => {
    const checked = checkAmount(text, german);
    assert.equal(checked.state, "valid", text);
    return checked.state === "valid" ? checked.amount : -1n;
  };
  assert.equal(valid("0,125"), 125_000n);
  assert.equal(valid("1248,123456"), 1_248_123_456n);
  assert.equal(valid(",5"), 500_000n);
  for (const [text, message] of [
    ["0.125", /comma/],
    ["1.248,5", /comma/],
    ["1,2,3", /digits/],
    ["-5", /sign/],
    ["1,9999999", /6 decimal/],
  ] as const) {
    const checked = checkAmount(text, german);
    assert.equal(checked.state, "invalid", text);
    if (checked.state === "invalid") assert.match(checked.message, message);
    assert.throws(() => parseAmount(text, german), message);
  }
  assert.equal(checkAmount(",", german).state, "incomplete");
  assert.equal(formatAmount(1_248_500_000n, ","), "1248,5");
  assert.equal(displayAmount(1_248_500_000n, german), "1.248,50");
  assert.equal(displayAmount(1_248_500_000n), "1,248.50");
});
test("config parsing binds network identity and validates keys", () => {
  assert.deepEqual(parseConfig(config), config);
  for (const change of [
    { chainId: "wrong" },
    { akashGenesisTime: "2026-10-18T09:00:00.000000000Z" },
  ])
    assert.throws(
      () =>
        parseConfig({
          ...config,
          network: { ...config.network, ...change },
        }),
      /identity/,
    );
  assert.throws(() =>
    parseConfig({
      ...config,
      network: { ...config.network, akashGenesisTime: "yesterday" },
    }),
  );
  // Saved history from before a rebuild with the same chain ID stays hidden.
  const legacy = JSON.stringify([
    "akash-private-1",
    recipient,
    recipient,
    recipient,
    sink,
  ]);
  const old: SavedSubmission = {
    version: 1,
    networkKey: legacy,
    txHash: "A".repeat(64),
    transferId: "1",
    sender,
    recipient,
    amountUakt: "1000000",
    createdAt: "2026-10-15T10:00:00.000Z",
  };
  assert.deepEqual(
    visibleTransfers([old], config.network.networkKey, sender),
    [],
  );
  assert.throws(
    () => publicKey("11111111111111111111111111111111", true),
    /nonzero/,
  );
});
test("active amount limits are required and the account cap may be unlimited", () => {
  for (const key of [
    "minTransferUakt",
    "maxTransferUakt",
    "maxEpochAmountPerAccountUakt",
    "maxEpochAmountTotalUakt",
  ]) {
    for (const value of [undefined, "-1", "1.5", "", 1])
      assert.throws(() =>
        parseConfig({ ...config, limits: { ...config.limits, [key]: value } }),
      );
    if (key !== "maxEpochAmountPerAccountUakt")
      assert.throws(() =>
        parseConfig({ ...config, limits: { ...config.limits, [key]: "0" } }),
      );
  }
  assert.throws(() => parseConfig({ ...config, version: 1 }), /Unsupported/);
  const limits = {
    ...config.limits,
    minTransferUakt: "1000000",
    maxTransferUakt: "1000000000",
    maxEpochAmountPerAccountUakt: "5000000000",
    maxEpochAmountTotalUakt: "10000000000",
  };
  assert.deepEqual(transferBounds(limits), { min: 1000000n, max: 1000000000n });
  assert.equal(
    boundsHelp(limits),
    "From 1.00 to 1,000.00 AKT per transfer. Up to 5,000.00 AKT per account each quota period.",
  );
  assert.match(
    boundsAnswer(limits),
    /All accounts share a 10,000.00 AKT limit per quota period/,
  );
  assert.match(
    boundsAnswer(limits),
    /next configured quota period\. Solana mints can proceed as soon/,
  );
  assert.equal(boundsHelp(undefined), "Transfer limits are loading.");
  const unlimited = { ...limits, maxEpochAmountPerAccountUakt: "0" };
  assert.equal(
    parseConfig({ ...config, limits: unlimited }).limits
      .maxEpochAmountPerAccountUakt,
    "0",
  );
  assert.match(boundsHelp(unlimited), /No separate per-account amount limit/);
  assert.match(boundsAnswer(unlimited), /All accounts share a 10,000.00 AKT/);
});
test("independent quota caps bound transfers and a paused minimum may be zero", () => {
  const limits = {
    ...config.limits,
    minTransferUakt: "1000000",
    maxTransferUakt: "10000000",
    maxEpochAmountPerAccountUakt: "5000000",
    maxEpochAmountTotalUakt: "8000000",
  };
  assert.deepEqual(parseConfig({ ...config, limits }).limits, limits);
  assert.deepEqual(transferBounds(limits), { min: 1000000n, max: 5000000n });
  assert.deepEqual(
    transferBounds({ ...limits, maxEpochAmountPerAccountUakt: "0" }),
    { min: 1000000n, max: 8000000n },
  );
  for (const key of ["maxEpochAmountPerAccountUakt", "maxEpochAmountTotalUakt"])
    assert.throws(() =>
      parseConfig({ ...config, limits: { ...limits, [key]: "999999" } }),
    );
  const paused = { ...limits, enabled: false, minTransferUakt: "0" };
  assert.deepEqual(parseConfig({ ...config, limits: paused }).limits, paused);
  assert.throws(() =>
    parseConfig({ ...config, limits: { ...paused, enabled: true } }),
  );
});
test("an expired or frozen light client pauses new transfers", () => {
  assert.equal(clientPause(parseConfig(config).client), "");
  for (const status of ["expired", "frozen"] as const) {
    const parsed = parseConfig({
      ...config,
      client: { ...config.client, status, ageSeconds: 90_000 },
    });
    assert.equal(parsed.client.status, status);
    assert.match(clientPause(parsed.client), /paused.*held on Akash/);
    assert.doesNotMatch(clientPause(parsed.client), /bridge|\u2014/i);
  }
  assert.equal(
    parseConfig({ ...config, client: { ...config.client, ageSeconds: -3 } })
      .client.ageSeconds,
    -3,
  );
  for (const client of [
    undefined,
    { ...config.client, status: "unknown" },
    { ...config.client, ageSeconds: 1.5 },
    { ...config.client, trustingPeriodSeconds: 0 },
    { ...config.client, latestHeight: "-1" },
  ])
    assert.throws(() => parseConfig({ ...config, client }));
});
test("signed transaction must preserve one message, exact fee, amount and memo", () => {
  const i = intent(),
    raw = signed(i);
  assert.ok(validateSigned(raw, i).length > 0);
  const body = TxBody.decode(raw.bodyBytes);
  body.messages.push(body.messages[0]);
  assert.throws(
    () =>
      validateSigned({ ...raw, bodyBytes: TxBody.encode(body).finish() }, i),
    /message/,
  );
  const changedMemo = TxBody.decode(raw.bodyBytes);
  changedMemo.memo = "changed";
  assert.throws(
    () =>
      validateSigned(
        { ...raw, bodyBytes: TxBody.encode(changedMemo).finish() },
        i,
      ),
    /memo/,
  );
  const auth = AuthInfo.decode(raw.authInfoBytes);
  assert.ok(auth.fee);
  auth.fee.gasLimit += 1n;
  assert.throws(
    () =>
      validateSigned(
        { ...raw, authInfoBytes: AuthInfo.encode(auth).finish() },
        i,
      ),
    /fee/,
  );
  assert.throws(() => validateSigned(raw, { ...i, amountUakt: "2" }), /amount/);
});
test("MsgSink signing rejects destination, type, sender, denomination and extra wire fields", () => {
  const i = intent(),
    raw = signed(i);
  const original = MsgSink.decode(
    TxBody.decode(raw.bodyBytes).messages[0].value,
  );
  for (const changes of [
    { sender: sink },
    { dest: sink },
    { destType: DestType.DEST_TYPE_INVALID },
    { destType: 2 },
    { amount: { denom: "other", amount: i.amountUakt } },
    { amount: undefined },
  ]) {
    const body = TxBody.decode(raw.bodyBytes);
    body.messages[0].value = MsgSink.encode({
      ...original,
      ...changes,
    }).finish();
    assert.throws(
      () =>
        validateSigned({ ...raw, bodyBytes: TxBody.encode(body).finish() }, i),
      /sender, destination or amount/,
    );
  }
  const body = TxBody.decode(raw.bodyBytes);
  body.messages[0].value = Uint8Array.from([...body.messages[0].value, 40, 1]);
  assert.throws(
    () =>
      validateSigned({ ...raw, bodyBytes: TxBody.encode(body).finish() }, i),
    /encoding/,
  );
  body.messages[0].typeUrl = "/cosmos.bank.v1beta1.MsgSend";
  assert.throws(
    () =>
      validateSigned({ ...raw, bodyBytes: TxBody.encode(body).finish() }, i),
    /message/,
  );
});
test("guardian pause Amino matches the node and refuses an empty pause", () => {
  const amino = sinkAminoTypes();
  const guardian = "akash1r9ut4ukp207nhumr8uaykyh6v7p9qlwxmcf48p";
  const msg = guardianPauseMessage({
    guardian,
    deposits: true,
    refunds: false,
  });
  const converted = amino.toAmino(msg);
  assert.deepEqual(converted, {
    type: "sink/MsgGuardianPause",
    value: { guardian, deposits: true },
  });
  assert.deepEqual(amino.fromAmino(converted), msg);
  assert.throws(() =>
    guardianPauseMessage({ guardian, deposits: false, refunds: false }),
  );
  for (const value of [
    { guardian },
    { guardian, deposits: false },
    { guardian, refunds: "true" },
    { guardian, deposits: true, extra: 1 },
  ])
    assert.throws(() =>
      amino.fromAmino({ type: "sink/MsgGuardianPause", value }),
    );
  assert.ok(sinkRegistry().lookupType(GUARDIAN_PAUSE_TYPE));
});
test("MsgSink Amino fallback preserves exactly the signed destination and amount", () => {
  const i = intent();
  const msg = sinkMessage({
    sender: i.sender,
    recipient: i.recipient,
    amountUakt: i.amountUakt,
  });
  const amino = sinkAminoTypes();
  const converted = amino.toAmino(msg);
  assert.equal(converted.type, "sink/MsgSink");
  assert.deepEqual(converted.value, {
    sender: i.sender,
    dest_type: 1,
    dest: i.recipient,
    amount: { denom: "uakt", amount: i.amountUakt },
  });
  const decoded = amino.fromAmino(converted);
  assert.deepEqual(decoded, msg);
  const raw = signed(i),
    body = TxBody.decode(raw.bodyBytes);
  body.messages[0].value = sinkRegistry().encode(decoded);
  assert.ok(
    validateSigned({ ...raw, bodyBytes: TxBody.encode(body).finish() }, i)
      .length,
  );
});
test("MsgSink Amino matches the node's sign bytes and accepts only a Solana destination", () => {
  const amino = sinkAminoTypes(),
    converted = amino.toAmino(
      sinkMessage({
        sender: "akash1qurswpc8qurswpc8qurswpc8qurswpc87g2aem",
        recipient: "US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx",
        amountUakt: "1000000",
      }),
    );
  assert.equal(
    JSON.stringify(converted, [
      "amount",
      "denom",
      "dest",
      "dest_type",
      "sender",
      "type",
      "value",
    ]),
    '{"type":"sink/MsgSink","value":{"amount":{"amount":"1000000","denom":"uakt"},"dest":"US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx","dest_type":1,"sender":"akash1qurswpc8qurswpc8qurswpc8qurswpc87g2aem"}}',
  );
  for (const destType of [0, 2, "DEST_TYPE_SOLANA", undefined])
    assert.throws(
      () =>
        amino.fromAmino({
          ...converted,
          value: { ...converted.value, dest_type: destType },
        }),
      /Amino fields/,
    );
});
test("MOCK adapter: public receipt is durable before the only broadcast and survives reload", async () => {
  const store = storage(),
    order: string[] = [];
  let saved: SavedSubmission | null = null;
  let broadcasts = 0;
  const result = await submitIntent(
    intent(),
    adapters({
      save: (submission) => {
        saveSubmission(store, submission);
        saved = submission;
        order.push("saved");
      },
      broadcast: async () => {
        broadcasts++;
        assert.ok(saved);
        assert.deepEqual(loadSubmissions(store), [saved]);
        order.push("broadcast");
        return saved.txHash;
      },
    }),
  );
  assert.equal(result.kind, "accepted");
  assert.equal(broadcasts, 1);
  assert.deepEqual(order, ["saved", "broadcast"]);
  assert.equal(loadSubmissions(store)[0].txHash, result.submission.txHash);
  assert.equal(
    Object.keys(JSON.parse(store.getItem(STORAGE_KEY) ?? "[]")[0]).includes(
      "bytes",
    ),
    false,
  );
});
test("MOCK adapter: storage failure prevents transmission", async () => {
  let broadcasts = 0;
  await assert.rejects(
    submitIntent(
      intent(),
      adapters({
        save: () => {
          throw new Error("storage denied");
        },
        broadcast: async () => {
          broadcasts++;
          return "A".repeat(64);
        },
      }),
    ),
    /storage denied/,
  );
  assert.equal(broadcasts, 0);
});
test("MOCK adapter: input change before Keplr signing prevents signing", async () => {
  let generation = 1,
    signs = 0,
    broadcasts = 0;
  await assert.rejects(
    submitIntent(
      intent(),
      adapters({
        generation: () => generation,
        stage: () => {
          generation++;
        },
        sign: async () => {
          signs++;
          return signed();
        },
        broadcast: async () => {
          broadcasts++;
          return "A".repeat(64);
        },
      }),
    ),
    /changed/,
  );
  assert.equal(signs, 0);
  assert.equal(broadcasts, 0);
});
test("MOCK adapter: input change during Keplr signing prevents save and broadcast", async () => {
  let generation = 1,
    saves = 0,
    broadcasts = 0;
  await assert.rejects(
    submitIntent(
      intent(),
      adapters({
        generation: () => generation,
        sign: async () => {
          generation++;
          return signed();
        },
        save: () => {
          saves++;
        },
        broadcast: async () => {
          broadcasts++;
          return "A".repeat(64);
        },
      }),
    ),
    /changed/,
  );
  assert.equal(saves, 0);
  assert.equal(broadcasts, 0);
});
test("MOCK adapter: ambiguous transmission retains hash and never retries", async () => {
  const store = storage();
  let broadcasts = 0;
  const result = await submitIntent(
    intent(),
    adapters({
      save: (saved) => saveSubmission(store, saved),
      broadcast: async () => {
        broadcasts++;
        throw new Error("connection lost after submission");
      },
    }),
  );
  assert.equal(result.kind, "ambiguous");
  assert.equal(broadcasts, 1);
  assert.equal(loadSubmissions(store)[0].txHash, result.submission.txHash);
});
test("pasted destinations need an on-curve wallet", async () => {
  assert.deepEqual(checkDestination(""), { state: "empty" });
  assert.deepEqual(checkDestination("7xKXtg2CW87d97"), { state: "incomplete" });
  assert.deepEqual(
    checkDestination("0x71C7656EC7ab88b098defB751B7401B5f6d8976F"),
    { state: "invalid" },
  );
  assert.deepEqual(checkDestination(`${recipient}1`), { state: "invalid" });
  assert.deepEqual(checkDestination(` ${recipient} `), {
    state: "valid",
    address: recipient,
  });
  assert.deepEqual(checkDestination("11111111111111111111111111111111"), {
    state: "account",
  });
  const offCurve = Array.from({ length: 255 }, (_, i) =>
    base58.encode(new Uint8Array(32).fill(i + 1)),
  ).find((value) => checkDestination(value).state === "account");
  assert.ok(offCurve, "Expected an off-curve 32-byte key");
});
test("finalized mint is received while Akash reports lag; holds remain visible", () => {
  const r = receipt();
  r.solana = {
    kind: "minted",
    contextSlot: "200",
    resolvedSlot: "190",
    proofHeight: "101",
  };
  assert.equal(receiptView(r).title, "AKT received on Solana");
  assert.match(receiptView(r).message, /confirmation is still pending/);
  r.akash.hold = "conflict";
  assert.equal(receiptView(r).tone, "warning");
  assert.match(receiptView(r).message, /conflict hold/);
  r.akash.status = "refunded";
  assert.equal(receiptView(r).title, "Conflicting chain outcomes");
});
test("Akash-only mint does not claim finalized receipt; elapsed challenge does not claim refund", () => {
  const r = receipt();
  r.akash.status = "minted";
  assert.equal(receiptView(r).title, "Awaiting Solana verification");
  r.akash.status = "refund_pending";
  r.akash.challengeEndSeconds = "1";
  r.solana = {
    kind: "voided",
    contextSlot: "200",
    resolvedSlot: "190",
    proofHeight: "101",
  };
  assert.equal(receiptView(r).title, "Transfer voided; refund pending");
  assert.match(receiptView(r).message, /does not prove a refund/);
});
test("receipts reject network, transaction and immutable deposit mismatch", () => {
  const r = receipt();
  assert.ok(r.txHash);
  const lookup = { kind: "transaction" as const, hash: r.txHash };
  const saved: SavedSubmission = {
    version: 2,
    networkKey: config.network.networkKey,
    txHash: r.txHash,
    sender,
    recipient,
    amountUakt: r.deposit.amountUakt,
    createdAt: new Date().toISOString(),
  };
  assert.deepEqual(parseReceipt(r), r);
  matchReceipt(r, config.network.networkKey, lookup, saved);
  assert.throws(
    () => matchReceipt(r, "another-network", lookup, saved),
    /different network/,
  );
  assert.throws(
    () =>
      matchReceipt(r, config.network.networkKey, lookup, {
        ...saved,
        amountUakt: "1",
      }),
    /does not match/,
  );
  assert.throws(
    () =>
      parseReceipt({
        ...r,
        solana: {
          kind: "minted",
          contextSlot: "200",
          resolvedSlot: "201",
          proofHeight: "101",
        },
      }),
    /Unfinalized/,
  );
});

test("MOCK adapter: CheckTx rejection is distinct from transport uncertainty and survives reload", async () => {
  const store = storage();
  let broadcasts = 0;
  const result = await submitIntent(
    intent(),
    adapters({
      save: (saved) => saveSubmission(store, saved),
      broadcast: async () => {
        broadcasts++;
        throw new BroadcastTxError(32, "sdk", "account sequence mismatch");
      },
    }),
  );
  assert.equal(result.kind, "rejected");
  assert.equal(broadcasts, 1);
  const restored = loadSubmissions(store)[0];
  assert.equal(restored.txHash, result.submission.txHash);
  assert.deepEqual(restored.broadcastRejection, {
    code: 32,
    message: "account sequence mismatch",
  });
  const unknown: BridgeReceipt = {
    version: 2,
    kind: "unknown",
    networkKey: restored.networkKey,
    txHash: restored.txHash,
    checkedAt: new Date().toISOString(),
  };
  assert.equal(
    receiptView(unknown, restored).title,
    "Node rejected this submission",
  );
  assert.match(receiptView(unknown, restored).message, /prior submission/);
  assert.equal(
    receiptView(null, restored).title,
    "Node rejected this submission",
  );
  const verified = receipt();
  verified.txHash = restored.txHash;
  verified.solana = {
    kind: "minted",
    contextSlot: "200",
    resolvedSlot: "190",
    proofHeight: "101",
  };
  assert.equal(receiptView(verified, restored).title, "AKT received on Solana");
  assert.doesNotMatch(
    receiptView(verified, restored).message,
    /sequence mismatch/,
  );
});

test("MOCK adapter: rejection metadata storage failure preserves original hash and immediate rejection", async () => {
  const store = storage();
  let saves = 0;
  const result = await submitIntent(
    intent(),
    adapters({
      save: (saved) => {
        if (++saves > 1) throw new Error("storage unavailable");
        saveSubmission(store, saved);
      },
      broadcast: async () => {
        throw new BroadcastTxError(19, "sdk", "transaction already in cache");
      },
    }),
  );
  assert.equal(result.kind, "rejected");
  assert.equal(loadSubmissions(store)[0].txHash, result.submission.txHash);
  assert.equal(loadSubmissions(store)[0].broadcastRejection, undefined);
  assert.equal(result.submission.broadcastRejection?.code, 19);
  assert.match(result.message, /could not be saved/);
});

test("MOCK adapter: non-positive CheckTx code is not classified as a confirmed rejection", async () => {
  const result = await submitIntent(
    intent(),
    adapters({
      broadcast: async () => {
        throw new BroadcastTxError(0, "", "unexpected response");
      },
    }),
  );
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.submission.broadcastRejection, undefined);
});

test("record lookup validates canonical IDs and never fabricates a transaction hash", () => {
  assert.deepEqual(parseLookup(`${sender}/100/42`), {
    kind: "transfer",
    id: `${sender}/100/42`,
  });
  assert.deepEqual(parseLookup("a".repeat(64)), {
    kind: "transaction",
    hash: "A".repeat(64),
  });
  for (const value of ["0", "01", "-1", "1e2", "18446744073709551616", "abc"])
    assert.throws(() => parseLookup(value), /transfer ID/);
  const r = { ...receipt(), txHash: null };
  assert.deepEqual(parseReceipt(r), r);
  matchReceipt(r, r.networkKey, { kind: "transfer", id: `${sender}/100/4` });
  assert.throws(
    () =>
      matchReceipt(r, r.networkKey, {
        kind: "transfer",
        id: `${sender}/100/5`,
      }),
    /transfer ID/,
  );
  assert.throws(
    () => matchReceipt(r, "wrong", { kind: "transfer", id: `${sender}/100/4` }),
    /network/,
  );
  assert.throws(
    () =>
      matchReceipt(r, r.networkKey, {
        kind: "transaction",
        hash: "A".repeat(64),
      }),
    /transaction/,
  );
  assert.throws(() => parseReceipt({ ...r, kind: "unknown" }), /hash/);
  assert.throws(
    () =>
      parseReceipt({
        ...r,
        deposit: { ...r.deposit, id: "18446744073709551616" },
      }),
    /Transfer ID/,
  );
  assert.throws(
    () => parseReceipt({ ...r, deposit: { ...r.deposit, height: "101" } }),
    /disagrees/,
  );
});

test("learned transfer IDs survive old history and bind later ID-only receipts", () => {
  const r = receipt();
  assert.ok(r.txHash);
  const saved: SavedSubmission = {
    version: 2,
    networkKey: r.networkKey,
    txHash: r.txHash,
    sender,
    recipient,
    amountUakt: r.deposit.amountUakt,
    createdAt: new Date().toISOString(),
  };
  const store = storage();
  saveSubmission(store, saved);
  assert.deepEqual(loadSubmissions(store), [saved]);
  const known = { ...saved, transferId: `${sender}/100/4` };
  saveSubmission(store, known);
  saveSubmission(store, saved);
  assert.deepEqual(loadSubmissions(store), [known]);
  assert.throws(
    () => saveSubmission(store, { ...saved, amountUakt: "2" }),
    /details changed/,
  );
  assert.throws(
    () => saveSubmission(store, { ...saved, transferId: `${sender}/100/5` }),
    /ID changed/,
  );
  const queried = { ...r, txHash: null };
  matchReceipt(
    queried,
    r.networkKey,
    { kind: "transfer", id: `${sender}/100/4` },
    known,
  );
  assert.throws(
    () =>
      matchReceipt(
        queried,
        r.networkKey,
        { kind: "transfer", id: `${sender}/100/4` },
        { ...known, amountUakt: "1" },
      ),
    /does not match/,
  );
  assert.throws(
    () =>
      matchReceipt(
        queried,
        r.networkKey,
        { kind: "transfer", id: `${sender}/100/4` },
        { ...known, transferId: `${sender}/100/5` },
      ),
    /different network/,
  );
  assert.throws(
    () => parseSaved({ ...saved, transferId: "04" }),
    /Transfer ID/,
  );
});

test("saved history keeps vault and non-canonical destinations Akash accepts", () => {
  const encode = (hex: string) =>
    base58.encode(Uint8Array.from(Buffer.from(hex, "hex")));
  let vault = "";
  for (let i = 1; !vault; i++) {
    const bytes = new Uint8Array(32).fill(i);
    try {
      ed25519.ExtendedPoint.fromHex(bytes);
    } catch {
      vault = base58.encode(bytes);
    }
  }
  const destinations = [
    vault,
    encode("ed" + "ff".repeat(30) + "7f"),
    encode("01" + "00".repeat(30) + "80"),
  ];
  const store = storage();
  destinations.forEach((destination, index) => {
    assert.equal(checkDestination(destination).state, "account");
    const saved: SavedSubmission = {
      version: 2,
      networkKey: config.network.networkKey,
      txHash: "ABC"[index].repeat(64),
      transferId: `${sender}/100/${index + 1}`,
      sender,
      recipient: destination,
      amountUakt: "1000000",
      createdAt: "2026-10-15T10:00:00.000Z",
    };
    assert.deepEqual(parseSaved(saved), saved);
    saveSubmission(store, saved);
  });
  assert.deepEqual(
    loadSubmissions(store).map((item) => item.recipient),
    [...destinations].reverse(),
  );
  for (const invalid of ["0x71C7656EC7ab88b098defB751B7401B5f6d8976F", "1"])
    assert.throws(() =>
      parseSaved({
        ...loadSubmissions(store)[0],
        recipient: invalid,
      }),
    );
});

test("wallet transfer rows isolate wallets/networks and show latest first", () => {
  const base: SavedSubmission = {
    version: 2,
    networkKey: config.network.networkKey,
    txHash: "A".repeat(64),
    sender,
    recipient,
    amountUakt: "1000000",
    createdAt: "2026-10-15T10:00:00Z",
  };
  const newer = {
    ...base,
    txHash: "B".repeat(64),
    createdAt: "2026-10-15T11:00:00Z",
  };
  const otherWallet = { ...base, sender: sink, txHash: "C".repeat(64) };
  const otherNetwork = { ...base, networkKey: "another-network" };
  const all = [base, otherNetwork, newer, otherWallet];
  assert.deepEqual(visibleTransfers(all, base.networkKey, sender), [
    newer,
    base,
  ]);
  assert.equal(visibleTransfers(all, base.networkKey, null).length, 3);
  assert.deepEqual(visibleTransfers(all, undefined, sender), []);
  assert.notEqual(transferKey(base), transferKey(otherNetwork));
});

test("transfer status requires fresh finality and distinguishes refunds from minting", () => {
  const r = receipt();
  const saved: SavedSubmission = {
    version: 2,
    networkKey: r.networkKey,
    txHash: "A".repeat(64),
    sender,
    recipient,
    amountUakt: r.deposit.amountUakt,
    createdAt: r.checkedAt,
  };
  const observed = { receipt: r, error: "" };
  const status = (value = observed) => transferStatus(saved, value);
  assert.equal(transferStatus(saved, undefined).label, "Validation pending");
  assert.equal(transferStatus(saved, undefined).step, 1);
  assert.equal(
    transferStatus(
      { broadcastRejection: { code: 5, message: "insufficient" } },
      undefined,
    ).label,
    "Submission rejected",
  );
  assert.deepEqual(
    [status().label, status().step, status().tone],
    ["Validated", 2, "confirmed"],
  );
  r.akash.status = "minted";
  assert.deepEqual([status().label, status().step], ["Transfer pending", 3]);
  r.solana = {
    kind: "minted",
    contextSlot: "200",
    resolvedSlot: "190",
    proofHeight: "101",
  };
  assert.deepEqual(
    [status().label, status().step, status().tone, status().settled],
    ["Completed", 4, "success", true],
  );
  r.akash.status = "refunded";
  assert.equal(status().label, "Needs review");
  r.akash.status = "refund_pending";
  r.solana.kind = "voided";
  r.akash.challengeEndSeconds = "1";
  assert.deepEqual(
    [status().label, status().step, status().retryable],
    ["Refund pending", 0, false],
  );
  r.akash.status = "refunded";
  assert.deepEqual(
    [status().label, status().refunded, status().retryable, status().tone],
    ["Refunded", true, true, "error"],
  );
  r.checkedAt = "2000-01-01T00:00:00Z";
  assert.equal(status().label, "Status stale");
  assert.equal(
    status({ ...observed, error: "RPC unavailable" }).label,
    "Update unavailable",
  );
  const failed: BridgeReceipt = {
    version: 2,
    networkKey: r.networkKey,
    checkedAt: new Date().toISOString(),
    kind: "rejected",
    txHash: "A".repeat(64),
    height: "5",
    code: 5,
    message: "insufficient funds",
  };
  assert.deepEqual(
    [
      status({ receipt: failed, error: "" }).label,
      status({ receipt: failed, error: "" }).retryable,
    ],
    ["Failed", true],
  );
});

test("freshness follows the server clock when the browser clock is skewed", () => {
  const browser = Date.now();
  try {
    for (const skew of [-120_000, -11_000, 11_000, 600_000]) {
      const server = new Date(browser + skew).toISOString();
      syncServerClock(server, browser);
      assert.ok(fresh(server), `skew ${skew}`);
      assert.equal(
        transferStatus(
          {},
          { receipt: { ...receipt(), checkedAt: server }, error: "" },
        ).label,
        "Validated",
      );
      assert.equal(
        fresh(new Date(browser + skew - 61_000).toISOString()),
        false,
      );
    }
  } finally {
    syncServerClock(new Date().toISOString());
  }
});

test("compact identifiers preserve full values and private links bind the network", () => {
  const hash = "A".repeat(64);
  assert.equal(shortenIdentifier(hash), "AAAAAAA…AAAAA");
  assert.equal(shortenIdentifier("short"), "short");
  assert.equal(displayAmount("10001000000"), "10,001.00");
  assert.equal(displayAmount("1248500000"), "1,248.50");
  assert.equal(displayAmount("12500"), "0.0125");
  assert.equal(
    shortAddress(recipient),
    `${recipient.slice(0, 6)}…${recipient.slice(-4)}`,
  );
  const now = new Date(2026, 9, 15, 18, 30);
  assert.equal(
    submittedLabel(new Date(2026, 9, 15, 9, 4).toISOString(), now),
    "Today, 09:04",
  );
  assert.equal(
    submittedLabel(new Date(2026, 9, 12, 16, 2).toISOString(), now),
    "Oct 12, 16:02",
  );
  assert.equal(
    displayAmount("18446744073709551615"),
    "18,446,744,073,709.551615",
  );
  const key = config.network.networkKey;
  assert.deepEqual(portalRoute(transactionLink(hash, key)), {
    kind: "transaction",
    hash,
    networkKey: key,
  });
  assert.ok(transactionLink(hash, key).startsWith("#tx/"));
  assert.deepEqual(portalRoute(recordLink(`${sender}/100/13`, key)), {
    kind: "record",
    id: `${sender}/100/13`,
    networkKey: key,
  });
  assert.equal(portalRoute(`#record/013?network=x`).kind, "invalid");
  for (const invalid of [
    `#tx/${hash}`,
    `#tx/bad?network=x`,
    `#tx/${hash}?network=x&network=y`,
    `#tx/${hash}?network=x?ignored`,
  ])
    assert.equal(portalRoute(invalid).kind, "invalid");
});

test("new history preserves the previous network's storage byte for byte", () => {
  const store = storage();
  const legacy = {
    version: 1,
    networkKey: "old-network",
    txHash: "B".repeat(64),
    transferId: "7",
    sender,
    recipient,
    amountUakt: "1000000",
    createdAt: new Date().toISOString(),
  };
  const encoded = JSON.stringify([legacy]);
  store.setItem(LEGACY_STORAGE_KEY, encoded);
  const current: SavedSubmission = {
    ...legacy,
    version: 2,
    networkKey: config.network.networkKey,
    txHash: "C".repeat(64),
    transferId: `${sender}/100/7`,
  };
  saveSubmission(store, current);
  assert.equal(store.getItem(LEGACY_STORAGE_KEY), encoded);
  assert.deepEqual(loadSubmissions(store), [current, legacy]);
  assert.throws(() => parseSigned(legacy), /signed in this browser/);
  assert.ok(store.getItem(STORAGE_KEY));
});

test("owner discovery merges with a signed transfer in either arrival order", () => {
  const signed: SignedSubmission = {
    version: 2,
    networkKey: config.network.networkKey,
    txHash: "A".repeat(64),
    sender,
    recipient,
    amountUakt: "1000000",
    createdAt: new Date().toISOString(),
  };
  const discovered: DiscoveredSubmission = {
    ...signed,
    txHash: null,
    transferId: `${sender}/100/1`,
    createdAt: null,
  };
  const known = { ...signed, transferId: discovered.transferId };
  assert.deepEqual(mergeDiscovered([signed], [discovered]), [
    signed,
    discovered,
  ]);
  assert.deepEqual(mergeDiscovered([known], [discovered]), [known]);
  const store = storage();
  saveSubmission(store, signed);
  saveSubmission(store, known);
  assert.deepEqual(loadSubmissions(store), [known]);
  assert.deepEqual(mergeDiscovered(loadSubmissions(store), [discovered]), [
    known,
  ]);
  assert.throws(
    () => saveSubmission(store, { ...known, txHash: "B".repeat(64) }),
    /hash changed/,
  );
  assert.throws(() => parseSigned(discovered), /signed in this browser/);
  checkDiscovered([known], [discovered]);
  assert.throws(
    () => checkDiscovered([known], [{ ...discovered, amountUakt: "2" }]),
    /does not match/,
  );
  assert.throws(
    () => parseSaved({ ...discovered, transferId: undefined }),
    /discovered/,
  );
  assert.throws(
    () => parseSaved({ ...discovered, sender: sink }),
    /owner mismatch/,
  );
  assert.throws(() => parseSaved({ ...signed, createdAt: null }), /timestamp/);
});

test("wallet history binds network and owner and states truncation", () => {
  const page = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      version: 2,
      networkKey: config.network.networkKey,
      txHash: null,
      transferId: `${sender}/${200 - i}/1`,
      sender,
      recipient,
      amountUakt: "1000000",
      createdAt: i % 2 ? null : "2026-10-15T10:00:00.000Z",
    }));
  const history = {
    version: 2,
    networkKey: config.network.networkKey,
    sender,
    transfers: page(100),
    truncated: true,
  };
  const parsed = parseHistory(history, config.network.networkKey, sender);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.transfers[1].createdAt, null);
  assert.equal(
    parseHistory(
      { ...history, transfers: page(3), truncated: false },
      config.network.networkKey,
      sender,
    ).transfers.length,
    3,
  );
  for (const [changed, expected] of [
    [{ truncated: undefined }, /Unexpected/],
    [{ transfers: page(3) }, /Unexpected/],
    [{ transfers: page(101), truncated: false }, /Unexpected/],
    [{ sender: sink }, /Unexpected/],
    [{ networkKey: "another-network" }, /Unexpected/],
    [
      {
        transfers: [{ ...page(1)[0], txHash: "A".repeat(64) }],
        truncated: false,
      },
      /does not match/,
    ],
    [{ transfers: [...page(1), ...page(1)], truncated: false }, /repeats/],
  ] as const)
    assert.throws(
      () =>
        parseHistory(
          { ...history, ...changed },
          config.network.networkKey,
          sender,
        ),
      expected,
    );
});

test("receipts retain financial completion and reject contradictory refund fields", () => {
  const r = receipt();
  for (const status of ["minted", "refunded"] as const) {
    const parsed = parseReceipt({
      ...r,
      akash: { ...r.akash, status, hold: "conflict" },
    });
    assert.equal(parsed.kind, "deposit");
    if (parsed.kind === "deposit") assert.equal(parsed.akash.status, status);
  }
  assert.throws(
    () =>
      parseReceipt({ ...r, akash: { ...r.akash, status: "refund_pending" } }),
    /refund state/,
  );
  assert.throws(
    () =>
      parseReceipt({
        ...r,
        akash: { ...r.akash, status: "refunded", challengeEndSeconds: "200" },
      }),
    /refund state/,
  );
  assert.throws(
    () => parseReceipt({ ...r, deposit: { ...r.deposit, sender: sink } }),
    /identity/,
  );
});

test("a veto applies only to a refund candidate", () => {
  const r = receipt();
  const parsed = parseReceipt({
    ...r,
    akash: {
      ...r.akash,
      status: "refund_pending",
      hold: "veto",
      challengeEndSeconds: "200",
    },
  });
  assert.match(receiptView(parsed).message, /veto hold/);
  for (const status of [
    "transfer_pending",
    "minted",
    "void_requested",
    "refunded",
  ])
    assert.throws(
      () =>
        parseReceipt({
          ...r,
          akash: { ...r.akash, status, hold: "veto" },
        }),
      /refund state/,
    );
});

test("a void request is distinct from a Solana void or a paid refund", () => {
  const r = receipt();
  r.akash.status = "void_requested";
  const parsed = parseReceipt(r);
  const status = transferStatus({}, { receipt: parsed, error: "" });
  assert.deepEqual(
    [
      status.label,
      status.refunded,
      status.retryable,
      status.settled,
      status.step,
    ],
    ["Void requested", false, false, false, 0],
  );
  assert.equal(receiptView(parsed).title, "Void requested on Akash");
  assert.match(receiptView(parsed).message, /has not confirmed a void/);
  assert.throws(
    () =>
      parseReceipt({ ...r, akash: { ...r.akash, challengeEndSeconds: "200" } }),
    /refund state/,
  );

  const minted = parseReceipt({
    ...r,
    solana: {
      kind: "minted",
      contextSlot: "200",
      resolvedSlot: "190",
      proofHeight: "101",
    },
  });
  assert.equal(
    transferStatus({}, { receipt: minted, error: "" }).label,
    "Completed",
  );
  assert.match(
    receiptView(minted).message,
    /reporter confirmation is still pending/,
  );
  const voided = parseReceipt({
    ...r,
    solana: {
      kind: "voided",
      contextSlot: "200",
      resolvedSlot: "190",
      proofHeight: "101",
    },
  });
  const refund = transferStatus({}, { receipt: voided, error: "" });
  assert.equal(refund.label, "Refund pending");
  assert.equal(refund.refunded, false);
  assert.match(refund.note, /requires confirmation/);
});
