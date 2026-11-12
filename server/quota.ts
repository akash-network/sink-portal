import assert from "node:assert/strict";
import type { EpochInfo } from "@akashnetwork/chain-sdk/private-types/akash.v1beta1";
import type { AkashClient } from "./chain/akash";
import { coinAmount } from "./chain/records";

export function quotaReset(epoch: EpochInfo, currentEpoch: bigint) {
  assert.equal(epoch.currentEpoch, currentEpoch, "quota epoch mismatch");
  assert.equal(epoch.epochCountingStarted, currentEpoch > 0n);
  assert.ok(epoch.duration && epoch.duration.seconds >= 0n);
  assert.ok(epoch.duration.nanos >= 0 && epoch.duration.nanos < 1_000_000_000);
  const seconds = Number(epoch.duration.seconds);
  assert.ok(Number.isSafeInteger(seconds), "invalid epoch duration");
  const duration = seconds * 1000 + epoch.duration.nanos / 1_000_000;
  assert.ok(duration > 0, "invalid epoch duration");
  const start = epoch.epochCountingStarted
    ? epoch.currentEpochStartTime
    : epoch.startTime;
  assert.ok(start, "missing quota schedule");
  return new Date(
    start.getTime() + (epoch.epochCountingStarted ? duration : 0),
  ).toISOString();
}

export function accountQuota(
  owner: string,
  state: Pick<Awaited<ReturnType<AkashClient["state"]>>, "params" | "epoch">,
  account: Awaited<ReturnType<AkashClient["accountUsage"]>>,
) {
  assert.equal(account.epoch, state.epoch, "account quota epoch mismatch");
  return {
    owner,
    capUakt: coinAmount(state.params.maxEpochAmountPerAccount).toString(),
    usedUakt:
      account.usage.lastEpoch === state.epoch
        ? coinAmount(account.usage.epochSent).toString()
        : "0",
  };
}
