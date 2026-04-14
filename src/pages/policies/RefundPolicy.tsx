import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";

const SECTIONS = [
  {
    id: "1",
    title: "Overview",
    content: (
      <p className="text-white/40 text-sm leading-relaxed">
        Neeko Sports Stats offers two Neeko+ subscription plans, billed through Stripe. All transactions are processed securely via Stripe's PCI-compliant infrastructure. Neeko does not store card details.
      </p>
    ),
  },
  {
    id: "2",
    title: "Subscription Plans & Billing",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-4">
          Neeko+ is available on the following plans:
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
            <p className="text-sm font-bold text-white mb-1">Season Pass — ${NEEKO_PRICING.season.price} AUD</p>
            <p className="text-sm text-white/40">One-time payment. Full access for the entire 2026 AFL season. No recurring charges.</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
            <p className="text-sm font-bold text-white mb-1">Weekly — ${NEEKO_PRICING.weekly.price} AUD / week</p>
            <p className="text-sm text-white/40">Billed weekly via Stripe. Automatically renews unless cancelled before the next billing date.</p>
          </div>
        </div>
        <p className="text-white/30 text-sm mt-4">
          A receipt is sent via email after each successful charge.
        </p>
      </>
    ),
  },
  {
    id: "3",
    title: "Cancellation",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-3">
          You may cancel at any time from your Account Settings under "Manage Subscription".
        </p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Cancellation stops future billing immediately</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Access continues until the end of the current billing period</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>No prorated refund is issued for the unused portion of a standard cancellation</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>You can resubscribe at any time</li>
        </ul>
      </>
    ),
  },
  {
    id: "4",
    title: "Refund Eligibility",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-4">
          Refund windows are based on your plan at the time of the charge:
        </p>
        <div className="space-y-3 mb-4">
          <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
            <p className="text-sm font-bold text-white mb-1">Season Pass — 14-day refund window</p>
            <p className="text-sm text-white/40">Requests submitted within 14 days of purchase are eligible for review. After 14 days, access remains active until end of season with no refund.</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-[#151515] px-5 py-4">
            <p className="text-sm font-bold text-white mb-1">Weekly plan — 7-day refund window</p>
            <p className="text-sm text-white/40">Requests submitted within 7 days of the charge are eligible for review. After 7 days, the subscription remains active until renewal with no refund.</p>
          </div>
        </div>
        <p className="text-white/40 text-sm leading-relaxed mb-3">Outside the refund window, refund requests may still be reviewed for:</p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Accidental duplicate charges</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Billing errors caused by platform malfunction</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Unauthorised charges (subject to verification)</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Extended service outages (48+ consecutive hours)</li>
        </ul>
        <p className="text-white/30 text-sm mt-4">
          Refunds are not issued for change of mind, forgetting to cancel, or dissatisfaction with prediction accuracy.
        </p>
      </>
    ),
  },
  {
    id: "5",
    title: "How to Request a Refund",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-3">
          Email{" "}
          <a href="mailto:admin@neekostats.com.au" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
            admin@neekostats.com.au
          </a>{" "}
          with:
        </p>
        <ul className="space-y-2 text-sm text-white/40">
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Your account email address</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>The date of the charge</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>The reason for your request</li>
          <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span>Any supporting evidence (screenshots, error messages)</li>
        </ul>
        <p className="text-white/30 text-sm mt-4">
          Requests are reviewed within 5–7 business days. Approved refunds are returned to the original payment method via Stripe and typically clear within 5–10 business days depending on your bank.
        </p>
      </>
    ),
  },
  {
    id: "6",
    title: "Chargeback Policy",
    content: (
      <>
        <p className="text-white/40 text-sm leading-relaxed mb-3">
          Contact us before disputing a charge with your bank. Filing a chargeback without first contacting support may result in permanent account termination.
        </p>
        <p className="text-white/30 text-sm">
          Fraudulent or unjustified chargebacks will result in a permanent ban and may be referred to Stripe's fraud monitoring systems.
        </p>
      </>
    ),
  },
  {
    id: "7",
    title: "Policy Updates",
    content: (
      <p className="text-white/40 text-sm leading-relaxed">
        This policy may be updated at any time. The current version is posted on this page. Continued use of Neeko+ constitutes acceptance of the current policy.
      </p>
    ),
  },
];

export default function RefundPolicy() {
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
          <h1 className="text-4xl font-extrabold mb-3">Refund Policy</h1>
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
          <p className="text-sm font-semibold text-white mb-1">Billing question or refund request?</p>
          <p className="text-sm text-white/35">
            Email{" "}
            <a href="mailto:admin@neekostats.com.au" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
              admin@neekostats.com.au
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
