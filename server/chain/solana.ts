import { Outcome } from "@akashnetwork/chain-sdk/private-types/akash.v1";
import { Program, web3, type IdlAccounts } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import assert from "node:assert/strict";
import idl from "./idls/akt.json";
import type { Akt } from "./idls/akt";
import { decodeRecord, statusAddress, matchesAnchorId } from "./records";
export { decodeRecord } from "./records";
export type Record = ReturnType<typeof decodeRecord>;
type TransferStatus = IdlAccounts<Akt>["transferStatus"];
export type FinalizedObserved =
  | { kind: "absent"; contextSlot: bigint }
  | {
      kind: "resolved";
      contextSlot: bigint;
      address: web3.PublicKey;
      status: TransferStatus;
      outcome: Outcome;
      slot: bigint;
      proofHeight: bigint;
    };

export class SolanaUnavailableError extends Error {}

// The bridge account names a light client other than the configured pin.
export class LightClientMismatchError extends Error {
  constructor(
    readonly pinned: web3.PublicKey,
    readonly current: web3.PublicKey,
  ) {
    super(
      `bridge light client ${current.toBase58()} differs from pinned ${pinned.toBase58()}`,
    );
  }
}

async function rpcRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch {
    throw new SolanaUnavailableError("Solana node is temporarily unavailable");
  }
}

export interface SolanaConfig {
  genesisHash: string;
  programId: web3.PublicKey;
  mint: web3.PublicKey;
  // A pin stops observation when governance re-pins. Unset follows the bridge.
  lightClientProgram?: web3.PublicKey;
  akashChainId: string;
  maxAgeSeconds: number;
}

// The owned RPC node is a trust boundary. Finalized commitment cannot make an
// untrusted RPC truthful. No public-provider fallback is configured here.
export class SolanaObserver {
  private readonly program: Program<Akt>;
  constructor(
    private readonly rpc: web3.Connection,
    private readonly config: SolanaConfig,
  ) {
    // IDL and deployment must be reviewed together. Rebuild for another ID.
    assert.equal(
      config.programId.toBase58(),
      idl.address,
      "program differs from built IDL",
    );
    this.program = new Program<Akt>(idl, { connection: rpc });
    assert.ok(config.mint.equals(this.pda("mint")), "noncanonical mint");
  }

  private pda(seed: string, suffix?: Buffer) {
    const seeds: Buffer[] = [Buffer.from(seed)];
    if (suffix) seeds.push(suffix);
    return web3.PublicKey.findProgramAddressSync(
      seeds,
      this.config.programId,
    )[0];
  }

  private async finalizedAccounts(address?: web3.PublicKey) {
    assert.equal(
      await rpcRead(() => this.rpc.getGenesisHash()),
      this.config.genesisHash,
      "wrong Solana cluster",
    );
    const snapshot = await rpcRead(() =>
      this.rpc.getMultipleAccountsInfoAndContext(
        [
          this.config.programId,
          this.pda("config"),
          this.pda("bridge"),
          this.config.mint,
          ...(address ? [address] : []),
        ],
        { commitment: "finalized" },
      ),
    );
    assert.ok(
      Number.isSafeInteger(snapshot.context.slot) && snapshot.context.slot > 0,
      "Solana node has no finalized positive slot",
    );
    const contextSlot = BigInt(snapshot.context.slot);
    const time = await rpcRead(() =>
      this.rpc.getBlockTime(snapshot.context.slot),
    );
    const age = time === null ? Infinity : Date.now() / 1000 - time;
    assert.ok(
      age >= -10 && age <= this.config.maxAgeSeconds,
      "stale Solana finalized state",
    );
    const [
      executable,
      launchAccount,
      bridgeAccount,
      mintAccount,
      statusAccount,
    ] = snapshot.value;
    assert.ok(executable?.executable, "mint program is not executable");
    for (const account of [launchAccount, bridgeAccount]) {
      assert.ok(
        account &&
          !account.executable &&
          account.owner.equals(this.config.programId),
        "wrong configuration owner",
      );
    }
    assert.ok(launchAccount && bridgeAccount && mintAccount);
    const launch = this.program.coder.accounts.decode<
      IdlAccounts<Akt>["launchConfig"]
    >("launchConfig", launchAccount.data);
    const bridge = this.program.coder.accounts.decode<
      IdlAccounts<Akt>["bridgeConfig"]
    >("bridgeConfig", bridgeAccount.data);
    assert.equal(launch.version, 2, "unsupported launch configuration");
    assert.ok(launch.mint.equals(this.config.mint), "wrong configured mint");
    assert.equal(
      bridge.chainId,
      this.config.akashChainId,
      "wrong bridge origin chain",
    );
    this.checkLightClient(bridge.lightClientProgram);
    const mint = unpackMint(this.config.mint, mintAccount, TOKEN_PROGRAM_ID);
    assert.ok(
      mint.isInitialized &&
        mint.decimals === 6 &&
        mint.freezeAuthority === null,
      "wrong AKT mint configuration",
    );
    assert.ok(
      mint.mintAuthority?.equals(this.pda("mint_authority")),
      "wrong mint authority",
    );
    return {
      contextSlot,
      statusAccount,
      bridgeEnabled: launch.bridgeEnabled,
      lightClientProgram: bridge.lightClientProgram,
      bridge,
      time,
    };
  }

