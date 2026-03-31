import React, { useEffect, useState } from "react";

import RoundSummary from "@/components/epl/players/RoundSummary";
import FormStabilityGrid from "@/components/epl/players/FormStabilityGrid";
import PositionTrends from "@/components/epl/players/PositionTrends";
import AIInsights from "@/components/epl/players/AIInsights";
import MasterTable from "@/components/epl/players/MasterTable";
import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";
import { LEAGUE_AVAILABILITY } from "@/config/leagueAvailability";
import ComingSoonOverlay from "@/components/ComingSoonOverlay";

export default function EPLPlayersPage() {
  const isComingSoon = LEAGUE_AVAILABILITY.epl === "coming-soon";
  const [activeSection, setActiveSection] = useState("round-momentum");
  const [isStuck, setIsStuck] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);

  useEffect(() => {
    const ids = [
      "round-momentum",
      "form-stability",
      "position-trends",
      "ai-insights",
      "master-table",
    ];

    const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setActiveSection(entry.target.id);
      }
    });
  },
  {
    threshold: 0.15,
    rootMargin: "-10% 0px -55% 0px",
  }
);


    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const links = document.querySelectorAll("a[href^='#']");

    const handler = (e: Event) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute("href");
      if (!href) return;

      const el = document.querySelector(href);
      if (!el) return;

      const topOffset = el.getBoundingClientRect().top + window.scrollY - 110;

      window.scrollTo({
        top: topOffset,
        behavior: "smooth",
      });
    };

    links.forEach((l) => l.addEventListener("click", handler));

    return () => links.forEach((l) => l.removeEventListener("click", handler));
  }, []);

  useEffect(() => {
    const anchor = document.getElementById("selector-bar");
    if (!anchor) return;

    const io = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 1 }
    );

    io.observe(anchor);

    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setShowTopButton(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sections = [
    { id: "round-momentum", label: "Round Momentum" },
    { id: "form-stability", label: "Form Stability" },
    { id: "position-trends", label: "Position Trends" },
    { id: "ai-insights", label: "AI Insights" },
    { id: "master-table", label: "Master Table" },
  ];

  return (
    <div className="relative min-h-screen">
      {isComingSoon && <ComingSoonOverlay league="EPL" />}

      <div className={isComingSoon ? "pointer-events-none blur-sm" : ""}>
        <div className="mx-auto max-w-6xl px-4 py-8 text-white">

      <header className="mb-8 md:mb-10 animate-premium-section">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          EPL Player Performance Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-white/70 text-sm leading-relaxed">
          League-wide momentum, player trends, stability metrics, role intelligence,
          predictive insights and full-season ledgers — all in one EPL dashboard.
        </p>
      </header>

      <div id="selector-bar" className="h-1 w-full"></div>

      <div className={`sticky top-16 z-40 transition-all duration-300 mb-10 ${isStuck ? "scale-[1.012]" : ""}`}>
        <div
          className={`
            rounded-2xl border backdrop-blur-xl bg-gradient-to-r
            from-yellow-500/10 via-black/80 to-yellow-500/10
            px-4 py-3 md:px-6 md:py-4
            shadow-[0_18px_70px_rgba(0,0,0,0.85)]
            ${isStuck ? "border-yellow-400/60 shadow-[0_0_40px_rgba(250,204,21,0.55)]" : "border-white/10"}
          `}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-200/80">
                Sections
              </div>
              <p className="text-[11px] text-neutral-300/90">
                Navigate trends, analytics, insights & the full-season ledger.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              {sections.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={`
                    inline-flex items-center rounded-full border px-3.5 py-1.5
                    text-xs font-medium tracking-wide transition-all
                    ${
                      activeSection === id
                        ? "border-yellow-300 bg-yellow-400 text-black shadow-[0_0_26px_rgba(250,204,21,0.9)]"
                        : "border-white/16 bg-black/40 text-neutral-200 hover:border-yellow-400/70 hover:bg-yellow-500/10 hover:text-white"
                    }
                  `}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-20 md:space-y-24">
        <section id="round-momentum" className="scroll-mt-28 animate-premium-section">
          <RoundSummary statConfig={EPL_STAT_CONFIG} />
        </section>

        <section id="form-stability" className="scroll-mt-28 animate-premium-section delay-1">
          <FormStabilityGrid statConfig={EPL_STAT_CONFIG} />
        </section>

        <section id="position-trends" className="scroll-mt-28 animate-premium-section delay-2">
          <PositionTrends statConfig={EPL_STAT_CONFIG} />
        </section>

        <section id="ai-insights" className="scroll-mt-28 animate-premium-section delay-3">
          <AIInsights statConfig={EPL_STAT_CONFIG} />
        </section>

        <section id="master-table" className="scroll-mt-28 animate-premium-section delay-4">
          <MasterTable statConfig={EPL_STAT_CONFIG} />
        </section>
      </div>

      {showTopButton && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="
            fixed bottom-6 right-6 z-50 rounded-full
            bg-yellow-400 px-4 py-2 text-sm font-semibold text-black
            shadow-[0_0_30px_rgba(250,204,21,0.8)]
            hover:bg-yellow-300 transition-all
          "
        >
          Back to Top
        </button>
      )}
        </div>
      </div>
    </div>
  );
}
