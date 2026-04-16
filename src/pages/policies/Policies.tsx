import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Shield, Users, DollarSign, Lock, ArrowLeft, ChevronRight } from "lucide-react";

const POLICIES = [
  {
    title: "Terms & Conditions",
    description: "Platform usage rules, prohibited activities, and legal agreements",
    icon: FileText,
    url: "/terms-conditions",
  },
  {
    title: "Privacy Policy",
    description: "How we collect, store, and protect your personal information",
    icon: Shield,
    url: "/privacy-policy",
  },
  {
    title: "User Conduct Policy",
    description: "Acceptable use, account misuse, and scraping prevention",
    icon: Users,
    url: "/user-conduct-policy",
  },
  {
    title: "Refund Policy",
    description: "Season Pass and Weekly plan refund windows and billing terms",
    icon: DollarSign,
    url: "/refund-policy",
  },
  {
    title: "Data Handling & Security",
    description: "Security measures, data retention, and protection standards",
    icon: Lock,
    url: "/security-policy",
  },
];

export default function Policies() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Policies — Neeko Sports Stats</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
    <div className="min-h-screen bg-[#070707] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">

        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white/30 hover:text-white/60 text-sm mb-10 transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/25 mb-4">Legal</p>
          <h1 className="text-4xl font-extrabold mb-3">Policies</h1>
          <p className="text-white/40 text-base">
            Important information about using Neeko Sports Stats.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden divide-y divide-white/[0.06]">
          {POLICIES.map(({ title, description, icon: Icon, url }) => (
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
                <p className="text-xs text-white/30 mt-0.5 truncate">{description}</p>
              </div>
              <ChevronRight size={14} className="text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
            </Link>
          ))}
        </div>

        <p className="text-center text-xs text-white/20 mt-10">
          Questions?{" "}
          <a href="mailto:admin@neekostats.com.au" className="text-white/35 hover:text-white/60 underline underline-offset-2 transition-colors">
            admin@neekostats.com.au
          </a>
        </p>

      </div>
    </div>
    </>
  );
}
