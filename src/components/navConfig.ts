// Shared navigation structure for sidebar components.
// Exported so tests can assert on the nav shape without rendering any components.

export const STAT_BOARD_CHILDREN = [
  { title: "Matchup Compare", url: "/stat-board/current-week" },
  { title: "Player Stats",    url: "/stat-board/players"      },
  { title: "Team Stats",      url: "/stat-board/teams"        },
  { title: "Match Centre",    url: "/stat-board/match-centre" },
] as const;

export const FANTASY_CHILDREN = [
  { title: "Current Week",  url: "/fantasy/current-week"  },
  { title: "Rankings",      url: "/fantasy/rankings"      },
  { title: "Market Watch",  url: "/fantasy/market-watch"  },
] as const;
