# shadcn/ui components

Source: the official [new-york-v4 registry](https://ui.shadcn.com/r/styles/new-york-v4/button.json), retrieved 2026-10-15.
Button, Card, Dialog, Tabs, Badge, Input, Label, NativeSelect and Separator use the registry
source with its `cn` import pointed to `ui/lib/utils.ts`. The utility uses
`clsx` and `tailwind-merge`. The [MIT license](LICENSE.md) is included.

The components use React, Radix UI and Tailwind CSS v4. Project configuration is
in `components.json`, theme tokens are in `ui/styles.css`, and esbuild uses
`tsconfig.ui.json` to resolve `@/*`. Both TypeScript configurations share that
alias for registry tooling. No component or font is fetched at runtime.

See [manual installation](https://ui.shadcn.com/docs/installation/manual) and
[dark mode](https://ui.shadcn.com/docs/dark-mode/vite) for upstream conventions.

Dialog uses the same official [registry](https://ui.shadcn.com/r/styles/new-york-v4/dialog.json),
with local `cn` and Button imports. Radix handles modal focus, Escape and dismissal.
