// main.tsx
console.log("MAIN START");

import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import { AuthProvider } from "@/lib/auth";
import { initAnalytics } from "@/lib/analytics";
import "./index.css";

console.log("Imports loaded");

initAnalytics();
console.log("Analytics initialized");

const queryClient = new QueryClient();
console.log("QueryClient created");

const rootEl = document.getElementById("root");
console.log("Root element:", rootEl);

console.log("About to call createRoot");
console.log("Root element null check:", rootEl === null);
console.log("Root element tagName:", rootEl?.tagName);

if (!rootEl) {
  console.error("CRITICAL: Root element not found!");
  document.body.innerHTML = '<div style="color: white; padding: 20px;">ERROR: Root element not found</div>';
} else {
  const root = createRoot(rootEl);
  console.log("createRoot successful");

  console.log("About to render - testing force render first");

  // FORCE RENDER TEST - bypass all providers
  root.render(
    <div style={{color: "white", padding: "20px", fontSize: "24px"}}>
      FORCE RENDER - React is mounting
    </div>
  );

  console.log("Force render called");
}
