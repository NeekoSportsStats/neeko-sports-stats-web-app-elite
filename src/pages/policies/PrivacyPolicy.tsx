import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-lg">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Information We Collect</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              Neeko's Sports Stats collects the following types of information to provide and improve our services:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Email address, username, and password (encrypted)</li>
              <li><strong>Profile Data:</strong> Optional profile details, preferences, and settings</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent on platform, and interaction patterns</li>
              <li><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers</li>
              <li><strong>Payment Information:</strong> Processed securely through Stripe (we do not store full credit card details)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. How We Use Your Information</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>We use collected information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and maintain the Service</li>
              <li>Process Neeko+ subscription payments and manage billing</li>
              <li>Send important updates, security alerts, and support messages</li>
              <li>Analyze usage patterns to improve platform performance and features</li>
              <li>Detect and prevent fraud, abuse, and security threats</li>
              <li>Comply with legal obligations and enforce our Terms and Conditions</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Cookies and Tracking Technologies</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              Neeko's Sports Stats uses cookies and similar tracking technologies to enhance user experience and analyze platform usage.
            </p>
            <p>Types of cookies we use:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for authentication and basic platform functionality</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how users normally interact with the platform</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and customization choices</li>
            </ul>
            <p className="mt-3">
              You can control cookie preferences through your browser settings, but disabling certain cookies may limit platform functionality.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Third-Party Services</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              We use trusted third-party services to operate Neeko's Sports Stats:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Stripe:</strong> Handles all payment processing securely with industry-standard encryption. Stripe maintains PCI-DSS compliance and does not share full payment details with us.</li>
              <li><strong>Hosting Providers:</strong> Store and process data in secure data centers with encryption and access controls</li>
              <li><strong>Analytics Tools:</strong> Help us understand user behavior and improve the platform (data is anonymized)</li>
            </ul>
            <p className="mt-3">
              These third parties are contractually obligated to protect your data and use it only for the purposes we specify.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Data Storage and Protection</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Neeko's Sports Stats implements industry-standard security measures to protect user data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Passwords are encrypted using secure hashing algorithms</li>
              <li>Data transmission is protected with SSL/TLS encryption</li>
              <li>Access to user data is restricted to authorized personnel only</li>
              <li>Regular security audits and vulnerability assessments are performed</li>
              <li>Backup systems ensure data recovery in case of technical issues</li>
            </ul>
            <p className="mt-3">
              While we take all reasonable precautions, no method of internet transmission is 100% secure. Users should also take steps to protect their account credentials.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Data Sharing and Disclosure</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p className="font-semibold">
              We do not sell, rent, or trade your personal information to third parties.
            </p>
            <p>
              We may share information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations, court orders, or government requests</li>
              <li>To protect our rights, property, or safety, and that of our users</li>
              <li>In connection with a business transfer, merger, or acquisition (users will be notified)</li>
              <li>With service providers who assist in operating the platform (under strict confidentiality agreements)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Your Privacy Rights</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information in your account settings</li>
              <li><strong>Deletion:</strong> Request deletion of your account and associated data (subject to legal retention requirements)</li>
              <li><strong>Data Portability:</strong> Request your data in a structured, machine-readable format</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from marketing emails at any time</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, contact us at admin@neekostats.com.au with your request.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Data Retention</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              We retain personal data for as long as necessary to provide the Service and comply with legal obligations:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Account data is retained while your account is active</li>
              <li>Payment and billing records are kept for tax and accounting purposes (typically 7 years)</li>
              <li>Usage logs and analytics data may be anonymized and retained indefinitely</li>
              <li>Deleted accounts are removed from active systems within 30 days (backups may persist longer)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9. Children's Privacy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Neeko's Sports Stats is not intended for users under the age of 18. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal data, we will take steps to delete such information promptly.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Changes to Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. We encourage users to review this policy periodically. Continued use of the Service after changes constitutes acceptance of the updated policy.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>11. Contact Us</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              If you have questions or concerns about this Privacy Policy or how your data is handled, please contact us:
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
