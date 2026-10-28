# Akash Sink portal

Web app for moving AKT from Akash to Solana with Akash Sink. Users sign a
`MsgSink` deposit in Keplr and track the transfer until AKT is minted on
Solana. The chain side lives in
[akash-network/node](https://github.com/akash-network/node): the `x/sink`
module and `contracts/solana`.

The app is static. It reads `/api/config`, `/api/status`, `/api/receipt` and
`/api/transfers` from its server and reaches Akash through `/rpc` and `/rest`
on the same origin. [`contracts.ts`](contracts.ts) defines and validates those
responses.

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

## Checks

```bash
npm run typecheck
npm test             # unit tests and component specs
npm run format:check
```

`npm run test:e2e` runs Playwright against a running portal. Copy
`e2e/.env.example` to `e2e/.env.local` and set `BASE_URL` and `E2E_CHAIN_ID`.
`E2E_LOCAL_UI=true` serves this checkout's `dist/` in place of the deployed
page. Without `TEST_WALLET_MNEMONIC` only read-only specs run.

## License

Apache 2.0. The Geist and Inter fonts in `public/assets` use the SIL Open Font
License; see the files next to them.
