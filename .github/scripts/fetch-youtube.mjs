// Fetches the channel's public RSS feed and writes data/youtube.json for the
// homepage's "Latest YouTube Videos" panel. Run by the update-youtube-feed
// workflow on a schedule; can also be run locally with: node .github/scripts/fetch-youtube.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const CHANNEL_ID = 'UCUAxmNKQKlnOKzDp8bx0xvw';
const MAX_VIDEOS = 8;

function decodeEntities(s) {
    return s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
if (!res.ok) {
    console.error(`Feed fetch failed: ${res.status}`);
    process.exit(1);
}
const xml = await res.text();

const videos = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(([entry]) => {
    const id = (entry.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '';
    return { id, title: decodeEntities(title.trim()), published };
}).filter(v => v.id).slice(0, MAX_VIDEOS);

if (!videos.length) {
    console.error('Feed parsed but contained no videos; leaving existing data/youtube.json untouched.');
    process.exit(1);
}

mkdirSync('data', { recursive: true });
writeFileSync('data/youtube.json', JSON.stringify({ updated: new Date().toISOString(), videos }, null, 2) + '\n');
console.log(`Wrote data/youtube.json with ${videos.length} videos.`);
