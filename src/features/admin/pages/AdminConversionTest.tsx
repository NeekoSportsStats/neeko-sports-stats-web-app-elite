import { useState } from "react";
import { trackGoogleAdsPurchase } from "@/lib/analytics";

const ADS_ID    = import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined;
const ADS_LABEL = import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL as string | undefined;

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground/60 truncate max-w-[220px]">{value}</span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            ok
              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
              : "bg-red-950/60 text-red-400 border border-red-800/50"
          }`}
        >
          {ok ? "OK" : "MISSING"}
        </span>
      </div>
    </div>
  );
}

export default function AdminConversionTest() {
  const [dryRunLog, setDryRunLog]     = useState<string | null>(null);
  const [confirmed, setConfirmed]     = useState(false);
  const [fireResult, setFireResult]   = useState<string | null>(null);
  const [fired, setFired]             = useState(false);

  const gtagAvailable   = typeof (window as any).gtag === "function";
  const dlAvailable     = Array.isArray((window as any).dataLayer);
  const adsIdOk         = !!ADS_ID && ADS_ID.startsWith("AW-");
  const adsLabelOk      = !!ADS_LABEL && ADS_LABEL.length > 0;

  const dryRunPayload = {
    send_to: `${ADS_ID ?? "MISSING"}/${ADS_LABEL ?? "MISSING"}`,
    value: 5.99,
    currency: "AUD",
    transaction_id: `test_dry_${Date.now()}`,
  };

  function handleDryRun() {
    const msg = JSON.stringify(dryRunPayload, null, 2);
    console.log("[ConversionTest] DRY RUN — payload that would be sent:\n", dryRunPayload);
    setDryRunLog(msg);
    setFireResult(null);
  }

  function handleFire() {
    if (!confirmed) return;
    console.log("[ConversionTest] Firing test conversion event via trackGoogleAdsPurchase()");
    try {
      // trackGoogleAdsPurchase blocks on isAdminRoute() — we bypass that guard intentionally
      // here by calling gtag directly, since this is an explicit manual admin test.
      const gtag = (window as any).gtag;
      if (typeof gtag !== "function") {
        const msg = "ERROR: window.gtag is not a function. Google Ads tag may not have loaded yet.";
        console.error("[ConversionTest]", msg);
        setFireResult(msg);
        return;
      }
      const adsId = ADS_ID;
      const label = ADS_LABEL;
      if (!adsId || !label) {
        const msg = "ERROR: VITE_GOOGLE_ADS_ID or VITE_GOOGLE_ADS_PURCHASE_LABEL is missing.";
        console.error("[ConversionTest]", msg);
        setFireResult(msg);
        return;
      }
      const payload = {
        send_to: `${adsId}/${label}`,
        transaction_id: `test_manual_${Date.now()}`,
        value: 5.99,
        currency: "AUD",
      };
      console.log("[ConversionTest] Calling gtag('event', 'conversion', payload):", payload);
      gtag("event", "conversion", payload);
      const msg = `Fired at ${new Date().toISOString()} — send_to: ${payload.send_to}`;
      console.log("[ConversionTest] SUCCESS:", msg);
      setFireResult(msg);
      setFired(true);
    } catch (err) {
      const msg = `Exception: ${err}`;
      console.error("[ConversionTest]", msg);
      setFireResult(msg);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Google Ads Conversion Test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Admin-only tool. Does not affect checkout, Stripe, or subscription activation.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">How to test with Tag Assistant</p>
        <ol className="text-xs text-amber-200/70 space-y-1 list-decimal list-inside">
          <li>Open <strong>Google Tag Assistant</strong> in Chrome (tagassistant.google.com).</li>
          <li>Connect it to <strong>neekostats.com.au</strong> (not localhost).</li>
          <li>Navigate to this admin page (<code>/admin/conversion-test</code>) in the connected tab.</li>
          <li>Click <strong>Fire test conversion event</strong> below.</li>
          <li>In Tag Assistant, confirm a <strong>conversion</strong> event fires for <code>AW-11504493462</code>.</li>
        </ol>
      </div>

      {/* Config status */}
      <div className="rounded-lg border border-border/60 bg-card/60">
        <div className="px-4 py-3 border-b border-border/40">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Config Status</p>
        </div>
        <div className="px-4">
          <StatusRow
            label="VITE_GOOGLE_ADS_ID"
            ok={adsIdOk}
            value={ADS_ID ?? "not set"}
          />
          <StatusRow
            label="VITE_GOOGLE_ADS_PURCHASE_LABEL"
            ok={adsLabelOk}
            value={ADS_LABEL ? `${ADS_LABEL.slice(0, 6)}…` : "not set"}
          />
          <StatusRow
            label="window.gtag"
            ok={gtagAvailable}
            value={gtagAvailable ? "function" : "undefined"}
          />
          <StatusRow
            label="window.dataLayer"
            ok={dlAvailable}
            value={dlAvailable ? `array (${(window as any).dataLayer.length} items)` : "undefined"}
          />
        </div>
      </div>

      {/* Dry run */}
      <div className="rounded-lg border border-border/60 bg-card/60 px-4 py-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Dry Run</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Logs the exact payload to the browser console without sending anything to Google Ads.
          </p>
        </div>
        <button
          onClick={handleDryRun}
          className="inline-flex items-center px-4 py-2 rounded-md bg-muted hover:bg-muted/70 text-sm font-medium text-foreground transition-colors border border-border/60"
        >
          Log dry-run payload
        </button>
        {dryRunLog && (
          <pre className="rounded-md bg-black/50 border border-border/40 px-3 py-2.5 text-[11px] font-mono text-emerald-400 whitespace-pre-wrap break-all">
            {dryRunLog}
          </pre>
        )}
      </div>

      {/* Live fire */}
      <div className="rounded-lg border border-red-800/40 bg-red-950/10 px-4 py-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-red-300">Fire Test Conversion Event</p>
          <p className="text-xs text-red-400/70 mt-0.5">
            Calls <code>gtag("event", "conversion", ...)</code> directly. May register as a real conversion in Google Ads.
          </p>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-red-500 cursor-pointer shrink-0"
          />
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            I understand this may send a test conversion to Google Ads.
          </span>
        </label>

        <button
          onClick={handleFire}
          disabled={!confirmed || fired}
          className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
            confirmed && !fired
              ? "bg-red-950/60 hover:bg-red-900/60 text-red-300 border-red-800/60 cursor-pointer"
              : "bg-muted/30 text-muted-foreground/40 border-border/30 cursor-not-allowed"
          }`}
        >
          {fired ? "Conversion fired" : "Fire test conversion event"}
        </button>

        {fireResult && (
          <p
            className={`text-xs font-mono px-3 py-2 rounded-md border ${
              fireResult.startsWith("ERROR") || fireResult.startsWith("Exception")
                ? "bg-red-950/40 text-red-400 border-red-800/40"
                : "bg-emerald-950/40 text-emerald-400 border-emerald-800/40"
            }`}
          >
            {fireResult}
          </p>
        )}

        {fired && (
          <p className="text-xs text-muted-foreground/60">
            Button disabled after one fire. Reload the page to test again.
          </p>
        )}
      </div>
    </div>
  );
}
