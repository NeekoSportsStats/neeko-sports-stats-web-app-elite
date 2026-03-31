// src/pages/sports/epl/EPLTeams.tsx
// EPL Teams Page — updated with premium glass section pills

import React, { useEffect, useState } from "react";

import TeamMomentumPulse from "@/components/epl/teams/TeamMomentumPulse";
import TeamDashboardTiles from "@/components/epl/teams/TeamDashboardTiles";
import TeamFormGrid from "@/components/epl/teams/TeamFormGrid";
import TeamTrends from "@/components/epl/teams/TeamTrends";
import TeamAIInsights from "@/components/epl/teams/TeamAIInsights";
import TeamMasterTable from "@/components/epl/teams/TeamMasterTable";
import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";
import { LEAGUE_AVAILABILITY } from "@/config/leagueAvailability";
import ComingSoonOverlay from "@/components/ComingSoonOverlay";

export default function EPLTeams() {
  const isComingSoon = LEAGUE_AVAILABILITY.epl === "coming-soon";
  const [activeSection, setActiveSection] = useState("momentum");
  const [isStuck, setIsStuck] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);

  /* -------------------------------------------------------------------------- */
  /*                         Scroll Spy Tracking                                */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const ids = [
      "momentum",
      "dashboard",
      "form-grid",
      "trends",
      "ai",
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
      },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                           Smooth Scroll for Pills                          */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const links = document.querySelectorAll("a[href^='#']");

    const handler = (e: Event) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute("href");
      if (!href) return;

      const el = document.querySelector(href);
      if (!el) return;

      const offset = el.getBoundingClientRect().top + window.scrollY - 110;

      window.scrollTo({ top: offset, behavior: "smooth" });
    };

    links.forEach((l) => l.addEventListener("click", handler));

    return () => links.forEach((l) => l.removeEventListener("click", handler));
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                                 Sticky Trigger                              */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const anchor = document.getElementById("selector-bar");
    if (!anchor) return;

    const io = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 1 },
    );

    io.observe(anchor);
    return () => io.disconnect();
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                        Back To Top Button Visibility                        */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const onScroll = () => setShowTopButton(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                            Section Pills Definition                        */
  /* -------------------------------------------------------------------------- */

  const sections = [
    { id: "momentum", label: "Matchweek Momentum" },
    { id: "dashboard", label: "Dashboard" },
    { id: "form-grid", label: "Form Grid" },
    { id: "trends", label: "Team Trends" },
    { id: "ai", label: "AI Insights" },
    { id: "master-table", label: "Master Table" },
  ];

  /* -------------------------------------------------------------------------- */
  /*                                 RENDER                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="relative min-h-screen">
      {isComingSoon && <ComingSoonOverlay league="EPL" />}

      <div className={isComingSoon ? "pointer-events-none blur-sm" : ""}>
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-6">

      {/* -------------------------------- PAGE HEADER ----------------------------- */}
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-neutral-100 md:text-4xl">
          EPL Team Analytics
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          League-wide team trends, momentum pulses, attack/defence shifts and
          full season scoring tables.
        </p>
      </header>

      <div id="selector-bar" className="h-1 w-full"></div>

      {/* -------------------------- Premium Glass Section Pills -------------------------- */}
      <div
        className={`sticky top-16 z-40 transition-all duration-300 mb-10 ${
          isStuck ? "scale-[1.012]" : ""
        }`}
      >
        <div
          className={`
            rounded-2xl border backdrop-blur-xl bg-gradient-to-r
            from-yellow-500/10 via-black/80 to-yellow-500/10
            px-4 py-3 md:px-6 md:py-4
            shadow-[0_18px_70px_rgba(0,0,0,0.85)]
            ${
              isStuck
                ? "border-yellow-400/60 shadow-[0_0_40px_rgba(250,204,21,0.55)]"
                : "border-white/10"
            }
          `}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-yellow-200/80">
                Sections
              </div>
              <p className="text-[11px] text-neutral-300/90">
                Navigate team momentum, analytics, insights & full-season tables.
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

      {/* -------------------------- PAGE SECTIONS -------------------------- */}

      <section id="momentum" className="mb-14 scroll-mt-28">
        <TeamMomentumPulse statConfig={EPL_STAT_CONFIG} />
      </section>

      <section id="dashboard" className="mb-14 scroll-mt-28">
        <TeamDashboardTiles statConfig={EPL_STAT_CONFIG} />
      </section>

      <section id="form-grid" className="mb-14 scroll-mt-28">
        <TeamFormGrid />
      </section>

      <section id="trends" className="mb-14 scroll-mt-28">
        <TeamTrends />
      </section>

      <section id="ai" className="mb-14 scroll-mt-28">
        <TeamAIInsights />
      </section>

      <section id="master-table" className="scroll-mt-28">
        <TeamMasterTable statConfig={EPL_STAT_CONFIG} />
      </section>

      {/* ------------------------------- BACK TO TOP ------------------------------ */}

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
