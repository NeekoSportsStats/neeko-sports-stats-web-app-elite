import { Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";

interface UpgradeButtonProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  to?: string;
  source?: string;
}

export function UpgradeButton({
  label = "Unlock Neeko+",
  size = "md",
  className = "",
  to = "/neeko-plus",
  source = "upgrade_button",
}: UpgradeButtonProps) {
  const navigate = useNavigate();

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const handleClick = () => {
    track("cta_click", { source, label, destination: to });
    navigate(to);
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 bg-[#F5C84C] text-black font-semibold rounded-lg hover:brightness-110 transition-all duration-150 ${sizeClasses[size]} ${className}`}
    >
      <Crown size={size === "lg" ? 16 : 13} />
      {label}
    </button>
  );
}
