import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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

  plugins: [react()],

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
