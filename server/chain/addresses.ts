import { web3 } from "@coral-xyz/anchor";

export const LE64 = (value: bigint) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
};

export const pda = (seed: string, program: web3.PublicKey, suffix?: Buffer) =>
  web3.PublicKey.findProgramAddressSync(
    suffix ? [Buffer.from(seed), suffix] : [Buffer.from(seed)],
    program,
  )[0];
