// PART 2: FIX CONTENT RENDERING - Static content, no API calls required

const Cookies = () => {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Cookie Policy</h1>

        <div className="prose prose-slate max-w-none">
          <p className="text-slate-600 mb-6">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            1. What Are Cookies
          </h2>
          <p className="text-slate-700 mb-4">
            Cookies are small text files that are placed on your device when you visit our
            website. They help us provide you with a better experience by remembering your
            preferences and understanding how you use our service.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            2. How We Use Cookies
          </h2>
          <p className="text-slate-700 mb-4">
            We use cookies to understand how you interact with our service, to remember your
            preferences, and to improve your experience. We also use cookies for
            authentication and security purposes.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            3. Types of Cookies We Use
          </h2>
          <ul className="list-disc list-inside text-slate-700 mb-4 space-y-2">
            <li>
              <strong>Essential Cookies:</strong> Required for the website to function
              properly
            </li>
            <li>
              <strong>Analytics Cookies:</strong> Help us understand how visitors use our
              website
            </li>
            <li>
              <strong>Preference Cookies:</strong> Remember your settings and preferences
            </li>
            <li>
              <strong>Authentication Cookies:</strong> Keep you logged in securely
            </li>
          </ul>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            4. Managing Cookies
          </h2>
          <p className="text-slate-700 mb-4">
            Most web browsers allow you to control cookies through their settings. You can
            choose to block or delete cookies, but this may affect your experience on our
            website.
          </p>

          <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">
            5. Contact Us
          </h2>
          <p className="text-slate-700 mb-4">
            If you have any questions about our use of cookies, please contact us at
            privacy@example.com
          </p>
        </div>
      </div>
    </div>
  );
};

export default Cookies;
