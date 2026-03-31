export interface TeamBackgroundTheme {
  gradient: string;
  accentColor: string;
  bgStyle: React.CSSProperties;
}

import type React from "react";

export const TEAM_BACKGROUND_THEMES: Record<string, TeamBackgroundTheme> = {
  ADEL: {
    gradient: "navy-red",
    accentColor: "#E21A3A",
    bgStyle: {
      background: "linear-gradient(155deg, #002B5C 0%, #0d1a2e 45%, #1a0508 100%)",
    },
  },
  BL: {
    gradient: "maroon-gold",
    accentColor: "#0066CC",
    bgStyle: {
      background: "linear-gradient(155deg, #7B0046 0%, #1a0514 45%, #000d1f 100%)",
    },
  },
  CARL: {
    gradient: "navy-white",
    accentColor: "#4A90D9",
    bgStyle: {
      background: "linear-gradient(155deg, #031A29 0%, #010c16 50%, #000508 100%)",
    },
  },
  COLL: {
    gradient: "black-white",
    accentColor: "#CCCCCC",
    bgStyle: {
      background: "linear-gradient(155deg, #1a1a1a 0%, #0d0d0d 50%, #000000 100%)",
    },
  },
  ESS: {
    gradient: "black-red",
    accentColor: "#D50032",
    bgStyle: {
      background: "linear-gradient(155deg, #1a0000 0%, #0d0000 50%, #000000 100%)",
    },
  },
  FRE: {
    gradient: "purple-red",
    accentColor: "#CF3B1E",
    bgStyle: {
      background: "linear-gradient(155deg, #2C0E53 0%, #1a0830 50%, #0d0016 100%)",
    },
  },
  GEEL: {
    gradient: "navy-gold",
    accentColor: "#FFCD00",
    bgStyle: {
      background: "linear-gradient(155deg, #001C3F 0%, #000e21 50%, #060500 100%)",
    },
  },
  GC: {
    gradient: "red-gold",
    accentColor: "#FFCD00",
    bgStyle: {
      background: "linear-gradient(155deg, #E40B16 0%, #4a0004 50%, #1a0f00 100%)",
    },
  },
  GWS: {
    gradient: "orange-grey",
    accentColor: "#F15A25",
    bgStyle: {
      background: "linear-gradient(155deg, #2a1800 0%, #1a1212 50%, #0d0d0d 100%)",
    },
  },
  HAW: {
    gradient: "brown-gold",
    accentColor: "#FFCD00",
    bgStyle: {
      background: "linear-gradient(155deg, #442B17 0%, #221508 50%, #0d0500 100%)",
    },
  },
  MELB: {
    gradient: "navy-red",
    accentColor: "#BA0C2F",
    bgStyle: {
      background: "linear-gradient(155deg, #0C2340 0%, #061120 50%, #150004 100%)",
    },
  },
  NM: {
    gradient: "royal-blue",
    accentColor: "#4A90D9",
    bgStyle: {
      background: "linear-gradient(155deg, #013B9F 0%, #001d50 50%, #000520 100%)",
    },
  },
  PORT: {
    gradient: "teal-black",
    accentColor: "#008AAB",
    bgStyle: {
      background: "linear-gradient(155deg, #005570 0%, #002535 50%, #000a0d 100%)",
    },
  },
  RICH: {
    gradient: "gold-black",
    accentColor: "#F1C400",
    bgStyle: {
      background: "linear-gradient(155deg, #2a2100 0%, #151000 50%, #000000 100%)",
    },
  },
  STK: {
    gradient: "red-black",
    accentColor: "#ED0F05",
    bgStyle: {
      background: "linear-gradient(155deg, #2a0000 0%, #150000 50%, #000000 100%)",
    },
  },
  SYD: {
    gradient: "red-white",
    accentColor: "#E00E18",
    bgStyle: {
      background: "linear-gradient(155deg, #3a0003 0%, #1a0001 50%, #000000 100%)",
    },
  },
  WB: {
    gradient: "blue-red",
    accentColor: "#4A90D9",
    bgStyle: {
      background: "linear-gradient(155deg, #003087 0%, #001540 50%, #150005 100%)",
    },
  },
  WCE: {
    gradient: "blue-gold",
    accentColor: "#F2A900",
    bgStyle: {
      background: "linear-gradient(155deg, #002B81 0%, #001540 50%, #100800 100%)",
    },
  },
};

export function getTeamBackgroundTheme(team: string): TeamBackgroundTheme | null {
  const key = team?.trim().toUpperCase();
  return TEAM_BACKGROUND_THEMES[key] ?? null;
}
