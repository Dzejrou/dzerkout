import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { rmSync } from "fs";

const host = process.env.TAURI_DEV_HOST;

// Tauri sets TAURI_ENV_PLATFORM=android during `tauri android build/dev`.
// We strip locally-downloaded catalog images from the bundled output for the
// Android build so they never end up inside the APK. Mac/dev builds keep them.
// See scripts/README.md for the full mac/Android workflow.
const isAndroidBuild =
  process.env.TAURI_ENV_PLATFORM === "android" ||
  process.env.TAURI_PLATFORM === "android";

function excludeLocalCatalogOnAndroid() {
  return {
    name: "dzerkout:exclude-local-catalog-on-android",
    apply: "build" as const,
    closeBundle() {
      if (!isAndroidBuild) return;
      const target = path.resolve(__dirname, "dist/catalog");
      try {
        rmSync(target, { recursive: true, force: true });
        // eslint-disable-next-line no-console
        console.log(`[dzerkout] android build: removed ${target}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          `[dzerkout] android build: failed to remove ${target}: ${(e as Error).message}`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), excludeLocalCatalogOnAndroid()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
