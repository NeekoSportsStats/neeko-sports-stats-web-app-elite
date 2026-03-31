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
const root = createRoot(rootEl!);
console.log("createRoot successful");

console.log("About to render");
root.render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </QueryClientProvider>
);
console.log("Render called");
