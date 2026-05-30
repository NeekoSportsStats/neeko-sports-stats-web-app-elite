/**
 * Social Post Planner — admin-only.
 *
 * Part 3: Strict posts only show players at their exact qualifying tier.
 * Part 4: Monday Post 1 = proof/recap (prior round results), Post 2 = 20+ preview.
 *         They are structurally distinct — never near-duplicates.
 * Part 12: Carousel slides are always rendered via slide.headline / slide.body /
 *          slide.visualNote — never rendered as raw {slide} objects.
 */
import React, { useState } from "react";
import type { SocialPost, CarouselSlide } from "./types";
import type { GamePickMarketingPack } from "./gamePickPostKit";
import type { CIDataSubset } from "./types";

// ─── Tab types ────────────────────────────────────────────────────────────────

type PlannerTab = "game-picks" | "weekly" | "carousel-preview";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SocialPostPlannerProps {
  ciData: CIDataSubset;
  packs: GamePickMarketingPack[];
}

// ─── Carousel slide renderer (Part 12) ───────────────────────────────────────

/**
 * Renders a CarouselSlide as structured JSX.
 * NEVER pass the slide object directly as a React child.
 */
function CarouselSlideCard({ slide }: { slide: CarouselSlide }) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-zinc-500 font-mono">Slide {slide.slideNumber}</span>
      </div>
      <p className="text-sm font-semibold text-zinc-100">{slide.headline}</p>
      <p className="text-sm text-zinc-300">{slide.body}</p>
      {slide.visualNote && (
        <p className="text-xs text-zinc-500 italic">{slide.visualNote}</p>
      )}
    </div>
  );
}

// ─── Post status badge ────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const cls =
    level === "High" ? "bg-emerald-900 text-emerald-300" :
    level === "Medium" ? "bg-yellow-900 text-yellow-300" :
    "bg-zinc-700 text-zinc-400";
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {level}
    </span>
  );
}

function MixedBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-blue-900 text-blue-300 font-medium">
      Mixed
    </span>
  );
}

function FallbackBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-orange-900 text-orange-300 font-medium">
      Fallback
    </span>
  );
}

// ─── Post detail panel ────────────────────────────────────────────────────────

