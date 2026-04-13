const TRUST_POINTS = [
  { num: "630+", label: "Players analysed", sub: "Every position, every round — ranked by projection, value, and form." },
  { num: "100%", label: "Real AFL data", sub: "No guesswork. Every signal built on verified match and fantasy stats." },
  { num: "Weekly", label: "Updated before lockout", sub: "Data refreshes before round lockout so you always have the latest edge." },
  { num: "Built", label: "To help you win", sub: "Every tool is designed for one goal — better fantasy decisions, every week." },
];

export default function LandingTrust() {
  return (
    <section style={{ background: "#0a0908", padding: "80px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 14 }}>Why Trust Neeko</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, margin: 0 }}>
            Built for Serious Fantasy Players
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          {TRUST_POINTS.map(({ num, label, sub }) => (
            <div
              key={label}
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "24px 22px" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{num}</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#EAEAEA", marginBottom: 6, letterSpacing: "-0.01em" }}>{label}</p>
              <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.36)", lineHeight: 1.6 }}>{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
