/**
 * Reddit fetcher smoke test. Prints what came back; deliberately writes
 * nothing — the earlier version overwrote `src/data/reddit.json` with the ten
 * posts it happened to fetch, which quietly destroyed the tracked dataset.
 */
import { fetchRedditData } from './lib/reddit';

async function test() {
    console.log('Fetching Reddit data...');
    const res = await fetchRedditData('LocalLLaMA OR OpenSourceAI');

    console.log(`Got ${res.posts.length} posts.`);
    for (const post of res.posts.slice(0, 10)) {
        console.log(` r/${post.subreddit}  ${post.title}`);
    }
}

test().catch(console.error);
