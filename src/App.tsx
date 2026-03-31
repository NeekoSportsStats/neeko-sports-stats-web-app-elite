import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import MarketWatch from './pages/MarketWatch';
import Admin from './pages/Admin';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Cookies from './pages/Cookies';

// PART 5: Performance - Configure QueryClient with proper defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false, // Avoid re-fetch loops
      retry: 1,
    },
  },
});

function App() {
  return (
    // PART 4: Wrap entire app in ErrorBoundary
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <div className="min-h-screen bg-slate-50">
            {/* Header with navigation */}
            <header className="bg-white border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-6 py-4">
                <nav className="flex items-center justify-between">
                  <Link to="/" className="text-xl font-bold text-slate-900">
                    AFL Fantasy
                  </Link>
                  <div className="flex items-center gap-6">
                    <Link
                      to="/market-watch"
                      className="text-slate-700 hover:text-slate-900 font-medium"
                    >
                      Market Watch
                    </Link>
                    <Link
                      to="/admin"
                      className="text-slate-700 hover:text-slate-900 font-medium"
                    >
                      Admin
                    </Link>
                  </div>
                </nav>
              </div>
            </header>

            {/* PART 2: FIX ROUTING - All routes properly registered */}
            <Routes>
              <Route path="/" element={<MarketWatch />} />
              <Route path="/market-watch" element={<MarketWatch />} />
              <Route path="/admin" element={<Admin />} />
              {/* PART 2: Policy page routes */}
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/cookies" element={<Cookies />} />
            </Routes>

            {/* Footer with policy links */}
            <footer className="bg-white border-t border-slate-200 mt-12">
              <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex items-center justify-between">
                  <p className="text-slate-600 text-sm">
                    © 2026 AFL Fantasy. All rights reserved.
                  </p>
                  {/* PART 2: FIX LINKS - All policy links point correctly */}
                  <div className="flex items-center gap-6">
                    <Link
                      to="/privacy"
                      className="text-slate-600 hover:text-slate-900 text-sm"
                    >
                      Privacy Policy
                    </Link>
                    <Link
                      to="/terms"
                      className="text-slate-600 hover:text-slate-900 text-sm"
                    >
                      Terms of Service
                    </Link>
                    <Link
                      to="/cookies"
                      className="text-slate-600 hover:text-slate-900 text-sm"
                    >
                      Cookie Policy
                    </Link>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
