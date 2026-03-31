import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const SECTIONS = [
  {
    id: "1",
    title: "Acceptable Use",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-4">
          Neeko Sports Stats is an AFL Fantasy analytics platform provided for personal, non-commercial use. By accessing the platform you agree to use it only for its intended purpose.
        </p>
        <p className="text-white/40 text-sm leading-relaxed mb-3">Permitted use includes:</p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Viewing player rankings, projections, and AI analysis for personal fantasy decisions</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Accessing Neeko+ features under a single active subscription</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Sharing individual insights informally, with attribution</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Contacting support through official channels</li>
        </ul>
      </>
    ),
  },
  {
    id: "2",
    title: "Account Misuse",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-3">
          The following account behaviours will result in suspension or permanent termination:
        </p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Sharing login credentials to give non-subscribers access to Neeko+ content</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Creating multiple accounts to circumvent free-tier limits or bans</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Providing false information during account registration or billing</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Using stolen or unauthorised payment methods</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Filing fraudulent chargebacks without first contacting support</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Impersonating another user, staff member, or organisation</li>
        </ul>
        <p className="text-white/30 text-sm mt-4">
          Accounts terminated for misuse forfeit all subscription benefits without refund.
        </p>
      </>
    ),
  },
  {
    id: "3",
    title: "Scraping & Automated Access",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-3">
          All platform content — including rankings, projections, AI analysis, and player data — is proprietary. Automated or bulk extraction of this data is strictly prohibited.
        </p>
        <p className="text-white/40 text-sm leading-relaxed mb-3">Prohibited activities include:</p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Using bots, crawlers, scrapers, or automated scripts to access or extract platform data</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Bulk-downloading or systematically copying rankings, projections, or AI outputs</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Republishing Neeko+ content on third-party sites, social channels, or paid services</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Reverse-engineering or attempting to replicate the platform's scoring or projection models</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Making excessive requests that degrade platform performance for other users</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Using premium data for commercial purposes without written permission</li>
        </ul>
        <p className="text-white/30 text-sm mt-4">
          Detection of automated access will result in immediate IP and account blocking. Legal action may follow for material data theft.
        </p>
      </>
    ),
  },
  {
    id: "4",
    title: "Content Standards",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-3">
          When interacting with the platform or its community channels, the following are prohibited:
        </p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Harassment, threats, or abuse directed at other users or staff</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Discriminatory, hateful, or offensive content of any kind</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Spam, unsolicited promotions, or advertising of external services</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Deliberately spreading false or misleading information about players or the platform</li>
        </ul>
      </>
    ),
  },
  {
    id: "5",
    title: "Enforcement",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-3">
          Violations of this policy are handled progressively based on severity:
        </p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span><span><strong className="text-white/60">Warning</strong> — minor first-time violations</span></li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span><span><strong className="text-white/60">Temporary suspension</strong> — repeated or moderate violations (7–30 days)</span></li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span><span><strong className="text-white/60">Permanent ban</strong> — fraud, scraping, credential sharing, chargeback abuse</span></li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span><span><strong className="text-white/60">Legal referral</strong> — data theft or other criminal conduct</span></li>
        </ul>
        <p className="text-white/30 text-sm mt-4">
          To appeal a suspension, contact admin@neekostats.com.au within 14 days. Appeals are reviewed within 5–7 business days and our decision is final.
        </p>
      </>
    ),
  },
  {
    id: "6",
    title: "Reporting Violations",
    content: (
      <p className="text-white/40 text-sm leading-relaxed">
        Report conduct violations, scraping activity, or content misuse to{" "}
        <a href="mailto:admin@neekostats.com.au" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
          admin@neekostats.com.au
        </a>
        . Include a description of the issue, relevant dates, and any supporting evidence. All reports are treated confidentially.
      </p>
    ),
  },
  {
    id: "7",
    title: "Policy Updates",
    content: (
      <p className="text-white/40 text-sm leading-relaxed">
        This policy may be updated at any time. Continued use of the platform constitutes acceptance of the current version.
      </p>
    ),
  },
];

export default function UserConductPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">

        <button
          onClick={() => navigate("/policies")}
          className="flex items-center gap-2 text-white/30 hover:text-white/60 text-sm mb-10 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Policies
        </button>

        <div className="mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/25 mb-4">Legal</p>
          <h1 className="text-4xl font-extrabold mb-3">User Conduct Policy</h1>
          <p className="text-white/40 text-sm">Last updated: 3 March 2026</p>
        </div>

        <div className="space-y-3">
          {SECTIONS.map(({ id, title, content }) => (
            <div
              key={id}
              className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-5"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/20 mb-3">{id}</p>
              <h2 className="text-base font-bold text-white mb-4">{title}</h2>
              {content}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-6">
          <p className="text-sm font-semibold text-white mb-1">Questions about this policy?</p>
          <p className="text-sm text-white/35">
            Contact{" "}
            <a href="mailto:admin@neekostats.com.au" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
              admin@neekostats.com.au
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
