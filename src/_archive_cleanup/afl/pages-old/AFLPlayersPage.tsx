import React, { useEffect, useState } from "react";

import RoundSummary from "@/features/afl/players/sections/RoundSummary";
import FormStabilityGrid from "@/features/afl/players/sections/FormStabilityGrid";
import PlayerImpactMap from "@/features/afl/players/sections/PlayerImpactMap";
import MasterGrid from "@/features/afl/players/sections/MasterGrid";

export default function AFLPlayersPage() {
  const [activeSection, setActiveSection] = useState("round-momentum");
  const [isStuck, setIsStuck] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);

  /* -------------------------------------------------------------------------- */
  /* Scroll Spy Section Tracking                                               */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const ids = ["round-momentum", "form-stability", "player-impact", "master-grid"];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { threshold: 0.15, rootMargin: "-10% 0px -55% 0px" }
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  /* -------------------------------------------------------------------------- */
  /* Sticky Nav Trigger                                                        */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const anchor = document.getElementById("selector-bar");
    if (!anchor) return;

    const io = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), { threshold: 1 });
    io.observe(anchor);
    return () => io.disconnect();
  }, []);

  /* -------------------------------------------------------------------------- */
  /* Back To Top Button Trigger                                                */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const onScroll = () => setShowTopButton(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sections = [
    { id: "round-momentum", label: "Round Momentum" },
    { id: "form-stability", label: "Form Stability" },
    { id: "player-impact", label: "Player Impact Map" },
    { id: "master-grid", label: "Master Grid" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-white">
      <header className="mb-8 md:mb-10 animate-premium-section">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          AFL Player Performance Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-white/70 text-sm">
          League-wide momentum, player trends, predictive insights and full-season ledgers.
        </p>
      </header>

      <div id="selector-bar" className="h-1 w-full"></div>

      <div className={`sticky top-16 z-40 mb-10 ${isStuck ? "scale-[1.012]" : ""}`}>
        <div className="rounded-2xl border border-yellow-400/60 bg-black/80 backdrop-blur-xl px-4 py-3 shadow-[0_0_40px_rgba(250,204,21,0.45)]">
          <div className="flex flex-wrap gap-2">
            {sections.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`
                  px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all
                  ${
                    activeSection === id
                      ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_26px_rgba(250,204,21,0.9)]"
                      : "bg-black/40 border-white/20 text-white/70 hover:border-yellow-400/60"
                  }
                `}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-20 md:space-y-24">
        <section id="round-momentum" className="scroll-mt-28">
          <RoundSummary />
        </section>

        <section id="form-stability" className="scroll-mt-28">
          <FormStabilityGrid />
        </section>

        <section id="player-impact" className="scroll-mt-28">
          <PlayerImpactMap />
        </section>

        <section id="master-grid" className="scroll-mt-28">
          <MasterGrid />
        </section>
      </div>

      {showTopButton && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 bg-yellow-400 px-4 py-2 rounded-full text-black shadow-[0_0_30px_rgba(250,204,21,0.8)]"
        >
          Back to Top
        </button>
      )}
    </div>
  );
}