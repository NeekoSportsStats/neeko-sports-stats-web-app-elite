import React from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

export default function FormArrowBadge({
  delta,
  size = 14,
}: {
  delta: number;
  size?: number;
}) {
  if (delta > 2) return <ArrowUp size={size} className="text-emerald-300" />;
  if (delta < -2) return <ArrowDown size={size} className="text-red-300" />;
  return <Minus size={size} className="text-neutral-500" />;
}
