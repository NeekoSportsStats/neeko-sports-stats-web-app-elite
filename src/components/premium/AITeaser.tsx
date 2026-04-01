import { Sparkles, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

interface AITeaserProps {
  teaserText: string;
  category?: string | null;
  fullTextAvailable: boolean;
  context?: string;
  playerName?: string;
  className?: string;
}

export function AITeaser({
  teaserText,
  category,
  fullTextAvailable,
  context = "ai",
  playerName,
  className = "",
}: AITeaserProps) {
  const navigate = useNavigate();

  const handleReadMore = () => {
    track("ai_teaser_click", {
      context,
      player_name: playerName,
      category,
      source: "ai_teaser",
    });
    navigate("/neeko-plus");
  };

  // If full text is available, just show it
  if (fullTextAvailable) {
    return (
      <div className={`flex items-start gap-2 ${className}`}>
        <Sparkles className="w-4 h-4 text-[#F5C84C] mt-0.5 flex-shrink-0" />
        <p className="text-sm text-white/80 leading-relaxed">{teaserText}</p>
      </div>
    );
  }

  // Show teaser with CTA
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-[#F5C84C] mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-white/80 leading-relaxed">
            {teaserText}
            <span className="text-white/40">...</span>
          </p>
        </div>
      </div>

      {/* Read more CTA */}
      <div className="pl-6">
        <Button
          onClick={handleReadMore}
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-[#F5C84C] hover:text-[#E8B739] hover:bg-transparent font-medium text-xs"
        >
          Read Full Analysis
          <Lock className="w-3 h-3 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