  // Follow the bridge unless the operator configured a fixed light-client pin.
  private checkLightClient(current: web3.PublicKey) {
    const pinned = this.config.lightClientProgram;
    if (pinned && !current.equals(pinned))
      throw new LightClientMismatchError(pinned, current);
  }

  async deployment() {
    const { contextSlot, bridgeEnabled } = await this.finalizedAccounts();
    return { contextSlot, bridgeEnabled };
  }

  async mintQuota() {
    const { bridge, time } = await this.finalizedAccounts();
    assert.ok(time !== null && Number.isSafeInteger(time) && time > 0);
    // Mint policy uses UTC days; stored consumption resets on the next mint.
    const day = BigInt(Math.floor(time / 86_400));
    const mintDay = BigInt(bridge.mintDay.toString());
    assert.ok(day >= mintDay, "mint day is ahead of finalized time");
    return {
      capUakt: bridge.policy.dailyMintCap.toString(),
      usedUakt: day === mintDay ? bridge.mintedToday.toString() : "0",
      maxTransferUakt: bridge.policy.perTransferMax.toString(),
      resetAt: new Date(Number((day + 1n) * 86_400n) * 1000).toISOString(),
    };
  }

  // Reads the finalized bridge account; throws on a pin mismatch.
  async lightClient() {
    return (await this.finalizedAccounts()).lightClientProgram;
  }

  private statusAddress(record: Record) {
    return statusAddress(this.config.programId, record.id);
  }

  async observeFinalized(record: Record): Promise<FinalizedObserved> {
    const address = this.statusAddress(record);
    const { contextSlot, statusAccount } =
      await this.finalizedAccounts(address);
    if (!statusAccount) return { kind: "absent", contextSlot };
    assert.ok(
      !statusAccount.executable &&
        statusAccount.owner.equals(this.config.programId),
      "wrong transfer status owner",
    );
    const status = this.program.coder.accounts.decode<TransferStatus>(
      "transferStatus",
      statusAccount.data,
    );
    assert.ok(
      matchesAnchorId(status.id, record.id),
      "wrong status transfer ID",
    );
    assert.ok(
      BigInt(status.proofHeight.toString()) > record.height,
      "proof predates deposit commitment",
    );
    const slot = BigInt(status.resolvedAtSlot.toString());
    assert.ok(slot > 0n && slot <= contextSlot, "status is not finalized");
    let outcome: Outcome;
    if ("minted" in status.outcome) {
      assert.equal(
        BigInt(status.outcome.minted.amount.toString()),
        record.amount,
        "mint amount differs from Akash deposit",
      );
      assert.ok(
        status.outcome.minted.recipient.equals(record.recipient),
        "mint recipient differs from Akash deposit",
      );
      outcome = Outcome.OUTCOME_MINTED;
    } else if ("voided" in status.outcome) {
      outcome = Outcome.OUTCOME_VOIDED;
    } else {
      throw new Error("unknown transfer outcome");
    }
    return {
      kind: "resolved",
      contextSlot,
      address,
      status,
      outcome,
      slot,
      proofHeight: BigInt(status.proofHeight.toString()),
    };
  }
}
