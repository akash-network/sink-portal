import { fromBech32, toBech32 } from "@cosmjs/encoding";
import type { Sink_ID as ID } from "@akashnetwork/chain-sdk/private-types/akash.v1";

const MAX_HEIGHT = 0x7fffffffffffffffn;
const MAX_SEQUENCE = 0xffffffffffffffffn;

export function decodeSinkId(value: unknown): ID {
  if (typeof value !== "string") throw new Error("Invalid transfer ID");
  const parts = value.split("/");
  if (parts.length !== 3)
    throw new Error("Transfer ID must be owner/height/sequence");
  const [owner, height, sequence] = parts;
  const address = fromBech32(owner, 90);
  if (
    address.prefix !== "akash" ||
    address.data.length !== 20 ||
    address.data.every((byte) => byte === 0) ||
    toBech32("akash", address.data) !== owner ||
    !/^[1-9][0-9]{0,18}$/.test(height) ||
    !/^[1-9][0-9]{0,19}$/.test(sequence) ||
    BigInt(height) > MAX_HEIGHT ||
    BigInt(sequence) > MAX_SEQUENCE
  )
    throw new Error("Invalid transfer owner, height or sequence");
  return { owner, height: BigInt(height), sequence: BigInt(sequence) };
}

export function parseSinkId(value: unknown): string {
  return sinkIdText(decodeSinkId(value));
}

export function sinkIdText(id: ID): string {
  const value = `${id.owner}/${id.height}/${id.sequence}`;
  decodeSinkId(value);
  return value;
}

// Ledger order: height, then the per-block sequence, which is unique within
// a block across owners.
export function compareSinkIds(a: string, b: string): number {
  const x = decodeSinkId(a),
    y = decodeSinkId(b);
  if (x.height !== y.height) return x.height < y.height ? -1 : 1;
  if (x.sequence !== y.sequence) return x.sequence < y.sequence ? -1 : 1;
  return 0;
}
