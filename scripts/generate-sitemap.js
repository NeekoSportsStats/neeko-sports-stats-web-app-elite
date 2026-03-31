import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const POSITION_SLUGS = {
  'DEF': 'def',
  'MID': 'mid',
  'FWD': 'fwd',
  'RUC': 'ruck',
};

async function generateSitemap() {
  console.log('Fetching players from database...');

  const { data: players, error } = await supabase
    .from('player_rankings_cache')
    .select('player_name, team, position')
    .not('neeko_rating', 'is', null)
    .gt('price', 0)
    .order('neeko_rating', { ascending: false });

  if (error) {
    console.error('Error fetching players:', error);
    process.exit(1);
  }

  console.log(`Found ${players.length} players`);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n';

  xml += '  <!-- Core Pages -->\n';
  xml += '  <url>\n';
  xml += '    <loc>https://neeko.com.au/</loc>\n';
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n\n';

  xml += '  <url>\n';
  xml += '    <loc>https://neeko.com.au/sports/afl/rankings</loc>\n';
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>0.9</priority>\n';
  xml += '  </url>\n\n';

  xml += '  <url>\n';
  xml += '    <loc>https://neeko.com.au/sports/afl/market-watch</loc>\n';
  xml += '    <changefreq>weekly</changefreq>\n';
  xml += '    <priority>0.8</priority>\n';
  xml += '  </url>\n\n';

  xml += '  <url>\n';
  xml += '    <loc>https://neeko.com.au/sports/afl/start-sit</loc>\n';
  xml += '    <changefreq>weekly</changefreq>\n';
  xml += '    <priority>0.8</priority>\n';
  xml += '  </url>\n\n';

  xml += '  <url>\n';
  xml += '    <loc>https://neeko.com.au/sports/afl/edge-board</loc>\n';
  xml += '    <changefreq>weekly</changefreq>\n';
  xml += '    <priority>0.8</priority>\n';
  xml += '  </url>\n\n';

  xml += '  <!-- Team Pages -->\n';
  Object.values(TEAM_SLUGS).forEach(teamSlug => {
    xml += '  <url>\n';
    xml += `    <loc>https://neeko.com.au/sports/afl/teams/${teamSlug}</loc>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>0.7</priority>\n';
    xml += '  </url>\n\n';
  });

  xml += '  <!-- Position Pages -->\n';
  Object.values(POSITION_SLUGS).forEach(posSlug => {
    xml += '  <url>\n';
    xml += `    <loc>https://neeko.com.au/sports/afl/positions/${posSlug}</loc>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>0.7</priority>\n';
    xml += '  </url>\n\n';
  });

  xml += '  <!-- Player Pages -->\n';
  players.forEach((player, idx) => {
    const slug = nameToSlug(player.player_name);
    xml += '  <url>\n';
    xml += `    <loc>https://neeko.com.au/sports/afl/players/${slug}</loc>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>0.6</priority>\n';
    xml += '  </url>\n';

    if ((idx + 1) % 50 === 0) {
      xml += '\n';
    }
  });

  xml += '\n</urlset>\n';

  const sitemapPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
  fs.writeFileSync(sitemapPath, xml);

  console.log(`Sitemap generated successfully!`);
  console.log(`Total URLs: ${players.length + 23}`);
  console.log(`- Core pages: 5`);
  console.log(`- Team pages: 18`);
  console.log(`- Position pages: 4`);
  console.log(`- Player pages: ${players.length}`);
  console.log(`\nSitemap saved to: ${sitemapPath}`);
}

generateSitemap().catch(console.error);
