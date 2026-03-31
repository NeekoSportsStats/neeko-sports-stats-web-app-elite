// PART 2: FIX CONTENT RENDERING - Static content, no API calls required

const Terms = () => {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Terms of Service</h1>

        <div className="prose prose-slate max-w-none">
          <p className="text-slate-600 mb-6">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            1. Acceptance of Terms
          </h2>
          <p className="text-slate-700 mb-4">
            By accessing and using this service, you accept and agree to be bound by the
            terms and provision of this agreement.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            2. Use of Service
          </h2>
          <p className="text-slate-700 mb-4">
            You agree to use the service only for lawful purposes and in accordance with
            these Terms. You agree not to use the service in any way that could damage,
            disable, overburden, or impair the service.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            3. User Accounts
          </h2>
          <p className="text-slate-700 mb-4">
            You are responsible for maintaining the confidentiality of your account and
            password. You agree to accept responsibility for all activities that occur
            under your account.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            4. Intellectual Property
          </h2>
          <p className="text-slate-700 mb-4">
            The service and its original content, features, and functionality are owned by
            us and are protected by international copyright, trademark, patent, trade
            secret, and other intellectual property laws.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            5. Termination
          </h2>
          <p className="text-slate-700 mb-4">
            We may terminate or suspend your account and bar access to the service
            immediately, without prior notice or liability, under our sole discretion,
            for any reason whatsoever.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            6. Contact Us
          </h2>
          <p className="text-slate-700 mb-4">
            If you have any questions about these Terms, please contact us at
            support@example.com
          </p>
        </div>
      </div>
    </div>
  );
};

export default Terms;
