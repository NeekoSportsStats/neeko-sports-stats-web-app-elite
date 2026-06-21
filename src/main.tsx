import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { AuthProvider } from "@/lib/auth";
import { initAnalytics, initGoogleAds, track } from "@/lib/analytics";
import "./index.css";

initAnalytics();
initGoogleAds();

// Global error tracking
window.addEventListener("error", (event) => {
  try {
    track("app_error", {
      error_message: event.message ?? "Unknown error",
      error_source: event.filename ?? null,
      error_line: event.lineno ?? null,
      error_col: event.colno ?? null,
      error_type: "uncaught_error",
      current_path: window.location.pathname,
    });
  } catch { /* non-critical */ }
});

window.addEventListener("unhandledrejection", (event) => {
  try {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection");
    track("app_error", {
      error_message: msg,
      error_type: "unhandled_rejection",
      current_path: window.location.pathname,
    });
  } catch { /* non-critical */ }
});

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
