# AFL Players Data Layer

This directory contains data fetching functions for the AFL Players feature.

## getRoundSummaryData

Fetches and aggregates player statistics for the Round Summary section.

### Usage Example

```typescript
import { getRoundSummaryData } from "@/features/afl/players/data/getRoundSummaryData";
import { AFL_STAT_CONFIG } from "@/lib/stats/afl/statConfig";

// In a React component or loader
const fetchData = async () => {
  try {
    const data = await getRoundSummaryData({
      season: 2025,
      round: AFL_STAT_CONFIG.sportMeta.currentRound,
      stat: "fantasy"
    });

    setRoundSummaryData(data);
  } catch (error) {
    console.error("Failed to load Round Summary:", error);
  }
};
```

### Required Database Schema

This function uses the `afl.player_round_stats_2025` table:

```sql
-- Primary data source for all AFL 2025 player statistics
-- Uses player (TEXT) as the primary key for the 2025 season
-- No joins required - all data in a single table
SELECT
  player,           -- Player name (primary key)
  team,             -- Team name
  position,         -- Player position
  team_color,       -- Team color for UI
  round_number,     -- Round number
  disposals,        -- Disposals count
  goals,            -- Goals count
  fantasy_points,   -- Fantasy points
  season            -- Season year (always 2025)
FROM afl.player_round_with_colors
WHERE season = 2025;
```

### Data Aggregations

The function calculates:

1. **Sparkline**: Average stat value per round over the last 8 rounds
2. **Top Scorer**: Player with the highest stat value in the current round
3. **Biggest Riser**: Player with the largest week-on-week improvement
4. **Most Consistent**: Player with the highest % of games above league average (last 10 games)

### Error Handling

The function will throw descriptive errors if:
- The database table doesn't exist
- No data exists for the requested season/round
- Required data for calculations is missing

**This is intentional.** The function fails loudly rather than returning partial or default data.

## getPositionTrendData

Fetches and calculates position-based trend analysis for the Position Trends section.

### Usage Example

```typescript
import { getPositionTrendData } from "@/features/afl/players/data/getPositionTrendData";

// In a React component
const fetchData = async () => {
  try {
    const data = await getPositionTrendData({
      season: 2025,
      stat: "fantasy"
    });

    // data.MID.hot = top 5 hot movers for midfielders
    // data.MID.cold = bottom 5 cooling players for midfielders
    setPositionData(data);
  } catch (error) {
    console.error("Failed to load Position Trends:", error);
  }
};
```

### Required Database Schema

This function uses the `afl.player_round_stats_2025` table:

```sql
-- Uses player (TEXT) as the primary key for the 2025 season
SELECT
  player,           -- Player name (primary key)
  round_number,     -- Round number
  disposals,        -- Disposals count
  goals,            -- Goals count
  season            -- Season year (always 2025)
FROM afl.player_round_stats_2025
WHERE season = 2025;
```

### Data Calculations

For each player, the function calculates:

1. **Last 5 Values**: Most recent 5 game statistics (ordered by round)
2. **Season Average**: Mean across all games in the season
3. **L5 Average**: Mean of last 5 games
4. **Delta vs Season**: Difference between L5 avg and season avg
5. **Volatility**: Standard deviation of last 5 games
6. **Stability Score**: 0-100 score based on consistency (100 = perfectly stable)
7. **Composite Score**: Delta × (0.3 + 0.7 × stability/100)

### Position Grouping

Players are grouped into four position categories:
- **MID**: Position string contains "MID"
- **FWD**: Position string contains "FWD"
- **DEF**: Position string contains "DEF"
- **RUC**: Position string contains "RUC"

Players can appear in multiple position groups if their position string contains multiple role types (e.g., "MID/FWD").

### Returns

```typescript
{
  MID: { hot: Player[], cold: Player[] },
  FWD: { hot: Player[], cold: Player[] },
  DEF: { hot: Player[], cold: Player[] },
  RUC: { hot: Player[], cold: Player[] }
}
```

- **hot**: Top 5 players sorted by composite score (descending)
- **cold**: Bottom 5 players sorted by composite score (ascending)

### Error Handling

Returns empty arrays for all positions if:
- The database table doesn't exist
- No data exists for the requested season
- Player has insufficient games (<3) for analysis

This graceful fallback allows the UI to display "Not enough data yet" messaging.

## getFormStabilityGridData

Fetches and calculates form stability analysis for the Form Stability Grid section.

### Usage Example

```typescript
import { getFormStabilityGridData } from "@/features/afl/players/data/getFormStabilityGridData";

// In a React component
const fetchData = async () => {
  try {
    const data = await getFormStabilityGridData({
      season: 2025,
      stat: "fantasy"
    });

    // data.hot = top 5 players with biggest L5 surge
    // data.stable = top 5 most consistent players
    // data.cooling = bottom 5 players with softening output
    setFormData(data);
  } catch (error) {
    console.error("Failed to load Form Stability Grid:", error);
  }
};
```

### Required Database Schema

This function uses the computed view `afl.form_stability_grid_final`:

```sql
-- Pre-computed form stability metrics
-- This is a materialized view that aggregates data from player_round_stats_2025
SELECT
  season,
  player_id,        -- Note: View still uses player_id for backward compatibility
  player_name,      -- Player name for display
  stat_type,        -- 'fantasy', 'disposals', or 'goals'
  games_used,       -- Number of games in calculation
  recent_avg,       -- Last N games average
  season_avg,       -- Full season average
  trend_diff,       -- recent_avg - season_avg
  stability_score,  -- Consistency metric (0-100)
  stability_band,   -- Category: 'High', 'Medium', 'Low'
  trend_label,      -- 'Trending Up', 'Stable', 'Trending Down'
  variance,         -- Statistical variance
  confidence_label  -- Confidence in the prediction
FROM afl.form_stability_grid_final
WHERE season = 2025;
```

### Data Calculations

For each player, the function calculates:

1. **Last 5 Values**: Most recent 5 game statistics (ordered by round)
2. **L5 Average**: Mean of last 5 games
3. **Season Average**: Mean across all games in the season
4. **Delta vs Season**: Difference between L5 avg and season avg
5. **Volatility**: Standard deviation of last 5 games
6. **Consistency**: 0-100 score based on stability (100 = perfectly consistent)

### Categories

Players are sorted into three categories:

- **Hot**: Top 5 players sorted by delta_vs_season (descending) - biggest recent surges
- **Stable**: Top 5 players sorted by consistency (descending) - most dependable output
- **Cooling**: Top 5 players sorted by delta_vs_season (ascending) - biggest recent drops

### Returns

```typescript
{
  hot: PlayerFormMetrics[],      // Top 5 hot form surges
  stable: PlayerFormMetrics[],   // Top 5 stability leaders
  cooling: PlayerFormMetrics[]   // Top 5 cooling risks
}
```

### Error Handling

Returns empty arrays for all categories if:
- The database table doesn't exist
- No data exists for the requested season
- Player has insufficient games (<5) for analysis

This graceful fallback allows the UI to display "Not enough data yet" messaging.
