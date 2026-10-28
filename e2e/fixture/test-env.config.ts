import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// The example is committed; a mnemonic there would end up in Git history.
const exampleFile = join(__dirname, "..", ".env.example");
if (/^TEST_WALLET_MNEMONIC=[ \t]*\S/m.test(readFileSync(exampleFile, "utf8")))
  throw new Error(
    "e2e/.env.example contains a mnemonic. Move it to e2e/.env.local, which Git ignores.",
  );

// Shell variables win over e2e/.env.local, which Git ignores.
const envFile = join(__dirname, "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const loopbackHosts = ["localhost", "127.0.0.1"];

export const testEnvConfig = z
  .object({
    BASE_URL: z
      .url()
      .default("http://127.0.0.1:18080")
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" || loopbackHosts.includes(url.hostname)
        );
      }, "Wallet connections need an HTTPS or loopback BASE_URL"),
    E2E_CHAIN_ID: z.string().min(1).default("akash-bridge-testnetify-dev-1"),
    // Never echo the value: issues carry only this message.
    TEST_WALLET_MNEMONIC: z
      .string()
      .trim()
      .refine(
        (value) => [12, 24].includes(value.split(/\s+/).length),
        "TEST_WALLET_MNEMONIC must have 12 or 24 words",
      )
      .optional()
      .or(z.literal("").transform(() => undefined)),
    E2E_SEND_TRANSFER: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    // Serves this checkout's portal build instead of the deployed one.
    E2E_LOCAL_UI: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .parse(process.env);
