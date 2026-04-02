/**
 * Locked Player Card Component
 * Shows when free users try to access premium-only players
 */

import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface LockedPlayerCardProps {
  playerName: string;
  team: string;
  position: string;
  price?: number;
  projection?: number;
  variant?: 'full' | 'compact';
  showCTA?: boolean;
}

export function LockedPlayerCard({
  playerName,
  team,
  position,
  price,
  projection,
  variant = 'full',
  showCTA = true,
}: LockedPlayerCardProps) {
  const navigate = useNavigate();

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(p);
  };

  if (variant === 'compact') {
    return (
      <div className="relative bg-gradient-to-br from-white/[0.02] to-white/[0.01] border border-white/10 rounded-xl p-4 overflow-hidden group hover:border-[#F5C84C]/30 transition-all">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center">
          <div className="text-center">
            <Lock className="h-6 w-6 text-[#F5C84C] mx-auto mb-2" />
            <p className="text-xs text-white/60 font-medium">Neeko+ Required</p>
          </div>
        </div>

        <div className="filter blur-sm pointer-events-none">
          <h3 className="text-lg font-bold text-white mb-1 truncate">
            {playerName}
          </h3>
          <div className="flex items-center gap-2 text-sm text-white/50 mb-3">
            <span className="font-medium">{position}</span>
            <span className="text-white/30">•</span>
            <span className="truncate">{team}</span>
          </div>
          {price && (
            <div className="text-base font-bold text-white">
              {formatPrice(price)}
            </div>
          )}
          {projection && (
            <div className="text-sm text-white/40 mt-1">
              Proj: {projection.toFixed(0)} pts
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-white/[0.02] to-white/[0.01] border border-white/10 rounded-xl p-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/60 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#F5C84C]/10 border-2 border-[#F5C84C]/30">
            <Lock className="h-8 w-8 text-[#F5C84C]" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white mb-1">
              {playerName}
            </h3>
            <p className="text-sm text-white/50">
              {position} • {team}
            </p>
          </div>

          <p className="text-sm text-white/60 max-w-xs">
            Unlock 600+ players with AI analysis and advanced stats
          </p>

          {showCTA && (
            <Button
              onClick={() => navigate('/neeko-plus')}
              className="bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-black font-semibold px-6"
            >
              Unlock 600+ Players
            </Button>
          )}
        </div>
      </div>

      <div className="filter blur-md pointer-events-none">
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-bold text-white mb-2">{playerName}</h3>
            <div className="flex items-center gap-3">
              <span className="text-base text-white/60">{position}</span>
              <span className="text-white/30">•</span>
              <span className="text-base text-white/60">{team}</span>
            </div>
          </div>

          {price && (
            <div className="flex items-center justify-between py-3 border-y border-white/10">
              <span className="text-sm text-white/50">Price</span>
              <span className="text-lg font-bold text-white">{formatPrice(price)}</span>
            </div>
          )}

          {projection && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">Projection</span>
              <span className="text-lg font-bold text-white">{projection.toFixed(0)} pts</span>
            </div>
          )}

          <div className="space-y-2 pt-4">
            <div className="h-3 bg-white/10 rounded-full w-3/4" />
            <div className="h-3 bg-white/10 rounded-full w-full" />
            <div className="h-3 bg-white/10 rounded-full w-5/6" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface LockedPlayerOverlayProps {
  playerName: string;
  onUpgrade: () => void;
}

export function LockedPlayerOverlay({ playerName, onUpgrade }: LockedPlayerOverlayProps) {
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-20 flex items-center justify-center p-4 rounded-xl">
      <div className="text-center space-y-4 max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#F5C84C]/10 border-2 border-[#F5C84C]/30">
          <Lock className="h-7 w-7 text-[#F5C84C]" />
        </div>

        <div>
          <h3 className="text-lg font-bold text-white mb-2">
            {playerName} is Premium Only
          </h3>
          <p className="text-sm text-white/60">
            Unlock 600+ players with AI insights and advanced stats
          </p>
        </div>

        <Button
          onClick={onUpgrade}
          className="bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-black font-semibold w-full"
        >
          Unlock 600+ Players
        </Button>
      </div>
    </div>
  );
}
