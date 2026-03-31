import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function SecurityPolicy() {
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
        <h1 className="text-4xl font-bold mb-2">Data Handling & Security Policy</h1>
        <p className="text-muted-foreground text-lg">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Security Overview</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Neeko's Sports Stats is committed to protecting user data through industry-standard security practices. We implement technical, administrative, and physical safeguards to protect personal information from unauthorized access, disclosure, alteration, and destruction.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Data Encryption</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              We use encryption to protect data both in transit and at rest:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>In Transit:</strong> All data transmitted between your browser and our servers is encrypted using TLS 1.2 or higher</li>
              <li><strong>At Rest:</strong> Sensitive data stored in our databases is encrypted using AES-256 encryption</li>
              <li><strong>Passwords:</strong> User passwords are hashed using bcrypt with industry-standard salting</li>
              <li><strong>Session Tokens:</strong> Authentication tokens are encrypted and expire after a defined period</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Payment Security</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              All payment processing is handled by Stripe, a PCI-DSS Level 1 certified payment processor:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Neeko's Sports Stats never stores full credit card numbers or CVV codes</li>
              <li>Payment data is tokenized and processed entirely through Stripe's secure infrastructure</li>
              <li>Stripe complies with international payment security standards (PCI-DSS)</li>
              <li>Stripe uses fraud detection algorithms to identify and prevent suspicious transactions</li>
            </ul>
            <p className="mt-3">
              For more information about Stripe's security practices, visit{" "}
              <a href="https://stripe.com/security" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                stripe.com/security
              </a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Infrastructure Security</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Our platform infrastructure is secured through multiple layers of protection:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Cloud hosting providers with SOC 2 Type II certification</li>
              <li>Distributed denial-of-service (DDoS) protection</li>
              <li>Web application firewall (WAF) to block malicious traffic</li>
              <li>Regular security patches and updates to all systems</li>
              <li>Isolated database environments with restricted access</li>
              <li>Automated backups with encrypted storage</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Access Controls</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Access to user data is strictly limited and controlled:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Only authorized personnel with a legitimate business need can access user data</li>
              <li>Multi-factor authentication (MFA) is required for all administrative accounts</li>
              <li>Role-based access control (RBAC) limits what each team member can view or modify</li>
              <li>All access to sensitive systems is logged and audited regularly</li>
              <li>Employees sign confidentiality agreements and undergo security training</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Data Storage and Retention</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              Neeko's Sports Stats stores data according to the following retention policies:
            </p>
            
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Active User Data</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Account information: Retained while account is active</li>
                <li>Usage logs: Retained for 90 days</li>
                <li>Analytics data: Anonymized and retained indefinitely for platform improvements</li>
              </ul>
            </div>

            <div className="mt-4">
              <h4 className="font-semibold mb-2">Deleted Account Data</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Personal data is removed from active systems within 30 days</li>
                <li>Backups containing deleted data are purged within 90 days</li>
                <li>Billing records may be retained for up to 7 years for tax and legal compliance</li>
              </ul>
            </div>

            <div className="mt-4">
              <h4 className="font-semibold mb-2">Transaction Records</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>Payment records: Retained for 7 years per accounting requirements</li>
                <li>Subscription history: Retained for the duration of the subscription plus 7 years</li>
                <li>Refund records: Retained for 7 years</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Monitoring and Incident Response</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              We actively monitor our systems for security threats and anomalies:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>24/7 automated monitoring of infrastructure and application logs</li>
              <li>Real-time alerts for suspicious activity (failed login attempts, unusual traffic patterns)</li>
              <li>Incident response team trained to handle security breaches</li>
              <li>Regular security audits and penetration testing by third-party experts</li>
              <li>Post-incident analysis and reporting to improve security measures</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Data Breach Notification</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              In the event of a security breach affecting user data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Affected users will be notified within 72 hours of discovery</li>
              <li>Notification will include details of what data was compromised</li>
              <li>We will provide guidance on steps users can take to protect themselves</li>
              <li>Regulatory authorities will be notified as required by law</li>
              <li>We will publish a public incident report (if legally permitted)</li>
            </ul>
            <p className="mt-3 font-semibold">
              No breach of user data has occurred to date. We take all necessary precautions to prevent such incidents.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9. User Account Security</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-3">
            <p>
              Users play a critical role in maintaining account security. We recommend:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use a strong, unique password (minimum 8 characters with mixed case, numbers, and symbols)</li>
              <li>Never share your password or account credentials</li>
              <li>Log out of shared or public devices after use</li>
              <li>Enable email notifications for account changes and logins</li>
              <li>Report suspicious activity immediately to admin@neekostats.com.au</li>
            </ul>
            <p className="mt-3">
              If you suspect your account has been compromised, change your password immediately and contact support.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Third-Party Services</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Neeko's Sports Stats uses select third-party services that adhere to strict security standards:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Stripe:</strong> Payment processing (PCI-DSS Level 1 compliant)</li>
              <li><strong>Cloud Hosting:</strong> SOC 2 Type II certified infrastructure providers</li>
              <li><strong>Analytics Tools:</strong> Limited to anonymized usage data only</li>
            </ul>
            <p className="mt-3">
              All third-party providers are contractually required to maintain data security and confidentiality.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>11. Vulnerability Reporting</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              If you discover a security vulnerability in Neeko's Sports Stats:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Email us immediately at admin@neekostats.com.au with subject line "Security Vulnerability"</li>
              <li>Include detailed steps to reproduce the issue</li>
              <li>Do not publicly disclose the vulnerability until we have addressed it</li>
              <li>Allow us reasonable time to investigate and fix the issue before disclosure</li>
            </ul>
            <p className="mt-3">
              We appreciate responsible disclosure and will acknowledge all valid reports.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>12. Compliance</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Neeko's Sports Stats is committed to complying with applicable data protection regulations:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Australian Privacy Principles (APPs)</li>
              <li>General Data Protection Regulation (GDPR) for EU users</li>
              <li>California Consumer Privacy Act (CCPA) for California residents</li>
              <li>Industry-standard security frameworks (ISO 27001 principles)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>13. Updates to This Policy</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              We regularly review and update our security practices. This policy may be updated to reflect improvements or changes in our security measures. Updated versions will be posted with a new revision date.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>14. Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              For security concerns, vulnerability reports, or questions about data handling:
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
