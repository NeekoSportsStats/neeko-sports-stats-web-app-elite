import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2 July 2026";

const TOC = [
  { id: "s1",  label: "Overview" },
  { id: "s2",  label: "Payment Security" },
  { id: "s3",  label: "Authentication & Account Security" },
  { id: "s4",  label: "Data Transmission" },
  { id: "s5",  label: "Infrastructure & Hosting" },
  { id: "s6",  label: "Access Controls" },
  { id: "s7",  label: "Data Storage and Retention" },
  { id: "s8",  label: "Monitoring and Incident Response" },
  { id: "s9",  label: "Data Breach Notification" },
  { id: "s10", label: "User Account Security" },
  { id: "s11", label: "Vulnerability Reporting" },
  { id: "s12", label: "Third-Party Services" },
  { id: "s13", label: "Updates to This Policy" },
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

export default function SecurityPolicy() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Data Handling &amp; Security Policy | Neeko Stats</title>
        <meta name="description" content="Data handling and security policy for Neeko Stats. Covers payment security, data protection, infrastructure, breach response and vulnerability reporting." />
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
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">Data Handling &amp; Security Policy</h1>
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

            <Section id="s1" num="1" title="Overview">
              <Prose>
                <p>
                  Neeko Stats uses reasonable technical and organisational safeguards to protect user data against unauthorised access, disclosure, alteration, and loss. This policy explains the practices we follow and the limits of those protections.
                </p>
                <p>
                  No online service can guarantee absolute security. Users should also take steps to protect their own account credentials.
                </p>
              </Prose>
            </Section>

            <Section id="s2" num="2" title="Payment Security">
              <Prose>
                <p>
                  Neeko Pro is purchased exclusively through Apple in-app purchase. Apple handles all payment processing, billing, and receipts. Neeko Stats does not receive, handle, or store full credit card numbers or CVV codes.
                </p>
                <p>
                  For details about Apple's security and privacy practices, visit{" "}
                  <a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener noreferrer" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    apple.com/legal/privacy
                  </a>.
                </p>
              </Prose>
            </Section>

            <Section id="s3" num="3" title="Authentication & Account Security">
              <Prose>
                <p>
                  Authentication and account access are managed through trusted infrastructure providers. User passwords are not stored in plain text. Session tokens are used to maintain authenticated access and are subject to expiry.
                </p>
                <p>
                  Account credentials are not visible to Neeko Stats staff and should be kept confidential by the user.
                </p>
              </Prose>
            </Section>

            <Section id="s4" num="4" title="Data Transmission">
              <Prose>
                <p>
                  Data transmitted between your browser and our servers is protected using standard encryption protocols. This applies to all platform traffic, including account sign-in, subscription management, and data retrieval.
                </p>
              </Prose>
            </Section>

            <Section id="s5" num="5" title="Infrastructure & Hosting">
              <Prose>
                <p>
                  Platform data is hosted in cloud environments operated by trusted infrastructure providers. These providers implement their own security controls, including physical security, access management, and redundancy.
                </p>
                <p>
                  We do not manage our own physical server infrastructure.
                </p>
              </Prose>
            </Section>

            <Section id="s6" num="6" title="Access Controls">
              <Prose>
                <p>Access to user data is restricted to those with a legitimate operational need. Neeko Stats is operated by a small team and data access is managed accordingly.</p>
                <BulletList items={[
                  "Administrative access to backend systems requires authentication",
                  "User data is not shared with external parties except as described in the Privacy Policy",
                  "Access controls are reviewed as the platform evolves",
                ]} />
              </Prose>
            </Section>

            <Section id="s7" num="7" title="Data Storage and Retention">
              <Prose>
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-white/60 mb-2">Active user data</p>
                    <BulletList items={[
                      "Account information: retained while the account is active",
                      "Usage logs: retained for operational and security purposes",
                      "Analytics data: may be anonymised and retained for platform improvement",
                    ]} />
                  </div>
                  <div>
                    <p className="font-semibold text-white/60 mb-2">Deleted account data</p>
                    <BulletList items={[
                      "Personal data is removed from active systems within 30 days of deletion",
                      "Billing records may be retained for up to 7 years for legal and accounting purposes",
                    ]} />
                  </div>
                </div>
              </Prose>
            </Section>

            <Section id="s8" num="8" title="Monitoring and Incident Response">
              <Prose>
                <p>
                  We monitor platform activity for signs of misuse, unusual access patterns, and security anomalies. In the event of a security incident, we will investigate, take corrective action, and notify affected users where required.
                </p>
              </Prose>
            </Section>

            <Section id="s9" num="9" title="Data Breach Notification">
              <Prose>
                <p>If a security incident affects user personal data:</p>
                <BulletList items={[
                  "Affected users will be notified as soon as practicable after the breach is confirmed",
                  "Notification will describe what data was involved and the steps being taken",
                  "Regulatory authorities will be notified as required by applicable law",
                ]} />
              </Prose>
            </Section>

            <Section id="s10" num="10" title="User Account Security">
              <Prose>
                <p>Users are responsible for maintaining the security of their own account. We recommend:</p>
                <BulletList items={[
                  "Use a strong, unique password for your Neeko Stats account",
                  "Never share your password or account credentials with anyone",
                  "Sign out of shared or public devices after use",
                  "Report any suspected unauthorised access immediately to matthew@neekostats.com.au",
                ]} />
              </Prose>
            </Section>

            <Section id="s11" num="11" title="Vulnerability Reporting">
              <Prose>
                <p>If you discover a security vulnerability in Neeko Stats:</p>
                <BulletList items={[
                  <>Email <a href="mailto:matthew@neekostats.com.au" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">matthew@neekostats.com.au</a> with the subject line "Security Vulnerability"</>,
                  "Describe the issue and include steps to reproduce it",
                  "Do not publicly disclose the vulnerability until we have had the opportunity to address it",
                ]} />
                <p>We take all valid security reports seriously and will acknowledge receipt.</p>
              </Prose>
            </Section>

            <Section id="s12" num="12" title="Third-Party Services">
              <Prose>
                <p>Neeko Stats relies on the following third-party providers:</p>
                <BulletList items={[
                  <><strong className="text-white/60">Apple App Store:</strong> In-app purchase, subscription management and payment processing for Neeko Pro.</>,
                  <><strong className="text-white/60">RevenueCat:</strong> Subscription status and entitlement management within the app.</>,
                  <><strong className="text-white/60">Supabase:</strong> Database, authentication, and backend infrastructure.</>,
                  <><strong className="text-white/60">Analytics tools:</strong> Where used, data is processed in anonymised or aggregate form.</>,
                ]} />
                <p>These providers maintain their own security practices, infrastructure controls, and compliance programs. We choose providers with strong security reputations.</p>
              </Prose>
            </Section>

            <Section id="s13" num="13" title="Updates to This Policy">
              <Prose>
                <p>
                  This policy may be updated as our practices or infrastructure change. The current version is posted on this page with a revision date.
                </p>
              </Prose>
            </Section>

            <Section id="s14" num="14" title="Contact">
              <Prose>
                <p>
                  For security concerns, vulnerability reports, or data handling questions, contact us at:{" "}
                  <a href="mailto:matthew@neekostats.com.au" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    matthew@neekostats.com.au
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
