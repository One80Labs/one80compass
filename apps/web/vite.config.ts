import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "../..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // FAQ embeds SOPs from docs/sop via ?raw imports.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), repoRoot] },
  },
  define: {
    global: "globalThis",
  },
});
