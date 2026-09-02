import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { lastUpdated, title, description, sections } from "@/content/deleteData";

export default function DeleteData() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://neekostats.com.au/delete-data" />
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
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">Delete your Neeko Stats data</h1>
            <p className="text-white/35 text-sm">Last updated: {lastUpdated}</p>
          </div>

          <div className="space-y-3">
            {sections.map((section, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-5"
              >
                <div className="text-sm text-white/60 leading-relaxed space-y-3">
                  {section.paragraphs?.map((p, pi) => (
                    <p key={pi}>{p}</p>
                  ))}
                  {section.bullets && (
                    <ul className="space-y-2 text-sm text-white/60 mt-2">
                      {section.bullets.map((item, bi) => (
                        <li key={bi} className="flex gap-2">
                          <span className="text-white/35 mt-0.5 shrink-0">—</span>
                          <span>
                            {item.label && <strong className="text-white/70">{item.label}: </strong>}
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
