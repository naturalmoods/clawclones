import fs from "node:fs/promises";
import path from "node:path";

export interface SeismographData {
    brand: {
        name: string;
        url: string;
    };
    threat: {
        level: string;
        reason?: string;
        history_7d?: string[];
    };
    summary: {
        headline: string;
    };
    latest_signal_snapshot?: {
        total_signals?: number;
    };
    top_categories_7d?: Array<{
        id: string;
        signals_7d: number;
        trend: string;
    }>;
    top_signals?: Array<{
        title: string;
        confidence: string;
        signal_url: string;
        source: {
            name: string;
        };
    }>;
    weekly_briefing?: {
        week_id: string;
        title: string;
    };
    links?: {
        dashboard?: string;
    };
}

const CACHE_FILE = path.resolve(process.cwd(), ".seismograph-cache.json");

function isSeismographData(value: unknown): value is SeismographData {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return Boolean(
        candidate.brand &&
            candidate.summary &&
            candidate.threat &&
            typeof (candidate.brand as Record<string, unknown>).name === "string" &&
            typeof (candidate.summary as Record<string, unknown>).headline === "string" &&
            typeof (candidate.threat as Record<string, unknown>).level === "string",
    );
}

async function readCachedSeismographData(): Promise<SeismographData | null> {
    try {
        const cachedData = await fs.readFile(CACHE_FILE, "utf-8");
        const parsed = JSON.parse(cachedData);
        return isSeismographData(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

async function writeCachedSeismographData(data: SeismographData) {
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf-8");
    } catch (error) {
        console.error("Failed to write seismograph cache", error);
    }
}

export async function loadSeismographData(
    dataUrl: string | undefined,
    fallbackData: SeismographData,
): Promise<SeismographData> {
    if (!dataUrl) {
        return fallbackData;
    }

    try {
        const requestUrl = new URL(dataUrl);
        requestUrl.searchParams.set("_", Date.now().toString());

        const response = await fetch(requestUrl.toString(), {
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
            headers: {
                "cache-control": "no-cache",
                pragma: "no-cache",
            },
        });

        if (response.ok) {
            const parsed = await response.json();
            if (isSeismographData(parsed)) {
                await writeCachedSeismographData(parsed);
                return parsed;
            }
        }
    } catch (error) {
        console.error("Failed to fetch seismograph data", error);
    }

    const cachedData = await readCachedSeismographData();
    return cachedData || fallbackData;
}
