import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import type { Plugin } from "vite";

function skipBrokenPublicFiles(): Plugin {
  return {
    name: "skip-broken-public-files",
    enforce: "pre",
    config() {
      return {};
    },
    buildStart() {
      const broken = path.resolve(__dirname, "public/image copy.png");
      try {
        fs.accessSync(broken, fs.constants.R_OK);
      } catch {
        try { fs.unlinkSync(broken); } catch { /* already gone or unremovable */ }
      }
    },
  };
}

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,

    // 🔥 Proxy so your local /api/* routes match Vercel
    proxy: {
      "/api": {
        target: "http://localhost:54321/functions/v1",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },

  plugins: [react(), skipBrokenPublicFiles()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // 🔥 Fixes Stripe + some libraries needing process env
  define: {
    "process.env": {},
  },
});
