# Akash Sink portal

Web app for moving AKT from Akash to Solana with Akash Sink. Users sign a
`MsgSink` deposit in their Akash wallet and track the transfer until AKT is minted on
Solana. The chain side lives in
[akash-network/node](https://github.com/akash-network/node): the `x/sink`
module and `contracts/solana`.

This repository owns the React frontend, HTTP API, static-file server, and
wallet RPC/REST proxy. The blockchain module, Solana program, relayer, and
reporter services live in `akash-network/node`; the portal connects to their
network endpoints and does not import their source or testnet workspace files.

[`shared/contracts.ts`](shared/contracts.ts) is the API contract used by both
server and frontend. API version 2 requires the composite-ID sink schema.

## Setup

Requires Node 24. The x/sink message types are not in a published chain-sdk
release yet, so pack the SDK dependency from a checkout with the sink API:

```bash
CHAIN_SDK_DIR=../chain-sdk npm run sdk
npm ci
cp server/config.example.json portal.config.json
cp .env.example .env.local
```

Replace the placeholders in `portal.config.json` with the verified Akash chain
ID and genesis timestamp, Solana genesis hash, RPC endpoints, deployed program,
and canonical mint. The example's program and mint match the bundled ABI.
Configuration validation rejects incomplete examples. Keep `portal.config.json`
and `.env.local` local; both are ignored by Git.

The server checks the configured network identities, committed Akash heights,
Solana account ownership, mint authority, light-client state, and finality before
returning signing configuration or a completed receipt. A missing or inconsistent
chain response produces an error, never a fabricated balance or successful mint.

## Development

```bash
npm run dev        # API on 127.0.0.1:8080 and Vite on 127.0.0.1:5173
```

The API restarts when its source changes; React components and styles use hot
reload. Vite forwards `/api`, `/rpc`, and `/rest` to the local server, so browser
requests remain same-origin. `PORTAL_CONFIG` selects the server configuration
file. `PORTAL_API_URL` selects the Vite proxy target and defaults to
`http://127.0.0.1:8080`.

Use `npm run dev:web` or `npm run dev:server` to run either process separately.
To connect the frontend to another portal server, set `PORTAL_API_URL` in
`.env.local` and run `npm run dev:web`.

## Build and serve

```bash
npm run build      # dist/ frontend and build/server.cjs API
npm start          # serves both through the portal's HTTP server
```

The production server reads the same `PORTAL_CONFIG` file. Set its `origin` to
the public HTTPS origin, configure its listening host/port, and put it behind
your authenticated reverse proxy or other access boundary. Origin checks protect
browser requests; they do not authenticate clients without an Origin header.
Configured web origins and approved wallet extension origins may use the proxy.
Remove local development origins from production configuration.

`dist/` contains `app.js`, `app.css`, `theme.js`, wallet chunks, and public assets.
The synchronous theme script applies the saved theme before CSS loads and works
with `script-src 'self'`. The server bundle stays outside the public directory.
`npm run preview` serves only the built frontend on port 4173 and proxies to the
configured API; use `npm start` for the combined application.

The optional faucet is disabled by default. Private testnet operators can set
`faucet.kind` to `testnet`, provide an `akashKeyFile` containing a dedicated
32-byte hexadecimal test key, and choose a portal-owned `stateFile`. Never enable
it for production: it grants 100 AKT or 2 SOL, with five requests per wallet and
100 requests total per UTC day. Allowances are charged before transmission;
check the wallet before retrying an uncertain result. Run one faucet process
per state file. The normal portal requires no signing key.

The developer status endpoint reports the portal's verified RPC connectivity.
Relayer/reporter process health and supply reconciliation remain operator
monitoring responsibilities; the portal does not read another repository's
process registry or claim a supply result it has not verified.

`public/token/akt.json` contains private-testnet token metadata. Replace and
version that metadata before any mainnet deployment.

## Source layout

```text
src/
  main.tsx             React startup
  app/                 app shell, hash routes, header, and theme
  features/
    transfers/         form, review, receipts, history, and transfer state
    wallets/           Akash/Solana connectors and unsigned draft recovery
    developer/         network diagnostics and bridge diagram
  components/          shared components and shadcn/ui primitives
  hooks/               shared React hooks
  lib/                 browser validation and display utilities
  styles.css           Tailwind and application styles
server/                HTTP server, API, wallet proxy, and optional testnet faucet
  chain/               read-only chain adapters and bundled contract interfaces
shared/                API types and chain message/identity helpers
public/                static fonts, logos, wallet icons, and token metadata
test/                  component-test setup
e2e/                   Playwright checks and fixtures
scripts/               SDK packaging, dev processes, and pre-paint theme build
```

Node tests (`*.test.ts`) and component specs (`*.spec.tsx` / `*.spec.ts`) live
beside their source modules. The `@/` alias points to `src/`.

## Wallets

- **Akash:** Cosmos Kit with Keplr and Keplr Mobile through WalletConnect.
- **Solana:** Solana Foundation ConnectorKit discovers Wallet Standard wallets. Android uses Mobile Wallet Adapter; iPhone offers Phantom/Solflare wallet-browser links. Pasting an address always works.
- Solana connections only read an address. Only the Akash wallet signs a transfer.

Builds use the portal’s public Reown project ID. Allow the deployed origin in
[Reown](https://dashboard.reown.com). To use a different project:

```bash
WALLETCONNECT_PROJECT_ID=<portal-project-id> npm run build
```

The ID is public configuration, not a private key. Mobile wallets must support the configured
Akash chain; private fork support is not implied by mainnet support.

Serve over HTTPS. The portal server includes these wallet transports in its
`Content-Security-Policy` alongside same-origin API traffic:

```text
connect-src 'self' https://explorer-api.walletconnect.com https://relay.walletconnect.com https://relay.walletconnect.org wss://relay.walletconnect.com wss://relay.walletconnect.org https://verify.walletconnect.com https://verify.walletconnect.org https://pulse.walletconnect.org https://echo.walletconnect.com ws://localhost:*;
frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org;
```

Keep the other directives, including `script-src 'self'`. The loopback WebSocket
is Android’s local wallet transport. Preserve these allowances in any reverse
proxy that adds its own Content-Security-Policy header. See [Reown’s CSP guidance](https://docs.reown.com/advanced/security/content-security-policy).

A wallet-browser handoff carries only the unsigned amount, destination and network
identity in the URL fragment. Reloads retain the same draft in session storage for
30 minutes. A new browser must reconnect and review; no signed transaction or
wallet authorization is carried across.

Before deployment, verify real Keplr Mobile pairing, Android wallet handoff and an
iPhone wallet-browser transfer on the served origin. Local browser fixtures do not
prove those app/relay flows or a live transfer.

## Checks

```bash
npm run typecheck
npm test             # frontend/server tests and component specs
npm run test:wallets  # built-page wallet fixtures, no live funds or relay
npm run format:check
```

`test:wallets` covers desktop Chromium and an iPhone-sized Chromium viewport;
it is not a device test. It also checks account changes, cancellation and unsigned
draft recovery.

`npm run test:e2e` runs Playwright against a running portal. Copy
`e2e/.env.example` to `e2e/.env.local` and set `BASE_URL` and `E2E_CHAIN_ID`.
`E2E_LOCAL_UI=true` serves this checkout's `dist/` in place of the deployed
page. Without `TEST_WALLET_MNEMONIC` only read-only specs run.

## License

Apache 2.0. The Geist and Inter fonts in `public/assets` use the SIL Open Font
License; see the files next to them.

## Transfer identity and history

Transfer IDs are `owner/height/sequence`. All three components identify the
record; height and sequence are parsed as bigint, never JavaScript numbers.
Receipt links encode the whole ID and include the network identity. A receipt
must agree with the ID's owner and creation height and the signed destination
and amount.

The receipt API exposes `transfer_pending`, `minted`, `refund_pending` and
`refunded` separately from `none`, `veto` or `conflict` holds. A paid refund or
mint can still need dispute resolution. Passing a challenge deadline does not
prove that the refund was paid.

`GET /api/transfers?sender=<owner>` returns the owner's newest 100 records at
one committed height, newest first, with a required `truncated` flag. Older
transfers remain accessible by ID or transaction hash. Discovered rows have
`txHash: null` and a composite `transferId`. Their `createdAt` is null only when
the creation block predates the node's retained history. Undated rows appear
last in ledger-ID order, newest first, with "Date unavailable".

The portal keeps discovered rows in memory and merges them with matching signed
submissions. Browser storage keeps only submissions signed in this browser;
discovery cannot evict pending, rejected or older-network receipts. Transaction
lookup still binds the signed message and response to the committed record.

Version-2 history uses `akt-bridge-submissions-v2`. The previous
`akt-bridge-submissions-v1` entry remains read-only. Older numeric IDs are never
interpreted as composite IDs or sent to the new chain.

Displayed limits are uakt amounts. The account cap may be zero for unlimited
account sending. The minimum is positive while deposits are enabled and may be zero
while paused. The maximum and aggregate cap remain positive. Account and aggregate
caps can be lower than the transfer maximum; the portal bounds input by the smallest
applicable cap. Current epoch consumption can reduce the remaining allowance further.
Account and aggregate allowances reset when Akash's existing `x/epochs`
module advances its `day` record. Its duration and start are configured in
epochs genesis. The portal does not infer a reset from local time. Solana
mints can run immediately under their independent amount caps.
