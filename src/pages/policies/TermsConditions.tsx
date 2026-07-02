import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2 July 2026";

const TOC = [
  { id: "s1",  label: "Acceptance of Terms" },
  { id: "s2",  label: "About the App" },
  { id: "s3",  label: "No Betting, Gambling or Financial Advice" },
  { id: "s4",  label: "No Guarantee of Accuracy" },
  { id: "s5",  label: "Acceptable Use" },
  { id: "s6",  label: "Neeko Pro Subscription" },
  { id: "s7",  label: "Subscription Management and Cancellation" },
  { id: "s8",  label: "Service Availability" },
  { id: "s9",  label: "Intellectual Property" },
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

function BulletList({ items }: { items: (string | React.ReactNode)[] }) {
  return (
    <ul className="space-y-2 text-sm text-white/60 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
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
        <title>Terms &amp; Conditions | Neeko Stats</title>
        <meta name="description" content="Terms and conditions for using Neeko Stats, the AFL statistics app for iPhone." />
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

            <Section id="s1" num="1" title="Acceptance of Terms">
              <Prose>
                <p>
                  By downloading, installing, or using the Neeko Stats app ("the App"), you accept and agree to be bound by these Terms and Conditions. If you do not agree, do not use the App.
                </p>
              </Prose>
            </Section>

            <Section id="s2" num="2" title="About the App">
              <Prose>
                <p>
                  Neeko Stats is an AFL statistics and research app for iPhone. The App provides AFL player hit rates, match boards, team form, and matchup data. Information is provided for research, informational, and entertainment purposes only.
                </p>
                <p>
                  Neeko Stats is not affiliated with the AFL, AFL clubs, or any official AFL data provider.
                </p>
              </Prose>
            </Section>

            <Section id="s3" num="3" title="No Betting, Gambling or Financial Advice">
              <Prose>
                <p>
                  Neeko Stats does not provide betting tips, wagering advice, gambling recommendations, bookmaker links, financial advice, or investment guidance of any kind.
                </p>
                <p>
                  All data, statistics, hit rates, projections, and analysis available through the App are provided for informational and entertainment purposes only. Nothing in the App should be interpreted as advice of any professional, financial, legal, or gambling nature.
                </p>
                <p>
                  Users are solely responsible for how they interpret and use the information provided by the App. Neeko Stats does not endorse or encourage gambling.
                </p>
              </Prose>
            </Section>

            <Section id="s4" num="4" title="No Guarantee of Accuracy">
              <Prose>
                <p>
                  AFL statistics, projections, and hit rates are based on available data and are subject to change. AFL player performance is inherently variable and data may be delayed, incomplete, or inaccurate despite our reasonable efforts.
                </p>
                <BulletList items={[
                  "Past performance does not guarantee future results",
                  "Statistics and hit rates represent historical patterns, not predictions or certainties",
                  "The App provides no warranties regarding the accuracy, completeness, or reliability of any data",
                  "Data may be delayed or unavailable during or immediately after matches",
                ]} />
              </Prose>
            </Section>

            <Section id="s5" num="5" title="Acceptable Use">
              <Prose>
                <p>You must not:</p>
                <BulletList items={[
                  "Use automated tools, bots, scripts, or crawlers to access or extract data from the App",
                  "Reverse-engineer, decompile, or attempt to extract source code from the App",
                  "Attempt to bypass or circumvent Neeko Pro access restrictions",
                  "Share Neeko Pro content or access credentials with non-subscribers",
                  "Use App data or content for commercial purposes without written permission from Neeko Stats",
                  "Use the App for any unlawful purpose or in violation of any applicable law",
                ]} />
                <p>Violation of these rules may result in account suspension or termination, including loss of access to paid features. Refunds in such cases are subject to the Refund Policy and applicable law.</p>
              </Prose>
            </Section>

            <Section id="s6" num="6" title="Neeko Pro Subscription">
              <Prose>
                <p>
                  Neeko Pro is a premium subscription that unlocks additional features within the Neeko Stats app, including full-round match boards, all stat lenses, fine-line thresholds, and matchup compare access.
                </p>
                <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4 mt-2">
                  <p className="text-sm font-bold text-white/80 mb-2">Neeko Pro — $9.99 AUD / month</p>
                  <p className="text-sm text-white/55">
                    Neeko Pro is available as an auto-renewing monthly subscription for $9.99 AUD per month. Payment is charged to your Apple ID through the App Store. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. You can manage or cancel your subscription in your Apple ID subscription settings.
                  </p>
                </div>
                <p>
                  We reserve the right to modify Neeko Pro pricing or features. Where changes affect active subscribers, reasonable notice will be provided.
                </p>
              </Prose>
            </Section>

            <Section id="s7" num="7" title="Subscription Management and Cancellation">
              <Prose>
                <p>
                  Neeko Pro subscriptions are managed entirely through Apple. You can manage or cancel your subscription at any time through:
                </p>
                <BulletList items={[
                  "iPhone Settings → [Your Name] → Subscriptions",
                  "The App Store → your account → Subscriptions",
                ]} />
                <BulletList items={[
                  "Cancelling stops future renewals — no further charges will be made after the current period ends",
                  "Access to Neeko Pro continues until the end of the current paid billing period",
                  "Cancellation does not automatically trigger a refund for the current period unless required by law",
                  "Refund requests must be submitted to Apple at reportaproblem.apple.com",
                ]} />
                <p>
                  Because Neeko Pro is purchased through Apple in-app purchase, refund requests are managed by Apple. Neeko Stats does not receive or store your payment card details. For our full refund terms, see the{" "}
                  <a href="/refund-policy" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">Refund Policy</a>.
                </p>
              </Prose>
            </Section>

            <Section id="s8" num="8" title="Service Availability">
              <Prose>
                <p>
                  While we aim to provide continuous service, we do not guarantee uninterrupted availability of the App or its features. We reserve the right to:
                </p>
                <BulletList items={[
                  "Modify, suspend, or discontinue any part of the App at any time",
                  "Perform scheduled or emergency maintenance",
                  "Update features, content, and data sources",
                ]} />
              </Prose>
            </Section>

            <Section id="s9" num="9" title="Intellectual Property">
              <Prose>
                <p>
                  All content, design, data compilations, features, and functionality within the Neeko Stats app are the property of Neeko Stats or its licensors. You may not copy, reproduce, distribute, or create derivative works from any part of the App without written permission.
                </p>
              </Prose>
            </Section>

            <Section id="s10" num="10" title="Limitation of Liability">
              <Prose>
                <p>
                  To the fullest extent permitted by law, Neeko Stats shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from:
                </p>
                <BulletList items={[
                  "Use or inability to use the App",
                  "Reliance on any data, statistic, hit rate, or output from the App",
                  "Unauthorised access to or alteration of your account or data",
                  "Any interruption, delay, or failure of the App",
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
                  We may update these Terms at any time. Changes are effective immediately upon posting. Continued use of the App after changes constitutes acceptance of the updated Terms.
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
