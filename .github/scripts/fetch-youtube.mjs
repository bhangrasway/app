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

// YouTube's RSS endpoint occasionally answers 404/5xx to CI runners for a
// few minutes. Retry a few times; if it's still down, keep the existing
// data/youtube.json and exit 0 — a temporary outage is not a failure worth
// an alarm email (the next scheduled run, 6 hours later, picks it up).
async function fetchFeed() {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
            const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
            if (res.ok) return await res.text();
            console.warn(`Attempt ${attempt}: feed answered ${res.status}`);
        } catch (e) {
            console.warn(`Attempt ${attempt}: ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, attempt * 15000));
    }
    return null;
}
const xml = await fetchFeed();
if (!xml) {
    console.warn('YouTube feed unavailable right now; keeping the existing data/youtube.json.');
    process.exit(0);
}

const videos = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(([entry]) => {
    const id = (entry.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '';
    return { id, title: decodeEntities(title.trim()), published };
}).filter(v => v.id).slice(0, MAX_VIDEOS);

if (!videos.length) {
    console.warn('Feed parsed but contained no videos; leaving existing data/youtube.json untouched.');
    process.exit(0);
}

mkdirSync('data', { recursive: true });
writeFileSync('data/youtube.json', JSON.stringify({ updated: new Date().toISOString(), videos }, null, 2) + '\n');
console.log(`Wrote data/youtube.json with ${videos.length} videos.`);
