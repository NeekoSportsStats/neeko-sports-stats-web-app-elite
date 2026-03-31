import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function TermsConditions() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Button
        variant="ghost"
        onClick={() => navigate("/policies")}
        className="mb-6 gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Policies
      </Button>

      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Terms and Conditions</h1>
        <p className="text-muted-foreground text-lg">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Acceptance of Terms</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              By accessing and using Neeko's Sports Stats ("the Service"), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to these terms, please do not use the Service.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. No Financial Liability</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p className="font-semibold text-destructive">
              IMPORTANT: Neeko's Sports Stats takes NO RESPONSIBILITY for financial loss, betting outcomes, or any decisions users make based on site analytics, predictions, or insights.
            </p>
            <p>
              All statistical insights, AI predictions, and performance trends are for informational purposes only. Neeko's Sports Stats is not responsible for financial losses, gambling outcomes, fantasy sports results, or decisions made using our data. Users acknowledge that all analytics and predictions involve risk and uncertainty.
            </p>
            <p>
              All statistics, analysis, predictions, and insights provided on this platform are for informational and entertainment purposes only. They should not be construed as financial, betting, or investment advice.
            </p>
            <p>
              Users acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Sports analytics are inherently uncertain and subject to change</li>
              <li>Past performance does not guarantee future results</li>
              <li>All betting and financial decisions are made at the user's own risk</li>
              <li>The Service provides no warranties regarding accuracy, completeness, or reliability of data</li>
              <li>Users should conduct their own research before making any betting or financial decisions</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Prohibited Use</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              Users must not access, scrape, harvest, or copy any part of Neeko's Sports Stats using automated tools, bots, scripts, crawlers, or unofficial APIs. Any form of automated data extraction or bulk retrieval is strictly prohibited. Users may only access the platform through the official website or approved integrations.
            </p>
            <p>
              Prohibited activities include but are not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Using automated tools, bots, scripts, or crawlers to access the Service</li>
              <li>Scraping, harvesting, or extracting data from the platform</li>
              <li>Attempting to bypass security measures or access restrictions</li>
              <li>Reverse-engineering any aspect of the Service</li>
              <li>Sharing premium content publicly or with non-subscribers</li>
              <li>Creating unauthorized copies or derivative works of our content</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. API Restrictions</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Neeko's Sports Stats does not provide a public API. Any attempt to reverse-engineer, replicate, or simulate an API through scraping, automated requests, or network-level manipulation is prohibited. Unauthorised API-like activity may result in immediate account suspension or permanent banning.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Account Suspension and Termination</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              We reserve the right to suspend or permanently ban accounts that violate our Terms and Conditions, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Automated scraping or bot usage</li>
              <li>Attempts to bypass Neeko+ paywalls</li>
              <li>Sharing premium content publicly</li>
              <li>Abusive behaviour toward the platform or other users</li>
              <li>Fraudulent activity or chargebacks</li>
              <li>Any action that materially harms the platform's performance or integrity</li>
            </ul>
            <p className="mt-3 font-semibold">
              Banned users may lose access to all features without refund.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. User Responsibilities</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>Users are responsible for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Maintaining the confidentiality of their account credentials</li>
              <li>All activities that occur under their account</li>
              <li>Complying with all applicable local, state, and federal laws</li>
              <li>Using the Service in a lawful and responsible manner</li>
              <li>Not attempting to gain unauthorized access to any part of the Service</li>
              <li>Ensuring they meet the legal gambling age in their jurisdiction before using betting-related features</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Neeko+ Subscription Terms</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Neeko+ is a premium subscription service that provides additional features and insights. By subscribing:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You agree to pay the recurring subscription fee as displayed at the time of purchase</li>
              <li>Subscriptions automatically renew unless canceled before the renewal date</li>
              <li>Refunds are not provided for partial subscription periods</li>
              <li>We reserve the right to modify subscription pricing with 30 days notice to active subscribers</li>
              <li>You may cancel your subscription at any time through your account settings</li>
              <li>Upon cancellation, premium features remain active until the end of the current billing period</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Service Availability</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              While we strive to provide uninterrupted service, we do not guarantee that the Service will be available at all times. We reserve the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Modify, suspend, or discontinue any part of the Service at any time</li>
              <li>Perform scheduled maintenance with or without notice</li>
              <li>Update features, content, and pricing</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9. Limitation of Liability</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              To the fullest extent permitted by law, Neeko's Sports Stats shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use or inability to use the Service</li>
              <li>Unauthorized access to or alteration of your data</li>
              <li>Any content, advice, or information obtained from the Service</li>
              <li>Financial losses incurred from betting or investment decisions based on our analytics</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Governing Law</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              These Terms and Conditions are governed by and construed in accordance with the laws of Australia. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts of Victoria, Australia.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>11. Changes to Terms</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              We reserve the right to modify these Terms and Conditions at any time. Changes will be effective immediately upon posting to the Service. Your continued use of the Service after changes constitutes acceptance of the modified terms.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>12. Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              If you have any questions about these Terms and Conditions, please contact us at:
            </p>
            <p className="mt-3">
              <strong>Email:</strong> admin@neekostats.com.au<br />
              <strong>Address:</strong> Melbourne, Victoria, Australia
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
