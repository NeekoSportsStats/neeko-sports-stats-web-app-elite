// PART 2: FIX CONTENT RENDERING - Static content, no API calls required

const Privacy = () => {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>

        <div className="prose prose-slate max-w-none">
          <p className="text-slate-600 mb-6">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            1. Information We Collect
          </h2>
          <p className="text-slate-700 mb-4">
            We collect information you provide directly to us when you create an account,
            use our services, or communicate with us. This may include your name, email
            address, and usage data.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            2. How We Use Your Information
          </h2>
          <p className="text-slate-700 mb-4">
            We use the information we collect to provide, maintain, and improve our services,
            to communicate with you, and to protect our users.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            3. Data Security
          </h2>
          <p className="text-slate-700 mb-4">
            We implement appropriate technical and organizational measures to protect your
            personal information against unauthorized access, alteration, disclosure, or
            destruction.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            4. Your Rights
          </h2>
          <p className="text-slate-700 mb-4">
            You have the right to access, update, or delete your personal information at any
            time. You may also have the right to restrict or object to certain processing
            of your data.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            5. Contact Us
          </h2>
          <p className="text-slate-700 mb-4">
            If you have any questions about this Privacy Policy, please contact us at
            privacy@example.com
          </p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
