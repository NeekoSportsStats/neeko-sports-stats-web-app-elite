import React from "react";

type Props = { color?: "gold" | "emerald" | "blue" | "red" | "purple" };

const colorMap: Record<Props["color"], string> = {
  gold: "via-yellow-400/50",
  emerald: "via-emerald-400/40",
  blue: "via-sky-400/40",
  red: "via-red-400/40",
  purple: "via-purple-400/40",
};

export default function SectionDividerGlow({ color = "gold" }: Props) {
  return (
    <div
      className={`my-8 h-px w-full bg-gradient-to-r from-transparent ${
        colorMap[color]
      } to-transparent`}
    />
  );
}
