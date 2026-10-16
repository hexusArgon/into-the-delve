import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const fromHere = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

// Inside this monorepo, resolve the @idosgames/* packages to their source for instant HMR (no SDK/
// host rebuild needed in dev). A standalone copy of this template — a cloned starter, or an AI Coder
// project built in a container — has no such paths and resolves each package from node_modules.
const sourceAliases: Record<string, string> = {
  // ⚠ Subpaths BEFORE the package: a string alias matches its prefix too, so "@idosgames/core"
  // would turn "@idosgames/core/realtime" into ".../src/index.ts/realtime".
  "@idosgames/core/realtime": fromHere(
    "../../packages/core/src/realtime/index.ts",
  ),
  "@idosgames/core": fromHere("../../packages/core/src/index.ts"),
  "@idosgames/module-sdk": fromHere("../../packages/module-sdk/src/index.ts"),
  "@idosgames/react/ui": fromHere("../../packages/react/src/ui/index.ts"),
  "@idosgames/react": fromHere("../../packages/react/src/index.ts"),
  "@idosgames/app-shell": fromHere("../../packages/app-shell/src/index.ts"),
};

// Env comes the standard Vite way: VITE_* variables of .env.local reach the code as
// `import.meta.env.VITE_*` (src/env.ts, src/config.ts). VITE_IDOS_ENV ("dev" | "prod") picks which
// copy of the title a LOCAL run talks to; hosted builds take it from their address instead.
export default defineConfig(() => {
  const alias = Object.fromEntries(
    Object.entries(sourceAliases).filter(([, path]) => existsSync(path)),
  );
  return {
    plugins: [react()],
    resolve: {
      alias: {
        ...alias,
        "viem/tempo/zones": fromHere("./src/shims/viem-tempo-zones.ts"),
      },
    },
    server: { host: "127.0.0.1", port: 5180, strictPort: true },
  };
});
