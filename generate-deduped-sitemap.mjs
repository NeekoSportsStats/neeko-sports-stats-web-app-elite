import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const nameToSlug = (name) => name.toLowerCase().replace(/\s+/g, '-');

const TEAM_SLUGS = {
  'Adelaide Crows': 'adelaide-crows',
  'Brisbane Lions': 'brisbane-lions',
  'Carlton Blues': 'carlton-blues',
  'Collingwood Magpies': 'collingwood-magpies',
  'Essendon Bombers': 'essendon-bombers',
  'Fremantle Dockers': 'fremantle-dockers',
  'Geelong Cats': 'geelong-cats',
  'Gold Coast Suns': 'gold-coast-suns',
  'Greater Western Sydney Giants': 'gws-giants',
  'Hawthorn Hawks': 'hawthorn-hawks',
  'Melbourne Demons': 'melbourne-demons',
  'North Melbourne Kangaroos': 'north-melbourne-kangaroos',
  'Port Adelaide Power': 'port-adelaide-power',
  'Richmond Tigers': 'richmond-tigers',
  'St Kilda Saints': 'st-kilda-saints',
  'Sydney Swans': 'sydney-swans',
  'West Coast Eagles': 'west-coast-eagles',
  'Western Bulldogs': 'western-bulldogs',
};

const POSITION_SLUGS = ['def', 'mid', 'fwd', 'ruck'];

async function generateSitemap() {
  const { data: players, error } = await supabase
    .from('v_rankings_master')
    .select('player_name')
    .not('neeko_rating', 'is', null)
    .gt('price', 0)
    .order('neeko_rating', { ascending: false });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  // Deduplicate by slug
  const uniqueSlugs = new Set();
  const uniquePlayers = [];
  
  for (const player of players) {
    const slug = nameToSlug(player.player_name);
    if (!uniqueSlugs.has(slug)) {
      uniqueSlugs.add(slug);
      uniquePlayers.push(player);
    }
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n';
  xml += '  <!-- Core Pages -->\n';
  xml += '  <url>\n    <loc>https://neeko.com.au/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n\n';
  xml += '  <url>\n    <loc>https://neeko.com.au/sports/afl/rankings</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n\n';
  xml += '  <url>\n    <loc>https://neeko.com.au/sports/afl/market-watch</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n\n';
  xml += '  <url>\n    <loc>https://neeko.com.au/sports/afl/start-sit</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n\n';
  xml += '  <url>\n    <loc>https://neeko.com.au/sports/afl/edge-board</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n\n';

  xml += '  <!-- Team Pages -->\n';
  Object.values(TEAM_SLUGS).forEach(teamSlug => {
    xml += `  <url>\n    <loc>https://neeko.com.au/sports/afl/teams/${teamSlug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n\n`;
  });

  xml += '  <!-- Position Pages -->\n';
  POSITION_SLUGS.forEach(posSlug => {
    xml += `  <url>\n    <loc>https://neeko.com.au/sports/afl/positions/${posSlug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n\n`;
  });

  xml += '  <!-- Player Pages -->\n';
  uniquePlayers.forEach((player, idx) => {
    const slug = nameToSlug(player.player_name);
    xml += `  <url>\n    <loc>https://neeko.com.au/sports/afl/players/${slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    if ((idx + 1) % 50 === 0) xml += '\n';
  });

  xml += '\n</urlset>\n';

  fs.writeFileSync('/tmp/cc-agent/65212971/project/public/sitemap.xml', xml);
  
  console.log('Sitemap generated!');
  console.log(`Total: ${5 + 18 + 4 + uniquePlayers.length}`);
  console.log(`- Core: 5`);
  console.log(`- Teams: 18`);
  console.log(`- Positions: 4`);
  console.log(`- Players: ${uniquePlayers.length} (deduplicated from ${players.length})`);
}

generateSitemap().catch(console.error);