function PostDetailPanel({ post }: { post: SocialPost }) {
  const [tab, setTab] = useState<"overview" | "carousel" | "captions" | "voiceover" | "compliance">("overview");

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-700 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <ConfidenceBadge level={post.confidence} />
            {post.isMixedDisposalWatch && <MixedBadge />}
            {post.isBackup && <FallbackBadge />}
            <span className="text-xs text-zinc-500">{post.category}</span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 truncate">{post.title}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{post.postTime}</p>
        </div>
        <div className="text-right shrink-0">
          {post.quality && (
            <div className={`text-xs font-medium ${
              post.quality.score >= 75 ? "text-emerald-400" :
              post.quality.score >= 55 ? "text-yellow-400" :
              post.quality.score >= 35 ? "text-orange-400" : "text-zinc-500"
            }`}>
              {post.quality.label} ({post.quality.score})
            </div>
          )}
          {post.timing?.urgency && post.timing.urgency !== "None" && (
            <div className={`text-xs mt-0.5 ${
              post.timing.urgency === "High" ? "text-red-400" :
              post.timing.urgency === "Medium" ? "text-yellow-400" :
              post.timing.urgency === "Stale" ? "text-zinc-500" :
              "text-zinc-400"
            }`}>
              {post.timing.countdownText ?? post.timing.urgency}
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-zinc-700 overflow-x-auto">
        {(["overview", "carousel", "captions", "voiceover", "compliance"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t
                ? "text-zinc-100 border-b-2 border-blue-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "carousel" && post.carouselSlides?.length
              ? ` (${post.carouselSlides.length})`
              : ""}
            {t === "compliance" && post.compliance?.flags?.length
              ? ` ⚠ ${post.compliance.flags.length}`
              : ""}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {tab === "overview" && (
          <OverviewTab post={post} />
        )}
        {tab === "carousel" && (
          <CarouselTab post={post} />
        )}
        {tab === "captions" && (
          <CaptionsTab post={post} />
        )}
        {tab === "voiceover" && (
          <VoiceoverTab post={post} />
        )}
        {tab === "compliance" && (
          <ComplianceTab post={post} />
        )}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ post }: { post: SocialPost }) {
  return (
    <div className="space-y-4">
      <Section label="Caption">
        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-800 rounded p-3">
          {post.caption}
        </pre>
      </Section>

      {post.statsShown?.length > 0 && (
        <Section label={`Stats shown (${post.statsShown.length} players)`}>
          <ul className="space-y-1">
            {post.statsShown.map((s, i) => (
              <li key={i} className="text-xs text-zinc-300 font-mono">{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {post.isMixedDisposalWatch && post.playerThresholds && (
        <Section label="Per-player thresholds">
          <div className="flex flex-wrap gap-2">
            {Object.entries(post.playerThresholds).map(([name, thr]) => (
              <span key={name} className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300">
                {name} → {thr}+
              </span>
            ))}
          </div>
        </Section>
      )}

      {post.imageDescription && (
        <Section label="Image description">
          <p className="text-xs text-zinc-400">{post.imageDescription}</p>
        </Section>
      )}

      {post.suggestedVisual && (
        <Section label="Visual note">
          <p className="text-xs text-zinc-400">{post.suggestedVisual}</p>
        </Section>
      )}

      {post.fallbackWarning && (
        <div className="text-xs text-orange-400 bg-orange-900/30 border border-orange-800 rounded p-3">
          {post.fallbackWarning}
        </div>
      )}

      {post.hookOptions?.length > 0 && (
        <Section label="Hook options">
          <ol className="space-y-1 list-decimal list-inside">
            {post.hookOptions.map((h, i) => (
              <li key={i} className="text-xs text-zinc-400">{h}</li>
            ))}
          </ol>
        </Section>
      )}

      {post.timing && (
        <Section label="Timing">
          <p className="text-xs text-zinc-300">{post.timing.recommendedWindowText}</p>
          <p className="text-xs text-zinc-500">{post.timing.recommendedTimingReason}</p>
        </Section>
      )}
    </div>
  );
}

// ─── Carousel tab (Part 12) ───────────────────────────────────────────────────

function CarouselTab({ post }: { post: SocialPost }) {
  return (
    <div className="space-y-4">
      {post.carouselSlides?.length ? (
        <>
          <p className="text-xs text-zinc-500">
            {post.carouselSlides.length}-slide carousel
            {post.isMixedDisposalWatch ? " — Mixed Disposal Watch (per-player thresholds)" : ""}
          </p>
          <div className="space-y-3">
            {/* Part 12: render each slide via its fields — never render {slide} directly */}
            {post.carouselSlides.map(slide => (
              <CarouselSlideCard key={slide.slideNumber} slide={slide} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-zinc-500">No carousel slides generated.</p>
      )}

      {post.aiCarouselPromptPack && (
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-400 mb-2">
            AI Prompt Pack — {post.aiCarouselPromptPack.format}
          </p>
          <div className="space-y-3">
            <PromptBlock label="Cover prompt" text={post.aiCarouselPromptPack.coverPrompt} />
            {post.aiCarouselPromptPack.slidePrompts.map((sp, i) => (
              <PromptBlock key={i} label={`Player slide ${i + 1}`} text={sp} />
            ))}
            <PromptBlock label="CTA slide" text={post.aiCarouselPromptPack.endPrompt} />
            <details className="group">
              <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                Combined prompt
              </summary>
              <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-800 rounded p-3 mt-2">
                {post.aiCarouselPromptPack.combinedPrompt}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <div className="text-xs text-zinc-300 bg-zinc-800 rounded p-3">{text}</div>
    </div>
  );
}

// ─── Captions tab ─────────────────────────────────────────────────────────────

function CaptionsTab({ post }: { post: SocialPost }) {
  return (
    <div className="space-y-4">
      {post.platformCaptions && (
        <>
          <CaptionBlock label="TikTok" text={post.platformCaptions.tiktok} />
          <CaptionBlock label="Instagram" text={post.platformCaptions.instagram} />
          <CaptionBlock label="Facebook" text={post.platformCaptions.facebook} />
        </>
      )}
      {post.ctaLine && (
        <Section label="CTA line">
          <p className="text-xs text-zinc-300">{post.ctaLine}</p>
        </Section>
      )}
      {post.hashtags?.length > 0 && (
        <Section label="Hashtags">
          <p className="text-xs text-zinc-400">{post.hashtags.join(" ")}</p>
        </Section>
      )}
      {post.thumbnailOptions?.length > 0 && (
        <Section label="Thumbnail options">
          <ol className="space-y-1 list-decimal list-inside">
            {post.thumbnailOptions.map((t, i) => (
              <li key={i} className="text-xs text-zinc-400">{t}</li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

function CaptionBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 mb-1">{label}</p>
      <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-800 rounded p-3">
        {text}
      </pre>
    </div>
  );
}

// ─── Voiceover tab ────────────────────────────────────────────────────────────

function VoiceoverTab({ post }: { post: SocialPost }) {
  return (
    <div className="space-y-4">
      {post.voiceoverScript ? (
        <Section label="Voiceover script">
          <p className="text-sm text-zinc-200 leading-relaxed">{post.voiceoverScript}</p>
        </Section>
      ) : (
        <p className="text-xs text-zinc-500">No voiceover script generated.</p>
      )}
      {post.isMixedDisposalWatch && (
        <div className="text-xs text-blue-400 bg-blue-900/20 border border-blue-800 rounded p-3">
          Mixed post — voiceover uses "disposal trends" not "20+ disposals".
        </div>
      )}
    </div>
  );
}

// ─── Compliance tab ───────────────────────────────────────────────────────────

function ComplianceTab({ post }: { post: SocialPost }) {
  const c = post.compliance;
  if (!c) return <p className="text-xs text-zinc-500">No compliance data.</p>;

  return (
    <div className="space-y-3">
      <div className={`text-sm font-medium ${
        c.status === "Clean" ? "text-emerald-400" :
        c.status === "Needs review" ? "text-yellow-400" :
        "text-red-400"
      }`}>
        {c.status}
      </div>
      {c.flags.length > 0 ? (
        <ul className="space-y-1">
          {c.flags.map((f, i) => (
            <li key={i} className="text-xs text-orange-400">{f}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">No compliance flags.</p>
      )}
      {post.validation && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-zinc-400">Validation</p>
          {post.validation.violations.length > 0 && (
            <ul className="space-y-1">
              {post.validation.violations.map((v, i) => (
                <li key={i} className="text-xs text-red-400">{v}</li>
              ))}
            </ul>
          )}
          {post.validation.warnings.length > 0 && (
            <ul className="space-y-1">
              {post.validation.warnings.map((w, i) => (
                <li key={i} className="text-xs text-yellow-400">{w}</li>
              ))}
            </ul>
          )}
          {!post.validation.violations.length && !post.validation.warnings.length && (
            <p className="text-xs text-emerald-400">All validation checks passed.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared section wrapper ───────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

// ─── Game pick marketing pack panel ──────────────────────────────────────────

function GamePickPackPanel({ pack }: { pack: GamePickMarketingPack }) {
  const [openKitIdx, setOpenKitIdx] = useState<number | null>(null);

  return (
    <div className="border border-zinc-700 rounded-xl overflow-hidden">
      {/* Pack header */}
      <div className="px-5 py-3 bg-zinc-800 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{pack.game.match_label}</p>
          <p className="text-xs text-zinc-400">{pack.game.game_date} — {pack.game.venue}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-300">{pack.bestAngle}</p>
          {pack.game.is_free_match && (
            <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded ml-2">Free</span>
          )}
        </div>
      </div>

      {/* Kit list */}
      <div className="divide-y divide-zinc-800">
        {pack.kits.map((kit, idx) => (
          <div key={kit.kitType}>
            <button
              type="button"
              onClick={() => setOpenKitIdx(openKitIdx === idx ? null : idx)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-16 text-left">Post {kit.post.postNumber}</span>
                <span className="text-sm text-zinc-200">{kit.post.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <ConfidenceBadge level={kit.post.confidence} />
                {kit.post.isMixedDisposalWatch && <MixedBadge />}
                <span className="text-xs text-zinc-500">{kit.pickCount} player{kit.pickCount !== 1 ? "s" : ""}</span>
                <span className="text-zinc-500 text-xs">{openKitIdx === idx ? "▲" : "▼"}</span>
              </div>
            </button>

            {openKitIdx === idx && (
              <div className="px-5 pb-5">
                <PostDetailPanel post={kit.post} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Weekly posts panel (Part 3 + Part 4) ────────────────────────────────────

/**
 * Monday post structure (Part 4):
 *   Post 1 — Proof/Recap: prior round results, strict — no future picks
 *   Post 2 — 20+ Disposals preview: strict 20+ only (no 25+/30+ mixed in)
 *   Post 3 — Round Preview: combined picks across the week
 *
 * Part 3: Strict 20+ posts show ONLY players at exactly the 20+ tier.
 * Players at 25+/30+ must NOT appear in a strict "20+ Disposals" weekly post.
 */
function WeeklyPostsPanel({ ciData, packs }: { ciData: CIDataSubset; packs: GamePickMarketingPack[] }) {
  // Collect all strict 20+ players across all games for Monday Post 2
  const all20Plus = packs.flatMap(pack =>
    pack.kits
      .filter(k => k.kitType === "disposals")
      .flatMap(k => k.post.statsShown
        .map((line, i) => ({
          line,
          name: k.post.playerNames[i],
          tier: (k.post.playerThresholds ?? {})[k.post.playerNames[i]] ?? 20,
        }))
        .filter(p => p.tier === 20) // Part 3: strict — exclude 25+ and 30+
      )
  );

  // Deduplicate by name
  const seen = new Set<string>();
  const strict20Players = all20Plus.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Monday Post 1 — Proof/Recap (Part 4) */}
      <div className="border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-zinc-800 border-b border-zinc-700">
          <p className="text-sm font-semibold text-zinc-100">Monday Post 1 — Round Proof/Recap</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Prior round results: which calls landed, which missed. NOT a disposal preview.
          </p>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-xs text-zinc-400">
            This post shows <strong className="text-zinc-200">results from the completed round</strong> —
            players who hit or missed their disposal targets. Separate from any upcoming-game previews.
          </p>
          <div className="text-xs text-zinc-500 bg-zinc-800 rounded p-3">
            Template: "[Player] hit [X] disposals — [threshold] met. [Player2] missed [threshold] with [Y]."
            <br />
            Focus: proof of data accuracy. No picks, no previews.
          </div>
        </div>
      </div>

      {/* Monday Post 2 — Strict 20+ Disposal Preview (Part 3 + Part 4) */}
      <div className="border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-zinc-800 border-b border-zinc-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Monday Post 2 — 20+ Disposal Preview</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Strict 20+ only — players at exactly the 20-disposal tier.
              </p>
            </div>
            <span className="text-xs text-zinc-500">{strict20Players.length} candidates</span>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          {strict20Players.length === 0 ? (
            <p className="text-xs text-zinc-500">No strict 20+ tier candidates for this round.</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500">
                Part 3: These players qualify at exactly 20+ threshold.
                Players at 25+ or 30+ are excluded from this post.
              </p>
              <ul className="space-y-1">
                {strict20Players.slice(0, 8).map((p, i) => (
                  <li key={i} className="text-xs text-zinc-300 font-mono">{p.line}</li>
                ))}
              </ul>
              {strict20Players.length > 8 && (
                <p className="text-xs text-zinc-500">+{strict20Players.length - 8} more candidates</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Round Preview Post (Post 3) */}
      <div className="border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-zinc-800 border-b border-zinc-700">
          <p className="text-sm font-semibold text-zinc-100">Round Preview — All Games</p>
          <p className="text-xs text-zinc-400 mt-0.5">Combined top picks across all games this round.</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-zinc-500">{packs.length} games in round {ciData.currentRound}</p>
          <div className="mt-3 space-y-2">
            {packs.map(pack => (
              <div key={pack.game.match_id} className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">{pack.game.match_label}</span>
                <span className="text-zinc-500">{pack.bestAngle}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Carousel preview tab ─────────────────────────────────────────────────────

function CarouselPreviewTab({ packs }: { packs: GamePickMarketingPack[] }) {
  const allPosts = packs.flatMap(p => p.kits.map(k => k.post));

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        {allPosts.length} posts — carousel slides rendered via structured objects (Part 12).
      </p>
      {allPosts.map(post => (
        <div key={post.id} className="border border-zinc-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-zinc-800 flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-200">{post.title}</p>
            <span className="text-xs text-zinc-500">
              {post.carouselSlides?.length ?? 0} slides
            </span>
          </div>
          {post.carouselSlides?.length ? (
            <div className="p-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {/* Part 12: always render structured fields — never {slide} */}
              {post.carouselSlides.map(slide => (
                <CarouselSlideCard key={slide.slideNumber} slide={slide} />
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-zinc-500">No slides.</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SocialPostPlanner({ ciData, packs }: SocialPostPlannerProps) {
  const [activeTab, setActiveTab] = useState<PlannerTab>("game-picks");

  const tabs: { id: PlannerTab; label: string }[] = [
    { id: "game-picks", label: `Game Picks (${packs.length})` },
    { id: "weekly", label: "Weekly Structure" },
    { id: "carousel-preview", label: "Carousel Preview" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100">Social Post Planner</h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            Round {ciData.currentRound} — {ciData.roundLabel}
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          {ciData.matches.length} games · {ciData.disposalPlayers.length} disposal players
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "text-zinc-100 border-b-2 border-blue-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "game-picks" && (
        <div className="space-y-6">
          {packs.length === 0 ? (
            <p className="text-zinc-500 text-sm">No game pick packs generated.</p>
          ) : (
            packs.map(pack => (
              <GamePickPackPanel key={pack.game.match_id} pack={pack} />
            ))
          )}
        </div>
      )}

      {activeTab === "weekly" && (
        <WeeklyPostsPanel ciData={ciData} packs={packs} />
      )}

      {activeTab === "carousel-preview" && (
        <CarouselPreviewTab packs={packs} />
      )}
    </div>
  );
}
