# Portal image: the static web app (dist/) and its API server (build/server.cjs).
#
# Run `npm run sdk` first: the build installs the x/sink chain-sdk from .cache/chain-sdk.tgz,
# because those message types are not in a published chain-sdk release yet.
#
#   CHAIN_SDK_DIR=../chain-sdk npm run sdk
#   docker build -t sink-portal .
#   docker run -p 8080:8080 -v $PWD/portal.config.json:/etc/sink-portal/portal.config.json:ro sink-portal
#
# The config must set "host": "0.0.0.0" to be reachable from outside the container.
ARG NODE_IMAGE=node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c

FROM ${NODE_IMAGE} AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY .cache/chain-sdk.tgz .cache/chain-sdk.tgz
COPY scripts/unpin-sdk.mjs scripts/unpin-sdk.mjs
RUN node scripts/unpin-sdk.mjs && npm ci
COPY . .
RUN npm run build \
    && npm prune --omit=dev \
    && test -f build/server.cjs \
    && test -f dist/index.html

FROM ${NODE_IMAGE}
ARG PORTAL_REVISION=unknown
ARG CHAIN_SDK_REVISION=unknown
LABEL org.opencontainers.image.title="sink-portal" \
      org.opencontainers.image.description="Akash Sink portal: web app and API" \
      org.opencontainers.image.source="https://github.com/akash-network/sink-portal" \
      org.opencontainers.image.revision="${PORTAL_REVISION}" \
      network.akash.chain-sdk.revision="${CHAIN_SDK_REVISION}"
ENV NODE_ENV=production \
    PORTAL_CONFIG=/etc/sink-portal/portal.config.json
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
# Liveness only (no chain calls); assumes the default port 8080.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "build/server.cjs"]
