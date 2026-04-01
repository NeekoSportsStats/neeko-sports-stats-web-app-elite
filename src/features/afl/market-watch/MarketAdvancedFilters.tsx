import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

interface MarketAdvancedFiltersProps {
  selectedTeam: string | null;
  selectedPosition: string | null;
  onTeamChange: (team: string | null) => void;
  onPositionChange: (position: string | null) => void;
  isPremium: boolean;
}

const AFL_TEAMS = [
  "Adelaide",
  "Brisbane",
  "Carlton",
  "Collingwood",
  "Essendon",
  "Fremantle",
  "Geelong",
  "Gold Coast",
  "GWS",
  "Hawthorn",
  "Melbourne",
  "North Melbourne",
  "Port Adelaide",
  "Richmond",
  "St Kilda",
  "Sydney",
  "West Coast",
  "Western Bulldogs",
];

const POSITIONS = ["DEF", "MID", "RUC", "FWD"];

export function MarketAdvancedFilters({
  selectedTeam,
  selectedPosition,
  onTeamChange,
  onPositionChange,
  isPremium,
}: MarketAdvancedFiltersProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const navigate = useNavigate();

  const handleTeamClick = (team: string | null) => {
    if (!isPremium) {
      setShowUpgradeModal(true);
      return;
    }
    // Normalize team name to match database format (lowercase)
    const normalizedTeam = team ? team.trim().toLowerCase() : null;
    console.log(`[MW FILTER] Team clicked: "${team}" → normalized: "${normalizedTeam}"`);
    onTeamChange(normalizedTeam);
  };

  const handlePositionClick = (position: string | null) => {
    if (!isPremium) {
      setShowUpgradeModal(true);
      return;
    }
    // Normalize position to uppercase
    const normalizedPosition = position ? position.trim().toUpperCase() : null;
    console.log(`[MW FILTER] Position clicked: "${position}" → normalized: "${normalizedPosition}"`);
    onPositionChange(normalizedPosition);
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Team Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 px-3 text-xs font-bold bg-white/[0.02] border-white/10 hover:bg-white/[0.05] text-white/60"
            >
              {selectedTeam ? AFL_TEAMS.find(t => t.toLowerCase() === selectedTeam) || selectedTeam : "All Teams"}
              <ChevronDown className="ml-2 h-3 w-3" />
              {!isPremium && <Lock className="ml-2 h-3 w-3 text-[#F5C84C]" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-[#0D0D0D] border-white/10">
            <DropdownMenuItem
              onClick={() => handleTeamClick(null)}
              className="text-white/80 hover:bg-white/5 cursor-pointer"
            >
              All Teams
            </DropdownMenuItem>
            {AFL_TEAMS.map((team) => (
              <DropdownMenuItem
                key={team}
                onClick={() => handleTeamClick(team)}
                className="text-white/80 hover:bg-white/5 cursor-pointer"
              >
                {team}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Position Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 px-3 text-xs font-bold bg-white/[0.02] border-white/10 hover:bg-white/[0.05] text-white/60"
            >
              {selectedPosition || "All Positions"}
              <ChevronDown className="ml-2 h-3 w-3" />
              {!isPremium && <Lock className="ml-2 h-3 w-3 text-[#F5C84C]" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40 bg-[#0D0D0D] border-white/10">
            <DropdownMenuItem
              onClick={() => handlePositionClick(null)}
              className="text-white/80 hover:bg-white/5 cursor-pointer"
            >
              All Positions
            </DropdownMenuItem>
            {POSITIONS.map((position) => (
              <DropdownMenuItem
                key={position}
                onClick={() => handlePositionClick(position)}
                className="text-white/80 hover:bg-white/5 cursor-pointer"
              >
                {position}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Active Filter Badges */}
        {selectedTeam && (
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white/80">
            <span>{AFL_TEAMS.find(t => t.toLowerCase() === selectedTeam) || selectedTeam}</span>
            <button
              onClick={() => handleTeamClick(null)}
              className="ml-1 hover:text-white"
            >
              ×
            </button>
          </div>
        )}
        {selectedPosition && (
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white/80">
            <span>{selectedPosition}</span>
            <button
              onClick={() => handlePositionClick(null)}
              className="ml-1 hover:text-white"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="bg-[#0D0D0D] border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">
              Unlock advanced filters
            </DialogTitle>
            <DialogDescription className="text-white/60 text-base mt-2">
              Filter by team and position to find your exact trade targets
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-4">
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <h3 className="text-sm font-bold text-white mb-2">With Neeko+, you can:</h3>
              <ul className="space-y-2 text-sm text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-[#F5C84C] mt-0.5">✓</span>
                  <span>Filter by all 18 AFL teams instantly</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#F5C84C] mt-0.5">✓</span>
                  <span>Filter by position (DEF, MID, RUC, FWD)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#F5C84C] mt-0.5">✓</span>
                  <span>Combine filters for precise targeting</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#F5C84C] mt-0.5">✓</span>
                  <span>Access full Market Watch player list</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={() => {
                setShowUpgradeModal(false);
                navigate("/neeko-plus-purchase");
              }}
              className="w-full h-11 bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-black font-bold"
            >
              Unlock Neeko+
            </Button>

            <button
              onClick={() => setShowUpgradeModal(false)}
              className="w-full text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
