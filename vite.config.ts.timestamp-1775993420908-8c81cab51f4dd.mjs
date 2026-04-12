// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import fs from "fs";
var __vite_injected_original_dirname = "/home/project";
function skipBrokenPublicFiles() {
  return {
    name: "skip-broken-public-files",
    enforce: "pre",
    config() {
      return {};
    },
    buildStart() {
      const broken = path.resolve(__vite_injected_original_dirname, "public/image copy.png");
      try {
        fs.accessSync(broken, fs.constants.R_OK);
      } catch {
        try {
          fs.unlinkSync(broken);
        } catch {
        }
      }
    }
  };
}
var vite_config_default = defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    // 🔥 Proxy so your local /api/* routes match Vercel
    proxy: {
      "/api": {
        target: "http://localhost:54321/functions/v1",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api/, "")
      }
    }
  },
  plugins: [react(), skipBrokenPublicFiles()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  // 🔥 Fixes Stripe + some libraries needing process env
  define: {
    "process.env": {}
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgdHlwZSB7IFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5cbmZ1bmN0aW9uIHNraXBCcm9rZW5QdWJsaWNGaWxlcygpOiBQbHVnaW4ge1xuICByZXR1cm4ge1xuICAgIG5hbWU6IFwic2tpcC1icm9rZW4tcHVibGljLWZpbGVzXCIsXG4gICAgZW5mb3JjZTogXCJwcmVcIixcbiAgICBjb25maWcoKSB7XG4gICAgICByZXR1cm4ge307XG4gICAgfSxcbiAgICBidWlsZFN0YXJ0KCkge1xuICAgICAgY29uc3QgYnJva2VuID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJwdWJsaWMvaW1hZ2UgY29weS5wbmdcIik7XG4gICAgICB0cnkge1xuICAgICAgICBmcy5hY2Nlc3NTeW5jKGJyb2tlbiwgZnMuY29uc3RhbnRzLlJfT0spO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHRyeSB7IGZzLnVubGlua1N5bmMoYnJva2VuKTsgfSBjYXRjaCB7IC8qIGFscmVhZHkgZ29uZSBvciB1bnJlbW92YWJsZSAqLyB9XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogXCIwLjAuMC4wXCIsXG4gICAgcG9ydDogNTE3MyxcblxuICAgIC8vIFx1RDgzRFx1REQyNSBQcm94eSBzbyB5b3VyIGxvY2FsIC9hcGkvKiByb3V0ZXMgbWF0Y2ggVmVyY2VsXG4gICAgcHJveHk6IHtcbiAgICAgIFwiL2FwaVwiOiB7XG4gICAgICAgIHRhcmdldDogXCJodHRwOi8vbG9jYWxob3N0OjU0MzIxL2Z1bmN0aW9ucy92MVwiLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9hcGkvLCBcIlwiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcblxuICBwbHVnaW5zOiBbcmVhY3QoKSwgc2tpcEJyb2tlblB1YmxpY0ZpbGVzKCldLFxuXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi9zcmNcIiksXG4gICAgfSxcbiAgfSxcblxuICAvLyBcdUQ4M0RcdUREMjUgRml4ZXMgU3RyaXBlICsgc29tZSBsaWJyYXJpZXMgbmVlZGluZyBwcm9jZXNzIGVudlxuICBkZWZpbmU6IHtcbiAgICBcInByb2Nlc3MuZW52XCI6IHt9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlOLFNBQVMsb0JBQW9CO0FBQ3RQLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsT0FBTyxRQUFRO0FBSGYsSUFBTSxtQ0FBbUM7QUFNekMsU0FBUyx3QkFBZ0M7QUFDdkMsU0FBTztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsU0FBUztBQUNQLGFBQU8sQ0FBQztBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWE7QUFDWCxZQUFNLFNBQVMsS0FBSyxRQUFRLGtDQUFXLHVCQUF1QjtBQUM5RCxVQUFJO0FBQ0YsV0FBRyxXQUFXLFFBQVEsR0FBRyxVQUFVLElBQUk7QUFBQSxNQUN6QyxRQUFRO0FBQ04sWUFBSTtBQUFFLGFBQUcsV0FBVyxNQUFNO0FBQUEsUUFBRyxRQUFRO0FBQUEsUUFBb0M7QUFBQSxNQUMzRTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUE7QUFBQSxJQUdOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLFNBQVMsQ0FBQ0EsVUFBU0EsTUFBSyxRQUFRLFVBQVUsRUFBRTtBQUFBLE1BQzlDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLFNBQVMsQ0FBQyxNQUFNLEdBQUcsc0JBQXNCLENBQUM7QUFBQSxFQUUxQyxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUE7QUFBQSxFQUdBLFFBQVE7QUFBQSxJQUNOLGVBQWUsQ0FBQztBQUFBLEVBQ2xCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsicGF0aCJdCn0K
