import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { lastUpdated, title, description, sections } from "@/content/privacyPolicy";

const TOC = sections.map((s, i) => ({
  id: `s${i + 1}`,
  label: s.heading,
}));

function Section({ id, num, title, children }: { id: string; num: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35 mb-2">{num}</p>
      <h2 className="text-base font-bold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-white/60 leading-relaxed space-y-3">{children}</div>;
}

function BulletList({ items }: { items: { label?: string; text: string }[] }) {
  return (
    <ul className="space-y-2 text-sm text-white/60 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-white/35 mt-0.5 shrink-0">—</span>
          <span>
            {item.label && <strong className="text-white/70">{item.label}: </strong>}
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://neekostats.com.au/privacy-policy" />
      </Helmet>
      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-3xl mx-auto px-4 py-16">

          <button
            onClick={() => navigate("/policies")}
            className="flex items-center gap-2 text-white/55 hover:text-white/80 text-sm mb-10 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Policies
          </button>

          <div className="mb-10">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/25 mb-4">Legal</p>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">Privacy Policy</h1>
            <p className="text-white/35 text-sm">Last updated: {lastUpdated}</p>
          </div>

          {/* TOC */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-5 mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/25 mb-3">Contents</p>
            <ol className="space-y-1.5">
              {TOC.map(({ id, label }) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-sm text-white/55 hover:text-white/80 transition-colors">{label}</a>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">

            {sections.map((section, i) => {
              const id = `s${i + 1}`;
              const num = String(section.num ?? i + 1);
              return (
                <Section key={id} id={id} num={num} title={section.heading}>
                  <Prose>
                    {section.paragraphs?.map((p, pi) => (
                      <p
                        key={pi}
                        className={section.boldFirstParagraph && pi === 0 ? "font-semibold text-white/70" : ""}
                      >
                        {p}
                      </p>
                    ))}
                    {section.bullets && <BulletList items={section.bullets} />}
                    {section.cards && (
                      <div className="space-y-3 mt-2">
                        {section.cards.map((card, ci) => (
                          <div key={ci} className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
                            <p className="text-sm font-bold text-white/80 mb-1">{card.title}</p>
                            <p className="text-sm text-white/55">{card.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {section.closingParagraphs?.map((p, pi) => (
                      <p key={pi}>{p}</p>
                    ))}
                  </Prose>
                </Section>
              );
            })}

          </div>
        </div>
      </div>
    </>
  );
}
