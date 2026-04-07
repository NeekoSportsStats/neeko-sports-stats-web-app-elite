import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: Non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <>
      <Helmet>
        <title>404 — Page Not Found | Neeko Sports Stats</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://neekostats.com.au/404" />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-center px-6">
          <p className="text-[#F5C84C] text-sm font-semibold tracking-widest uppercase mb-4">
            404
          </p>
          <h1 className="text-3xl font-bold text-white mb-3">
            Page not found
          </h1>
          <p className="text-neutral-400 text-sm mb-8 max-w-xs mx-auto">
            This page doesn't exist or has been removed. It won't be indexed.
          </p>
          <Link
            to="/"
            className="inline-block px-6 py-2.5 rounded-lg bg-[#F5C84C] text-black text-sm font-semibold hover:bg-[#F5C84C]/90 transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </>
  );
};

export default NotFound;
