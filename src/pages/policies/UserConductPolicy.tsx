import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "9 May 2026";

const TOC = [
  { id: "s1", label: "Acceptable Use" },
  { id: "s2", label: "Account Misuse" },
  { id: "s3", label: "Scraping & Automated Access" },
  { id: "s4", label: "Content Standards" },
  { id: "s5", label: "Enforcement" },
  { id: "s6", label: "Reporting Violations" },
  { id: "s7", label: "Policy Updates" },
];

function Section({ id, num, title, children }: { id: string; num: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/20 mb-2">{num}</p>
      <h2 className="text-base font-bold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-white/45 leading-relaxed space-y-3">{children}</div>;
}

function BulletList({ items }: { items: (string | React.ReactNode)[] }) {
  return (
    <ul className="space-y-2 text-sm text-white/40 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-white/20 mt-0.5 shrink-0">—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function UserConductPolicy() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>User Conduct Policy | Neeko Sports Stats</title>
        <meta name="description" content="User conduct policy for Neeko Sports Stats. Covers acceptable use, account misuse, scraping, content standards and enforcement." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-3xl mx-auto px-4 py-16">

          <button
            onClick={() => navigate("/policies")}
            className="flex items-center gap-2 text-white/30 hover:text-white/60 text-sm mb-10 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Policies
          </button>

          <div className="mb-10">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/25 mb-4">Legal</p>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">User Conduct Policy</h1>
            <p className="text-white/35 text-sm">Last updated: {LAST_UPDATED}</p>
          </div>

          {/* TOC */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-5 mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/25 mb-3">Contents</p>
            <ol className="space-y-1.5">
              {TOC.map(({ id, label }) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-sm text-white/40 hover:text-white/70 transition-colors">{label}</a>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">

            <Section id="s1" num="1" title="Acceptable Use">
              <Prose>
                <p>
                  Neeko Sports Stats is an AFL stats and fantasy intelligence platform provided for personal, non-commercial use. By accessing the platform you agree to use it only for its intended purpose.
                </p>
                <p>Permitted use includes:</p>
                <BulletList items={[
                  "Viewing player stats, rankings, projections, and analysis for personal fantasy or research purposes",
                  "Accessing Neeko+ features under a single active subscription tied to your own account",
                  "Contacting support through official channels",
                  "Brief, non-commercial references to individual insights, provided attribution to Neeko Sports Stats is included",
                ]} />
                <p>
                  Users must not republish, resell, bulk-share, scrape, or distribute premium content — whether free or paid — without written permission.
                </p>
              </Prose>
            </Section>

            <Section id="s2" num="2" title="Account Misuse">
              <Prose>
                <p>The following will result in account suspension or permanent termination:</p>
                <BulletList items={[
                  "Sharing login credentials to give non-subscribers access to Neeko+ content",
                  "Creating multiple accounts to circumvent free-tier limits or bans",
                  "Providing false information during account registration or billing",
                  "Using stolen or unauthorised payment methods",
                  "Filing fraudulent chargebacks without first contacting support",
                  "Impersonating another user, staff member, or organisation",
                ]} />
                <p className="text-white/30 mt-2">
                  Accounts terminated for misuse forfeit all subscription benefits. Refunds in such cases are subject to the Refund Policy and applicable law.
                </p>
              </Prose>
            </Section>

            <Section id="s3" num="3" title="Scraping & Automated Access">
              <Prose>
                <p>
                  All platform content — including rankings, projections, AI analysis, stat data, and player and team pages — is proprietary. Automated or bulk extraction is strictly prohibited.
                </p>
                <p>Prohibited activities include:</p>
                <BulletList items={[
                  "Using bots, crawlers, scrapers, or automated scripts to access or extract platform data",
                  "Bulk-downloading or systematically copying rankings, projections, or AI outputs",
                  "Republishing Neeko Sports Stats content on third-party sites, social channels, or paid services",
                  "Reverse-engineering or attempting to replicate the platform's scoring or projection models",
                  "Making excessive automated requests that degrade platform performance for other users",
                  "Using premium data for commercial purposes without written permission",
                ]} />
                <p className="text-white/30 mt-2">
                  Detection of automated access will result in immediate IP and account blocking. Legal action may follow for material data theft.
                </p>
              </Prose>
            </Section>

            <Section id="s4" num="4" title="Content Standards">
              <Prose>
                <p>When interacting with the platform or its community channels, the following are prohibited:</p>
                <BulletList items={[
                  "Harassment, threats, or abuse directed at other users or staff",
                  "Discriminatory, hateful, or offensive content of any kind",
                  "Spam, unsolicited promotions, or advertising of external services",
                  "Deliberately spreading false or misleading information about players or the platform",
                ]} />
              </Prose>
            </Section>

            <Section id="s5" num="5" title="Enforcement">
              <Prose>
                <p>Violations are handled progressively based on severity:</p>
                <BulletList items={[
                  <><strong className="text-white/60">Warning</strong> — minor first-time violations</>,
                  <><strong className="text-white/60">Temporary suspension</strong> — repeated or moderate violations (7–30 days)</>,
                  <><strong className="text-white/60">Permanent ban</strong> — fraud, scraping, credential sharing, chargeback abuse</>,
                  <><strong className="text-white/60">Legal referral</strong> — data theft or other criminal conduct</>,
                ]} />
                <p className="text-white/30 mt-2">
                  To appeal a suspension, contact admin@neekostats.com.au within 14 days. Appeals are reviewed within 5–7 business days.
                </p>
              </Prose>
            </Section>

            <Section id="s6" num="6" title="Reporting Violations">
              <Prose>
                <p>
                  Report conduct violations, scraping activity, or content misuse to{" "}
                  <a href="mailto:admin@neekostats.com.au" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    admin@neekostats.com.au
                  </a>.
                  Include a description of the issue, relevant dates, and any supporting evidence. All reports are treated confidentially.
                </p>
              </Prose>
            </Section>

            <Section id="s7" num="7" title="Policy Updates">
              <Prose>
                <p>This policy may be updated at any time. Continued use of the platform constitutes acceptance of the current version.</p>
              </Prose>
            </Section>

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
    </>
  );
}
