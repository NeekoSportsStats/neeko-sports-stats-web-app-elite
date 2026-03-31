import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useState } from 'react';
import { Database, Users, Settings, Activity, Loader2 } from 'lucide-react';

// PART 1: FIX TAB ROUTING - Define valid tab routes
const VALID_TABS = ['overview', 'users', 'rankings', 'settings'] as const;
type TabKey = typeof VALID_TABS[number];

const Admin = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // PART 1: FIX TAB STATE - Active tab derived from URL
  const activeTabParam = searchParams.get('tab');
  const activeTab: TabKey = VALID_TABS.includes(activeTabParam as TabKey)
    ? (activeTabParam as TabKey)
    : 'overview';

  // PART 1: FIX TAB ROUTING - Handle tab changes via URL
  const handleTabChange = (tab: TabKey) => {
    setSearchParams({ tab });
  };

  // PART 1: FIX DATA LOADING - Handle all query states
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { count: playerCount, error: playerError } = await supabase
        .from('afl.player_rankings_cache')
        .select('*', { count: 'exact', head: true });

      if (playerError) throw playerError;

      const { count: userCount, error: userError } = await supabase
        .from('auth.users')
        .select('*', { count: 'exact', head: true });

      // Don't throw on user error - they might not have access
      return {
        playerCount: playerCount || 0,
        userCount: userError ? 0 : userCount || 0,
      };
    },
  });

  // PART 1: VERIFY COMMAND BUTTONS - Mutation for refresh rankings
  const [commandStatus, setCommandStatus] = useState<{
    loading: boolean;
    success: string | null;
    error: string | null;
  }>({ loading: false, success: null, error: null });

  const refreshRankings = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('refresh-rankings');
      if (error) throw error;
      return data;
    },
    onMutate: () => {
      // PART 1: Handle loading state
      setCommandStatus({ loading: true, success: null, error: null });
    },
    onSuccess: () => {
      // PART 1: Handle success
      setCommandStatus({ loading: false, success: 'Rankings refreshed successfully', error: null });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });

      // Clear success message after 3 seconds
      setTimeout(() => {
        setCommandStatus(prev => ({ ...prev, success: null }));
      }, 3000);
    },
    onError: (error) => {
      // PART 1: Handle error - no silent failures
      setCommandStatus({
        loading: false,
        success: null,
        error: error instanceof Error ? error.message : 'Failed to refresh rankings',
      });
    },
  });

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: Activity },
    { key: 'users' as const, label: 'Users', icon: Users },
    { key: 'rankings' as const, label: 'Rankings', icon: Database },
    { key: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Admin Panel</h1>

          {/* PART 1: FIX TAB ROUTING - Tab navigation */}
          <div className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* PART 1: PREVENT CRASHES - Show loading/error/empty states */}
        {statsLoading && (
          <div className="bg-white rounded-lg p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-slate-600">Loading admin data...</p>
          </div>
        )}

        {statsError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800 font-semibold mb-2">Failed to load admin data</p>
            <p className="text-red-600 text-sm">
              {statsError instanceof Error ? statsError.message : 'Unknown error'}
            </p>
          </div>
        )}

        {/* PART 1: PREVENT CRASHES - Guard against null/undefined data */}
        {!statsLoading && !statsError && stats && (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <Database className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-slate-900">Total Players</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">
                      {stats.playerCount}
                    </p>
                  </div>

                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <Users className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-slate-900">Total Users</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">
                      {stats.userCount}
                    </p>
                  </div>
                </div>

                {/* PART 1: VERIFY COMMAND BUTTONS - Proper state handling */}
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>

                  <button
                    onClick={() => refreshRankings.mutate()}
                    disabled={commandStatus.loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {commandStatus.loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      'Refresh Rankings'
                    )}
                  </button>

                  {/* Show success message */}
                  {commandStatus.success && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-green-800 text-sm">{commandStatus.success}</p>
                    </div>
                  )}

                  {/* Show error message - no silent failures */}
                  {commandStatus.error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-800 text-sm">{commandStatus.error}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">User Management</h3>
                <p className="text-slate-600">User management features coming soon</p>
              </div>
            )}

            {activeTab === 'rankings' && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Rankings Management</h3>
                <p className="text-slate-600">Rankings management features coming soon</p>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">System Settings</h3>
                <p className="text-slate-600">Settings configuration coming soon</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;
