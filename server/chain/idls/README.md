# Contract interfaces

These public ABI files and generated TypeScript types let the portal decode
Solana accounts without a `node` checkout or a local program build at runtime.

- `akt.json` and `akt.ts`: generated from the AKT program in
  [`akash-network/node`, revision `ba42b348`](https://github.com/akash-network/node/commit/ba42b348).
- `ics07_tendermint.json`: the light-client interface tracked by that same node
  revision. `ics07_tendermint.ts` is its generated Anchor TypeScript type.

Update each JSON/type pair together when the deployed protocol changes, using
the program's pinned Anchor build. Keep the program address in the AKT ABI
aligned with the configured deployment. The server rejects a different program
address, unexpected account owners, an incompatible mint, and stale or
unfinalized observations. These files are not private deployment configuration.
