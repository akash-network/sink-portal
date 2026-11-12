import { z } from "zod";

const amount = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/);
const cap = z.object({ capUakt: amount, usedUakt: amount });

export const quotaSchema = z.object({
  version: z.literal(1),
  networkKey: z.string().min(1).max(2048),
  checkedAt: z.iso.datetime(),
  akashHeight: amount,
  epoch: amount,
  epochStarted: z.boolean(),
  resetAt: z.iso.datetime(),
  minTransferUakt: amount,
  maxTransferUakt: amount,
  deposits: cap,
  mints: cap.extend({ resetAt: z.iso.datetime(), maxTransferUakt: amount }),
  account: cap.extend({ owner: z.string().min(1).max(512) }).nullable(),
});

export type Quota = z.infer<typeof quotaSchema>;
