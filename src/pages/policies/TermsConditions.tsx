import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "9 May 2026";

const TOC = [
  { id: "s1",  label: "Acceptance of Terms" },
  { id: "s2",  label: "No Betting, Gambling, Financial or Professional Advice" },
  { id: "s3",  label: "No Guarantee of Accuracy" },
  { id: "s4",  label: "Prohibited Use" },
  { id: "s5",  label: "API Restrictions" },
  { id: "s6",  label: "User Responsibilities" },
  { id: "s7",  label: "Neeko+ Access Terms" },
  { id: "s8",  label: "Account Suspension and Termination" },
  { id: "s9",  label: "Service Availability" },
  { id: "s10", label: "Limitation of Liability" },
  { id: "s11", label: "Australian Consumer Law" },
  { id: "s12", label: "Governing Law" },
  { id: "s13", label: "Changes to Terms" },
  { id: "s14", label: "Contact" },
];

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

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm text-white/60 mt-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="text-white/35 mt-0.5 shrink-0">—</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TermsConditions() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Terms &amp; Conditions | Neeko Sports Stats</title>
        <meta name="description" content="Terms and conditions for using Neeko Sports Stats, the AFL stats and fantasy intelligence platform." />
        <meta name="robots" content="noindex, follow" />
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
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">Terms and Conditions</h1>
            <p className="text-white/35 text-sm">Last updated: {LAST_UPDATED}</p>
          </div>

          {/* Table of contents */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-5 mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/25 mb-3">Contents</p>
            <ol className="space-y-1.5">
              {TOC.map(({ id, label }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="text-sm text-white/55 hover:text-white/80 transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">

            <Section id="s1" num="1" title="Acceptance of Terms">
              <Prose>
                <p>
                  By accessing or using Neeko Sports Stats ("the Service"), you accept and agree to be bound by these Terms and Conditions. If you do not agree, do not use the Service.
                </p>
              </Prose>
            </Section>

            <Section id="s2" num="2" title="No Betting, Gambling, Financial or Professional Advice">
              <Prose>
                <p>
                  Neeko Sports Stats does not provide betting, wagering, gambling, financial, or investment advice. The Service is intended for AFL statistics, fantasy sport analysis, and general sports information only.
                </p>
                <p>
                  All data, projections, rankings, signals, and analysis available on the platform are provided for informational and entertainment purposes only. Nothing on this platform should be interpreted as advice of any professional, financial, or legal nature.
                </p>
                <p>Users are responsible for how they interpret and use the information provided by the Service.</p>
              </Prose>
            </Section>

            <Section id="s3" num="3" title="No Guarantee of Accuracy">
              <Prose>
                <p>
                  Projections, rankings, and signals are model-generated estimates based on available data. They represent likely ranges, not certainties. AFL player performance is inherently variable and outputs will not always be correct.
                </p>
                <BulletList items={[
                  "Sports analytics involve inherent uncertainty and are subject to change",
                  "Past performance does not guarantee future results",
                  "The Service provides no warranties regarding the accuracy, completeness, or reliability of any data or output",
                ]} />
              </Prose>
            </Section>

            <Section id="s4" num="4" title="Prohibited Use">
              <Prose>
                <p>
                  You must not access, scrape, harvest, copy, or republish any content from Neeko Sports Stats using automated tools, bots, scripts, crawlers, or unofficial access methods. All prohibited activities are detailed in the User Conduct Policy.
                </p>
                <p>Prohibited activities include but are not limited to:</p>
                <BulletList items={[
                  "Using automated tools, bots, scripts, or crawlers to access or extract data",
                  "Bulk-downloading, systematically copying, or republishing platform content",
                  "Attempting to bypass access restrictions or Neeko+ paywalls",
                  "Reverse-engineering any part of the Service",
                  "Sharing premium content publicly or with non-subscribers",
                  "Using platform data for commercial purposes without written permission",
                ]} />
              </Prose>
            </Section>

            <Section id="s5" num="5" title="API Restrictions">
              <Prose>
                <p>
                  Neeko Sports Stats does not provide a public API. Any attempt to reverse-engineer, replicate, or simulate an API through scraping, automated requests, or network-level manipulation is strictly prohibited. Unauthorised API-like activity may result in immediate account suspension or permanent banning.
                </p>
              </Prose>
            </Section>

            <Section id="s6" num="6" title="User Responsibilities">
              <Prose>
                <p>Users are responsible for:</p>
                <BulletList items={[
                  "Maintaining the confidentiality of their account credentials",
                  "All activities that occur under their account",
                  "Complying with all applicable local, state, and federal laws",
                  "Using the Service in a lawful and responsible manner",
                  "Not attempting to gain unauthorised access to any part of the Service",
                ]} />
              </Prose>
            </Section>

            <Section id="s7" num="7" title="Neeko+ Access Terms">
              <Prose>
                <p>
                  Neeko+ is a premium access tier that provides additional features. Two access options are available:
                </p>
                <div className="space-y-3 mt-2">
                  <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
                    <p className="text-sm font-bold text-white/80 mb-1">Season Pass</p>
                    <p className="text-sm text-white/40">
                      A one-time payment for access until the end of the stated AFL season. There is no recurring billing. Access continues until the season ends or until the account is terminated for breach of these Terms or required otherwise by law.
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
                    <p className="text-sm font-bold text-white/80 mb-1">Weekly Plan</p>
                    <p className="text-sm text-white/40">
                      A recurring weekly subscription billed via Stripe. Access renews automatically unless cancelled before the next billing date. You may cancel at any time through your account settings. Access continues until the end of the current paid period.
                    </p>
                  </div>
                </div>
                <p className="mt-2">
                  We reserve the right to modify pricing or features with reasonable notice to active subscribers.
                </p>
              </Prose>
            </Section>

            <Section id="s8" num="8" title="Account Suspension and Termination">
              <Prose>
                <p>
                  We reserve the right to suspend or permanently terminate accounts that violate these Terms, including but not limited to:
                </p>
                <BulletList items={[
                  "Automated scraping or bot usage",
                  "Attempts to bypass Neeko+ access controls",
                  "Sharing premium content or credentials with non-subscribers",
                  "Abusive behaviour toward the platform or other users",
                  "Fraudulent activity or unjustified chargebacks",
                  "Any action that materially harms the platform's performance or integrity",
                ]} />
                <p className="mt-2">
                  Accounts terminated for breach of these Terms may lose access to all features. Refunds in such cases are subject to the Refund Policy and applicable law.
                </p>
              </Prose>
            </Section>

            <Section id="s9" num="9" title="Service Availability">
              <Prose>
                <p>
                  While we aim to provide continuous service, we do not guarantee uninterrupted availability. We reserve the right to:
                </p>
                <BulletList items={[
                  "Modify, suspend, or discontinue any part of the Service at any time",
                  "Perform scheduled or emergency maintenance",
                  "Update features, content, and pricing",
                ]} />
              </Prose>
            </Section>

            <Section id="s10" num="10" title="Limitation of Liability">
              <Prose>
                <p>
                  To the fullest extent permitted by law, Neeko Sports Stats shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from:
                </p>
                <BulletList items={[
                  "Use or inability to use the Service",
                  "Reliance on any data, projection, ranking, or output from the Service",
                  "Unauthorised access to or alteration of your account or data",
                  "Any interruption, delay, or failure of the Service",
                ]} />
                <p>This limitation is subject to any rights you may have under Australian Consumer Law or other laws that cannot be excluded.</p>
              </Prose>
            </Section>

            <Section id="s11" num="11" title="Australian Consumer Law">
              <Prose>
                <p>
                  Nothing in these Terms limits any rights you may have under Australian Consumer Law. Where applicable law implies guarantees or rights that cannot be excluded, those rights apply to the extent required.
                </p>
              </Prose>
            </Section>

            <Section id="s12" num="12" title="Governing Law">
              <Prose>
                <p>
                  These Terms are governed by the laws of Victoria, Australia. Any disputes arising from these Terms are subject to the jurisdiction of the courts of Victoria, Australia.
                </p>
              </Prose>
            </Section>

            <Section id="s13" num="13" title="Changes to Terms">
              <Prose>
                <p>
                  We may update these Terms at any time. Changes are effective immediately upon posting. Continued use of the Service after changes constitutes acceptance of the updated Terms.
                </p>
              </Prose>
            </Section>

            <Section id="s14" num="14" title="Contact">
              <Prose>
                <p>
                  For questions about these Terms, contact us at:{" "}
                  <a href="mailto:admin@neekostats.com.au" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
                    admin@neekostats.com.au
                  </a>
                </p>
                <p>Melbourne, Victoria, Australia</p>
              </Prose>
            </Section>

          </div>
        </div>
      </div>
    </>
  );
}
