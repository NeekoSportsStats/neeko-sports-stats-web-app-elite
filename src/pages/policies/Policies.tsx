import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Shield, Users, DollarSign, Lock, ArrowLeft, ChevronRight } from "lucide-react";

const POLICIES = [
  {
    title: "Terms & Conditions",
    description: "Platform usage rules, prohibited activities, and legal agreements.",
    updated: "9 May 2026",
    icon: FileText,
    url: "/terms-conditions",
  },
  {
    title: "Privacy Policy",
    description: "What data we collect, how it is used, and your rights.",
    updated: "9 May 2026",
    icon: Shield,
    url: "/privacy-policy",
  },
  {
    title: "User Conduct Policy",
    description: "Acceptable use, credential sharing, scraping prevention and enforcement.",
    updated: "9 May 2026",
    icon: Users,
    url: "/user-conduct-policy",
  },
  {
    title: "Refund Policy",
    description: "Season Pass and Weekly plan refund terms and how to request a refund.",
    updated: "9 May 2026",
    icon: DollarSign,
    url: "/refund-policy",
  },
  {
    title: "Data Handling & Security",
    description: "Security practices, data retention, payment handling and breach response.",
    updated: "9 May 2026",
    icon: Lock,
    url: "/security-policy",
  },
];

export default function Policies() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Policies | Neeko Sports Stats</title>
        <meta name="description" content="Review the terms, privacy, billing, user conduct and data handling policies that apply when using Neeko Sports Stats." />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-3xl mx-auto px-4 py-16">

          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-white/55 hover:text-white/80 text-sm mb-10 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Home
          </button>

          <div className="mb-10">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/25 mb-4">Legal</p>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">Policies</h1>
            <p className="text-white/60 text-sm leading-relaxed max-w-lg">
              Review the terms, privacy, billing, user conduct and data handling policies that apply when using Neeko Sports Stats.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden divide-y divide-white/[0.06]">
            {POLICIES.map(({ title, description, updated, icon: Icon, url }) => (
              <Link
                key={url}
                to={url}
                className="flex items-center gap-4 px-6 py-5 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center group-hover:bg-white/[0.09] transition-colors">
                  <Icon size={16} className="text-white/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">{title}</p>
                  <p className="text-xs text-white/50 mt-0.5 truncate">{description}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-white/38 hidden sm:block">Updated {updated}</span>
                  <ChevronRight size={14} className="text-white/35 group-hover:text-white/55 transition-colors" />
                </div>
              </Link>
            ))}
          </div>

          <p className="text-center text-xs text-white/38 mt-10">
            Questions?{" "}
            <a href="mailto:admin@neekostats.com.au" className="text-white/55 hover:text-white/80 underline underline-offset-2 transition-colors break-all">
              admin@neekostats.com.au
            </a>
          </p>

        </div>
      </div>
    </>
  );
}
