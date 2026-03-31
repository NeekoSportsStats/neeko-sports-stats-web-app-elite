import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { AuthProvider } from "@/lib/auth";
import { initAnalytics } from "@/lib/analytics";
import "./index.css";

initAnalytics();

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");

if (!rootEl) {
  console.error("Root element not found");
  document.body.innerHTML = '<div style="color: white; padding: 20px;">ERROR: Root element not found</div>';
} else {
  const root = createRoot(rootEl);

  root.render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}
