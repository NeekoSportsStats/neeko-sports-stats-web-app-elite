import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2 July 2026";

const TOC = [
  { id: "s1",  label: "What Information We Collect" },
  { id: "s2",  label: "How We Use Your Information" },
  { id: "s3",  label: "Subscription and Payment Data" },
  { id: "s4",  label: "App Store Connect Privacy Labels" },
  { id: "s5",  label: "Third-Party Services" },
  { id: "s6",  label: "Tracking and Advertising" },
  { id: "s7",  label: "Data Storage and Protection" },
  { id: "s8",  label: "Data Sharing and Disclosure" },
  { id: "s9",  label: "Your Privacy Rights" },
  { id: "s10", label: "Data Retention" },
  { id: "s11", label: "Children's Privacy" },
  { id: "s12", label: "Changes to This Policy" },
  { id: "s13", label: "Contact" },
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

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Privacy Policy | Neeko Stats</title>
        <meta name="description" content="Privacy policy for Neeko Stats. Learn what data we collect, how it is used, and how to exercise your privacy rights." />
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

            <Section id="s1" num="1" title="What Information We Collect">
              <Prose>
                <p>Neeko Stats collects the following types of information when you use the app:</p>
                <BulletList items={[
                  <><strong className="text-white/70">Account identifier:</strong> An app user identifier (User ID) is created or linked when you access app features. This is used solely for app functionality such as managing your subscription entitlements.</>,
                  <><strong className="text-white/70">Subscription and purchase history:</strong> We process your Neeko Pro subscription status and purchase history to determine which app features you can access. This information is linked to your user account for app functionality and support purposes.</>,
                  <><strong className="text-white/70">Contact form submissions:</strong> If you contact us via the contact form, we collect your name, email address and message content. This information is used only to respond to your enquiry.</>,
                  <><strong className="text-white/70">Usage data:</strong> We may collect aggregate usage patterns (such as features used or screens visited) to understand how the app is being used and to improve it over time. This data is processed in aggregate or anonymised form.</>,
                ]} />
                <p>We do not collect your full name, date of birth, precise location, health data, or financial information.</p>
              </Prose>
            </Section>

            <Section id="s2" num="2" title="How We Use Your Information">
              <Prose>
                <p>We use collected information to:</p>
                <BulletList items={[
                  "Provide and maintain the Neeko Stats app and its features",
                  "Manage your Neeko Pro subscription status and entitlement access",
                  "Respond to support enquiries submitted through the contact form",
                  "Analyse aggregate usage patterns to improve app performance and features",
                  "Detect and prevent misuse or security threats",
                  "Comply with legal obligations",
                ]} />
                <p>We do not use your information for advertising, and we do not share it with third parties for marketing purposes.</p>
                <p>
                  Neeko Stats does not provide betting tips, bookmaker links, gambling advice, or financial advice. The app provides AFL statistics and form data for research and entertainment purposes only.
                </p>
              </Prose>
            </Section>

            <Section id="s3" num="3" title="Subscription and Payment Data">
              <Prose>
                <p>
                  Neeko Pro is purchased exclusively through the Apple App Store via in-app purchase. Apple handles all payment processing, billing, and receipts. Neeko Stats does not receive, handle, or store your full credit card number, CVV code, or other sensitive payment credentials.
                </p>
                <p>
                  We may receive confirmation of your active subscription status and purchase history from Apple and/or RevenueCat (our subscription management provider) to determine your access entitlements within the app.
                </p>
                <p>
                  For information about how Apple handles payment data, visit{" "}
                  <a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener noreferrer" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    apple.com/legal/privacy
                  </a>.
                </p>
              </Prose>
            </Section>

            <Section id="s4" num="4" title="App Store Connect Privacy Labels">
              <Prose>
                <p>In accordance with Apple's privacy label requirements, Neeko Stats discloses the following data types collected by the app:</p>
                <div className="space-y-3 mt-2">
                  <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
                    <p className="text-sm font-bold text-white/80 mb-1">User ID</p>
                    <p className="text-sm text-white/55">Used for app functionality. Linked to your identity. Not used for tracking.</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
                    <p className="text-sm font-bold text-white/80 mb-1">Purchase History</p>
                    <p className="text-sm text-white/55">Used for app functionality (subscription access). Linked to your identity. Not used for tracking.</p>
                  </div>
                </div>
                <p>
                  This data is not used for tracking, is not sold to data brokers, and is not used for third-party advertising.
                </p>
              </Prose>
            </Section>

            <Section id="s5" num="5" title="Third-Party Services">
              <Prose>
                <p>We use the following third-party services to operate Neeko Stats:</p>
                <BulletList items={[
                  <><strong className="text-white/70">Apple App Store:</strong> Handles all in-app purchases, subscription management, and payment processing for Neeko Pro.</>,
                  <><strong className="text-white/70">RevenueCat:</strong> Manages subscription status, entitlement access and purchase history synchronisation within the app.</>,
                  <><strong className="text-white/70">Supabase:</strong> Provides database, authentication, and backend infrastructure. App functionality data is stored in Supabase-hosted environments.</>,
                  <><strong className="text-white/70">Analytics tools:</strong> We may use analytics services to measure app usage. Where used, data is processed in aggregate or anonymised form.</>,
                ]} />
                <p>These providers are used only as necessary to operate the app and are not authorised to use your data for other purposes.</p>
              </Prose>
            </Section>

            <Section id="s6" num="6" title="Tracking and Advertising">
              <Prose>
                <p className="font-semibold text-white/70">Neeko Stats does not use advertising SDKs, track you across apps or websites, or share your data with advertising networks.</p>
                <BulletList items={[
                  "We do not use third-party advertising",
                  "We do not sell your data to data brokers",
                  "We do not use tracking technologies for cross-app or cross-website tracking",
                  "We do not partner with any bookmaker or gambling operator",
                ]} />
              </Prose>
            </Section>

            <Section id="s7" num="7" title="Data Storage and Protection">
              <Prose>
                <p>
                  Reasonable technical and organisational safeguards are used to protect your data against unauthorised access, disclosure, or loss. Authentication and account access are handled through trusted infrastructure providers.
                </p>
                <p>
                  No online service can guarantee absolute security. You should protect your own Apple ID credentials and report any suspected unauthorised access to Apple.
                </p>
              </Prose>
            </Section>

            <Section id="s8" num="8" title="Data Sharing and Disclosure">
              <Prose>
                <p className="font-semibold text-white/70">We do not sell, rent, or trade your personal information to third parties.</p>
                <p>We may share information only in the following circumstances:</p>
                <BulletList items={[
                  "With your explicit consent",
                  "To comply with legal obligations, court orders, or government requests",
                  "To protect the rights, property, or safety of Neeko Stats or its users",
                  "With service providers who operate the app, under confidentiality obligations",
                  "In connection with a business transfer or acquisition, with prior notice to affected users",
                ]} />
              </Prose>
            </Section>

            <Section id="s9" num="9" title="Your Privacy Rights">
              <Prose>
                <p>You have the right to:</p>
                <BulletList items={[
                  <><strong className="text-white/70">Access:</strong> Request a copy of the personal data we hold about you.</>,
                  <><strong className="text-white/70">Correction:</strong> Request correction of inaccurate information by contacting us.</>,
                  <><strong className="text-white/70">Deletion:</strong> Request deletion of your account and associated personal data, subject to legal retention requirements.</>,
                  <><strong className="text-white/70">Subscription management:</strong> Manage or cancel your Neeko Pro subscription at any time through your Apple ID settings.</>,
                ]} />
                <p>
                  To exercise any of these rights, contact us at{" "}
                  <a href="mailto:matthew@neekostats.com.au" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    matthew@neekostats.com.au
                  </a>.
                </p>
              </Prose>
            </Section>

            <Section id="s10" num="10" title="Data Retention">
              <Prose>
                <BulletList items={[
                  "Account and subscription data is retained while your account is active",
                  "Purchase and billing records may be retained for up to 7 years for legal and accounting purposes",
                  "Usage and analytics data may be anonymised and retained for app improvement",
                  "Contact form submissions are retained only as long as needed to resolve your enquiry",
                ]} />
              </Prose>
            </Section>

            <Section id="s11" num="11" title="Children's Privacy">
              <Prose>
                <p>
                  Neeko Stats is not directed at users under the age of 13. We do not knowingly collect personal information from children. If we become aware that a child has provided personal data, we will take steps to delete it.
                </p>
              </Prose>
            </Section>

            <Section id="s12" num="12" title="Changes to This Policy">
              <Prose>
                <p>
                  We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the app after changes constitutes acceptance of the updated policy.
                </p>
              </Prose>
            </Section>

            <Section id="s13" num="13" title="Contact">
              <Prose>
                <p>
                  For privacy questions or data requests, contact us at:{" "}
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
