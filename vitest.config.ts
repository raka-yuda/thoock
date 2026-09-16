import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", globals: true, coverage: { reporter: ["text", "html"] } }, resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)) } } });
