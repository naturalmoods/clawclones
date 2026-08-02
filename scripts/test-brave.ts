import 'dotenv/config';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

async function testBrave() {
    const query = '("openclaw" AND ("alternative" OR "clone" OR "agent")) OR "picoclaw" OR "zeroclaw" OR "nanoclaw" OR "openfang"';
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&freshness=pm`;

    try {
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "X-Subscription-Token": BRAVE_API_KEY || ""
            }
        });
        const data: any = await res.json();
        console.log("Results:");
        for (const r of data.web?.results || []) {
            console.log(`- [${r.meta_url?.hostname}] ${r.title}`);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

testBrave();