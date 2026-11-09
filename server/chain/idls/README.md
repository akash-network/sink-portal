# Contract interfaces

These public ABI files and generated TypeScript types let the portal decode
Solana accounts without a `node` checkout or a local program build at runtime.

- `akt.json` and `akt.ts`: the **mainnet** AKT build (program
  `98inUHb5mMaHWQZ9ut9PGrnmkMpncLZWWAyFwxCWagME`), copied unmodified from
  [`akash-network/node` `contracts/solana/deployments/mainnet/build` at `3657291e`](https://github.com/akash-network/node/tree/3657291e4088699b6d19c152140546dc8c6207db/contracts/solana/deployments/mainnet/build).
  They match that directory's `SHA256SUMS` (`akt.json` `d24da1ff…`, `akt.ts` `493b5948…`). The
  deployed binary matches the published `akt.so` (`4cf85bb9…`).
- `ics07_tendermint.json`: the light-client interface tracked by that same node
  revision. `ics07_tendermint.ts` is its generated Anchor TypeScript type.

Update each JSON/type pair together when the deployed protocol changes, using
the program's pinned Anchor build. Keep the program address in the AKT ABI
aligned with the configured deployment. The server rejects a different program
address, unexpected account owners, an incompatible mint, and stale or
unfinalized observations. These files are not private deployment configuration.
