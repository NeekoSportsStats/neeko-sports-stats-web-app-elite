import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "9 May 2026";

const TOC = [
  { id: "s1",  label: "What Information We Collect" },
  { id: "s2",  label: "How We Use Your Information" },
  { id: "s3",  label: "Payment Information" },
  { id: "s4",  label: "Cookies and Local Storage" },
  { id: "s5",  label: "Third-Party Services" },
  { id: "s6",  label: "Data Storage and Protection" },
  { id: "s7",  label: "Data Sharing and Disclosure" },
  { id: "s8",  label: "Your Privacy Rights" },
  { id: "s9",  label: "Data Retention" },
  { id: "s10", label: "Children's Privacy" },
  { id: "s11", label: "Changes to This Policy" },
  { id: "s12", label: "Contact" },
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
        <title>Privacy Policy | Neeko Sports Stats</title>
        <meta name="description" content="Privacy policy for Neeko Sports Stats. Learn what data we collect, how it is used, and how to exercise your privacy rights." />
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
                <p>Neeko Sports Stats collects the following types of information:</p>
                <BulletList items={[
                  <><strong className="text-white/60">Account information:</strong> Your email address and a hashed version of your password, used to create and manage your account.</>,
                  <><strong className="text-white/60">Subscription status:</strong> Whether you hold an active Neeko+ Season Pass or Weekly subscription, used to control access to premium features.</>,
                  <><strong className="text-white/60">Usage data:</strong> Pages visited, features used, and interaction patterns. This helps us understand how the platform is being used and improve it over time.</>,
                  <><strong className="text-white/60">Device and browser information:</strong> Browser type, operating system, and IP address, collected automatically when you access the Service.</>,
                  <><strong className="text-white/60">Payment confirmation:</strong> We receive confirmation of successful payments from Stripe. We do not receive or store full credit card numbers or CVV codes.</>,
                ]} />
              </Prose>
            </Section>

            <Section id="s2" num="2" title="How We Use Your Information">
              <Prose>
                <p>We use collected information to:</p>
                <BulletList items={[
                  "Provide and maintain the Service",
                  "Manage your Neeko+ access and subscription status",
                  "Send transactional emails such as payment confirmations and support replies",
                  "Analyse usage patterns to improve platform performance and features",
                  "Detect and prevent misuse, fraud, and security threats",
                  "Comply with legal obligations",
                ]} />
                <p>We do not use your information for advertising or share it with third parties for marketing purposes.</p>
              </Prose>
            </Section>

            <Section id="s3" num="3" title="Payment Information">
              <Prose>
                <p>
                  All payment processing is handled by Stripe. When you purchase Neeko+, your card details are entered directly into Stripe's secure payment interface. Neeko Sports Stats does not receive, handle, or store full credit card numbers, CVV codes, or other sensitive payment credentials.
                </p>
                <p>
                  We receive confirmation from Stripe when a payment is successful, and we store only the subscription status associated with your account.
                </p>
                <p>
                  For information about how Stripe handles payment data, see{" "}
                  <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    stripe.com/privacy
                  </a>.
                </p>
              </Prose>
            </Section>

            <Section id="s4" num="4" title="Cookies and Local Storage">
              <Prose>
                <p>
                  Neeko Sports Stats uses cookies and local storage to maintain your session and authentication state across page loads. This is required for the platform to function correctly.
                </p>
                <BulletList items={[
                  <><strong className="text-white/60">Authentication tokens:</strong> Used to keep you signed in between sessions.</>,
                  <><strong className="text-white/60">Preference storage:</strong> Used to remember settings such as filters or display preferences.</>,
                  <><strong className="text-white/60">Analytics:</strong> We may use analytics tools to understand aggregate usage patterns. Where used, this data is anonymised.</>,
                ]} />
                <p>
                  You can control cookies through your browser settings. Disabling essential cookies will prevent you from signing in or maintaining a session.
                </p>
              </Prose>
            </Section>

            <Section id="s5" num="5" title="Third-Party Services">
              <Prose>
                <p>We use the following third-party services to operate Neeko Sports Stats:</p>
                <BulletList items={[
                  <><strong className="text-white/60">Stripe:</strong> Handles all payment processing. Stripe maintains PCI-DSS compliance. Card data is handled entirely within Stripe's infrastructure.</>,
                  <><strong className="text-white/60">Supabase:</strong> Provides our database, authentication, and backend infrastructure. User account data and subscription records are stored in Supabase-hosted environments.</>,
                  <><strong className="text-white/60">Analytics tools:</strong> We may use analytics services to measure platform usage. Where used, data is processed in aggregate or anonymised form.</>,
                ]} />
                <p>These providers are used only as necessary to operate the Service and are not authorised to use your data for other purposes.</p>
              </Prose>
            </Section>

            <Section id="s6" num="6" title="Data Storage and Protection">
              <Prose>
                <p>
                  Reasonable technical and organisational safeguards are used to protect your data against unauthorised access, disclosure, or loss. Authentication and account access are handled through trusted infrastructure providers.
                </p>
                <p>
                  No online service can guarantee absolute security. Users should protect their own account credentials and report any suspected unauthorised access promptly.
                </p>
              </Prose>
            </Section>

            <Section id="s7" num="7" title="Data Sharing and Disclosure">
              <Prose>
                <p className="font-semibold text-white/60">We do not sell, rent, or trade your personal information to third parties.</p>
                <p>We may share information only in the following circumstances:</p>
                <BulletList items={[
                  "With your explicit consent",
                  "To comply with legal obligations, court orders, or government requests",
                  "To protect the rights, property, or safety of Neeko Sports Stats or its users",
                  "With service providers who operate the platform, under confidentiality obligations",
                  "In connection with a business transfer or acquisition, with prior notice to affected users",
                ]} />
              </Prose>
            </Section>

            <Section id="s8" num="8" title="Your Privacy Rights">
              <Prose>
                <p>You have the right to:</p>
                <BulletList items={[
                  <><strong className="text-white/60">Access:</strong> Request a copy of the personal data we hold about you.</>,
                  <><strong className="text-white/60">Correction:</strong> Update inaccurate information through your account settings or by contacting us.</>,
                  <><strong className="text-white/60">Deletion:</strong> Request deletion of your account and associated personal data, subject to legal retention requirements.</>,
                  <><strong className="text-white/60">Opt-out:</strong> Unsubscribe from non-essential communications at any time.</>,
                ]} />
                <p>
                  To exercise any of these rights, contact us at{" "}
                  <a href="mailto:admin@neekostats.com.au" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    admin@neekostats.com.au
                  </a>.
                </p>
              </Prose>
            </Section>

            <Section id="s9" num="9" title="Data Retention">
              <Prose>
                <BulletList items={[
                  "Account data is retained while your account is active",
                  "Payment and billing records may be retained for up to 7 years for legal and accounting purposes",
                  "Usage and analytics data may be anonymised and retained for platform improvement",
                  "Deleted accounts are removed from active systems within 30 days; backup retention may extend beyond this period",
                ]} />
              </Prose>
            </Section>

            <Section id="s10" num="10" title="Children's Privacy">
              <Prose>
                <p>
                  Neeko Sports Stats is not directed at users under the age of 13. We do not knowingly collect personal information from children. If we become aware that a child has provided personal data, we will take steps to delete it.
                </p>
              </Prose>
            </Section>

            <Section id="s11" num="11" title="Changes to This Policy">
              <Prose>
                <p>
                  We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the Service after changes constitutes acceptance of the updated policy.
                </p>
              </Prose>
            </Section>

            <Section id="s12" num="12" title="Contact">
              <Prose>
                <p>
                  For privacy questions or data requests, contact us at:{" "}
                  <a href="mailto:admin@neekostats.com.au" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
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
