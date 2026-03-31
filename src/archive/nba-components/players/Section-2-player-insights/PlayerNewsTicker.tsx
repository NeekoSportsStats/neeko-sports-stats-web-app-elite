import React, { useState, useEffect } from "react";
import { Activity, AlertTriangle, Flame } from "lucide-react";

const items = [
  { text: "MIDs trending up with higher CBA loads.", icon: <Activity size={12} /> },
  { text: "Tag risks flagged for elite ball-winners.", icon: <AlertTriangle size={12} /> },
  { text: "Key forwards hot with 2.5+ goals recently.", icon: <Flame size={12} /> },
];

export default function PlayerNewsTicker() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % items.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full overflow-hidden border border-neutral-800 bg-neutral-950/90 px-3 py-1 rounded-xl text-xs flex items-center gap-2">
      {items[i].icon}
      <span className="text-neutral-300">{items[i].text}</span>
    </div>
  );
}
