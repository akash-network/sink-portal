import assert from "node:assert/strict";
import test from "node:test";
import { toBech32 } from "@cosmjs/encoding";
import {
  QueryAccountRequest,
  QueryAccountResponse,
  Sink_Params,
} from "@akashnetwork/chain-sdk/private-types/akash.v1";
import {
  EpochInfo,
  QueryEpochInfosResponse,
} from "@akashnetwork/chain-sdk/private-types/akash.v1beta1";
import { AkashClient } from "./chain/akash";
import { accountQuota, quotaReset } from "./quota";

const owner = toBech32("akash", new Uint8Array(20).fill(42));
const epoch = EpochInfo.fromPartial({
  id: "day",
  currentEpoch: 234n,
  epochCountingStarted: true,
  currentEpochStartTime: new Date("2026-11-11T12:26:01.728Z"),
  duration: { seconds: 86400n, nanos: 0 },
});

test("quota reset follows the native schedule, including a not-yet-started epoch", () => {
  assert.equal(quotaReset(epoch, 234n), "2026-11-12T12:26:01.728Z");
  assert.equal(
    quotaReset(
      {
        ...epoch,
        currentEpoch: 0n,
        epochCountingStarted: false,
        startTime: new Date("2026-11-13T12:26:01.728Z"),
      },
      0n,
    ),
    "2026-11-13T12:26:01.728Z",
  );
  assert.throws(() => quotaReset(epoch, 235n), /epoch mismatch/);
  assert.throws(() => quotaReset({ ...epoch, duration: undefined }, 234n));
});

test("account allowance uses only current-period consumption and preserves no account cap", () => {
  const state = {
    params: Sink_Params.fromPartial({
      maxEpochAmountPerAccount: { denom: "uakt", amount: "10000000" },
    }),
    epoch: 234n,
  };
  const account = QueryAccountResponse.fromPartial({
    epoch: 234n,
    usage: {
      lastEpoch: 234n,
      epochSent: { denom: "uakt", amount: "3000000" },
    },
  });
  assert.ok(account.usage);
  const usage = { epoch: account.epoch, usage: account.usage };
  assert.deepEqual(accountQuota(owner, state, usage), {
    owner,
    capUakt: "10000000",
    usedUakt: "3000000",
  });
  usage.usage.lastEpoch = 233n;
  assert.equal(accountQuota(owner, state, usage).usedUakt, "0");
  state.params.maxEpochAmountPerAccount = { denom: "uakt", amount: "0" };
  assert.equal(accountQuota(owner, state, usage).capUakt, "0");
  assert.throws(
    () => accountQuota(owner, state, { ...usage, epoch: 235n }),
    /epoch mismatch/,
  );
});

test("quota queries use native protobufs at the requested committed height", async (t) => {
  const client = new AkashClient("http://127.0.0.1:26657", "test", 60);
  t.after(() => client.close());
  let responseHeight = 100;
  const query = t.mock.method(
    client.comet,
    "abciQuery",
    async (request: Parameters<AkashClient["comet"]["abciQuery"]>[0]) => {
      assert.equal(request.height, 100);
      const value =
        request.path === "/akash.epochs.v1beta1.Query/EpochInfos"
          ? QueryEpochInfosResponse.encode({ epochs: [epoch] }).finish()
          : QueryAccountResponse.encode(
              QueryAccountResponse.fromPartial({
                epoch: 234n,
                usage: {
                  lastEpoch: 234n,
                  epochSent: { denom: "uakt", amount: "3000000" },
                },
              }),
            ).finish();
      if (request.path === "/akash.sink.v1.Query/Account")
        assert.deepEqual(QueryAccountRequest.decode(request.data), { owner });
      return {
        code: 0,
        log: "",
        info: "",
        index: 0,
        height: responseHeight,
        key: new Uint8Array(),
        value,
        codespace: "",
      };
    },
  );
  assert.equal((await client.quotaEpoch(100)).currentEpoch, 234n);
  assert.equal(
    (await client.accountUsage(owner, 100)).usage.epochSent?.amount,
    "3000000",
  );
  const calls = query.mock.callCount();
  await assert.rejects(client.accountUsage("bad", 100));
  assert.equal(query.mock.callCount(), calls);
  responseHeight = 101;
  await assert.rejects(client.quotaEpoch(100), /height mismatch/);
  await assert.rejects(client.accountUsage(owner, 100), /height mismatch/);
});
