import fs from 'fs';

const sitemapPath = '/tmp/cc-agent/65212971/project/public/sitemap.xml';
const content = fs.readFileSync(sitemapPath, 'utf8');
const fixed = content.replaceAll('neekostats.com.au', 'neeko.com.au');

fs.writeFileSync(sitemapPath, fixed);

const oldCount = (content.match(/neekostats\.com\.au/g) || []).length;
const newCount = (fixed.match(/neeko\.com\.au/g) || []).length;

console.log(`✅ Sitemap domain fixed!`);
console.log(`Replaced ${oldCount} occurrences of neekostats.com.au with neeko.com.au`);
console.log(`Total neeko.com.au URLs: ${newCount}`);
