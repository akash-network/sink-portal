# Akash Sink portal

Web app for moving AKT from Akash to Solana with Akash Sink. Users sign a
`MsgSink` deposit in their Akash wallet and track the transfer until AKT is minted on
Solana. The chain side lives in
[akash-network/node](https://github.com/akash-network/node): the `x/sink`
module and `contracts/solana`.

The app is static. It reads `/api/config`, `/api/status`, `/api/receipt` and
`/api/transfers` from its server and reaches Akash through `/rpc` and `/rest`
on the same origin. [`contracts.ts`](contracts.ts) defines those responses; [`model.ts`](model.ts) validates them. The current
API version is 2 and requires the composite-ID sink schema.

## Build

Requires Node 24. The x/sink message types are not in a published chain-sdk
release yet, so pack them from a [chain-sdk](https://github.com/akash-network/chain-sdk)
checkout with the sink API, next to this one by default:

```bash
CHAIN_SDK_DIR=../chain-sdk npm run sdk
npm ci
npm run build    # writes dist/
```

Serve `dist/` behind a server that provides the API above.

## Wallets

- **Akash:** Cosmos Kit with Keplr, Cosmostation and Keplr Mobile through WalletConnect.
- **Solana:** Solana Foundation ConnectorKit discovers Wallet Standard wallets. Android uses Mobile Wallet Adapter; iPhone offers Phantom/Solflare wallet-browser links. Pasting an address always works.
- Solana connections only read an address. Only the Akash wallet signs a transfer.

For mobile Akash pairing, create a portal project in [Reown](https://dashboard.reown.com), allow the deployed origin and build with its public ID:

```bash
WALLETCONNECT_PROJECT_ID=<portal-project-id> npm run build
```

Without the ID, extension connections work and the mobile Akash choice is disabled.
The ID is public configuration, not a private key. An arbitrary or another app’s ID
is not a reliable substitute. Mobile wallets must also support the configured
Akash chain; private fork support is not implied by mainnet support.

Serve over HTTPS. The server’s `Content-Security-Policy` must allow the wallet
transports in addition to existing same-origin API traffic:

```text
connect-src 'self' https://explorer-api.walletconnect.com https://relay.walletconnect.com https://relay.walletconnect.org wss://relay.walletconnect.com wss://relay.walletconnect.org https://verify.walletconnect.com https://verify.walletconnect.org https://pulse.walletconnect.org https://echo.walletconnect.com ws://localhost:*;
frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org;
```

Keep the other directives, including `script-src 'self'`. The loopback WebSocket
is Android’s local wallet transport. Apply these directives in the serving backend
or proxy: this static build cannot relax an existing `connect-src 'self'` response
header. See [Reown’s CSP guidance](https://docs.reown.com/advanced/security/content-security-policy).

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
npm test             # unit tests and component specs
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
