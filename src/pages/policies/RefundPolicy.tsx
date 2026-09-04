import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "2 September 2026";

const TOC = [
  { id: "s1", label: "Overview" },
  { id: "s2", label: "Neeko Pro Subscription & Billing" },
  { id: "s3", label: "Cancellation" },
  { id: "s4", label: "Refund Eligibility" },
  { id: "s5", label: "Change of Mind" },
  { id: "s6", label: "How to Request a Refund" },
  { id: "s7", label: "Australian Consumer Law" },
  { id: "s8", label: "Policy Updates" },
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

export default function RefundPolicy() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Refund Policy | Neeko Stats</title>
        <meta name="description" content="Refund policy for Neeko Stats. Covers Neeko Pro subscription refund terms, cancellation and how to request a refund." />
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
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">Refund Policy</h1>
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
                  Neeko Stats offers Neeko Pro, a subscription for the iOS and Android app. Billing is handled by Apple and Google via the App Store and Google Play. This policy outlines the refund and cancellation terms for Neeko Pro.
                </p>
              </Prose>
            </Section>

            <Section id="s2" num="2" title="Neeko Pro Subscription & Billing">
              <Prose>
                <p>Neeko Pro is available as a monthly subscription:</p>
                <div className="space-y-3 mt-2">
                  <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
                    <p className="text-sm font-bold text-white/80 mb-1">
                      Neeko Pro
                    </p>
                    <p className="text-sm text-white/60">
                      Recurring billing via the App Store or Google Play depending on your device. Automatically renews unless cancelled before the next billing date. A receipt is sent by Apple or Google after each successful charge.
                    </p>
                  </div>
                </div>
                <p>
                  All billing, receipts, and payment management are handled by Apple or Google through the App Store or Google Play respectively. Neeko Stats does not have direct access to your payment information.
                </p>
              </Prose>
            </Section>

            <Section id="s3" num="3" title="Cancellation">
              <Prose>
                <p>
                  Neeko Pro can be cancelled at any time through your iPhone Settings → Apple ID → Subscriptions (iOS) or Google Play Store → your profile → Payments & subscriptions (Android).
                </p>
                <BulletList items={[
                  "Cancelling stops future billing immediately",
                  "Access continues until the end of the current paid period",
                  "Cancellation does not automatically trigger a refund for the current period unless required by law",
                  "You can resubscribe at any time",
                ]} />
              </Prose>
            </Section>

            <Section id="s4" num="4" title="Refund Eligibility">
              <Prose>
                <p>
                  Because billing is managed by Apple or Google, most refund requests must be submitted directly to the relevant platform — Apple at{" "}
                  <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    reportaproblem.apple.com
                  </a>{" "}or Google at{" "}
                  <a href="https://support.google.com/googleplay/contact/play_console_support" target="_blank" rel="noopener noreferrer" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    support.google.com/googleplay
                  </a>.
                  Refund requests are reviewed in the following circumstances:
                </p>
                <BulletList items={[
                  "Accidental duplicate charges or duplicate purchases",
                  "Billing errors caused by a platform or payment processing malfunction",
                  "Unauthorised charges (subject to verification)",
                  "Extended service outages of 48 or more consecutive hours",
                  "Technical access failures that prevent use of the purchased subscription",
                ]} />
                <p>Refund requests are assessed in accordance with this policy and applicable Australian Consumer Law. Where a refund is required by law, it will be provided.</p>
              </Prose>
            </Section>

            <Section id="s5" num="5" title="Change of Mind">
              <Prose>
                <p>
                  Change-of-mind refunds are not provided once digital access has been granted and the subscription period has begun, except where required by applicable law. This includes forgetting to cancel before a renewal date or dissatisfaction with the accuracy of projections or data.
                </p>
                <p>
                  If you believe your situation warrants consideration, contact us and we will review it.
                </p>
              </Prose>
            </Section>

            <Section id="s6" num="6" title="How to Request a Refund">
              <Prose>
                <p>
                  For App Store billing issues, visit{" "}
                  <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    reportaproblem.apple.com
                  </a>. For Google Play billing issues, visit{" "}
                  <a href="https://support.google.com/googleplay/contact/play_console_support" target="_blank" rel="noopener noreferrer" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    support.google.com/googleplay
                  </a>.
                </p>
                <p>
                  For other queries, email{" "}
                  <a href="mailto:matthew@neekostats.com.au" className="text-white/55 hover:text-white underline underline-offset-2 transition-colors">
                    matthew@neekostats.com.au
                  </a>{" "}
                  with:
                </p>
                <BulletList items={[
                  "Your account email address",
                  "The date and amount of the charge",
                  "The reason for your request",
                  "Any supporting evidence such as screenshots or error messages",
                ]} />
                <p>
                  We will review your request within 5–7 business days and respond accordingly.
                </p>
              </Prose>
            </Section>

            <Section id="s7" num="7" title="Australian Consumer Law">
              <Prose>
                <p>
                  Nothing in this Refund Policy limits any rights you may have under Australian Consumer Law. Where applicable law provides guarantees or rights that cannot be excluded or limited, those rights apply to the extent required by law.
                </p>
              </Prose>
            </Section>

            <Section id="s8" num="8" title="Policy Updates">
              <Prose>
                <p>
                  This policy may be updated at any time. The current version is posted on this page. Continued use of Neeko Pro constitutes acceptance of the current policy.
                </p>
              </Prose>
            </Section>

          </div>

          <div className="mt-10 rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-6">
            <p className="text-sm font-semibold text-white mb-1">Billing question or refund request?</p>
            <p className="text-sm text-white/35">
              Email{" "}
              <a href="mailto:matthew@neekostats.com.au" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
                matthew@neekostats.com.au
              </a>
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
