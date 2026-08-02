type SeismographPayload = {
    brand?: {
        name?: string;
        url?: string;
    };
    threat?: {
        level?: string;
    };
    summary?: {
        headline?: string;
    };
};

// Must match the tone classes rendered server-side in SeismographCard.astro.
const BOX_TONES: Record<string, string[]> = {
    critical: ["bg-red-500/10", "border-red-500/30", "text-red-500"],
    high: ["bg-[#eab308]/10", "border-[#eab308]/30", "text-[#eab308]"],
    medium: ["bg-[#fbbf24]/10", "border-[#fbbf24]/30", "text-[#fbbf24]"],
    low: ["bg-green-500/10", "border-green-500/30", "text-green-500"],
};

function normalizeThreatLevel(level?: string) {
    switch ((level || "").toLowerCase()) {
        case "critical":
            return "critical";
        case "elevated":
        case "high":
            return "high";
        case "normal":
        case "low":
            return "low";
        default:
            return "medium";
    }
}

function updateThreatPresentation(root: ParentNode, threatLevel?: string) {
    const normalizedLevel = normalizeThreatLevel(threatLevel);
    const box = root.querySelector<HTMLElement>("[data-seismograph-threat-box]");
    const label = root.querySelector<HTMLElement>("[data-seismograph-threat-label]");

    if (label) {
        label.textContent = normalizedLevel;
    }

    if (box) {
        Object.values(BOX_TONES)
            .flat()
            .forEach((className) => box.classList.remove(className));
        BOX_TONES[normalizedLevel].forEach((className) => box.classList.add(className));
    }
}

async function fetchLiveSeismographData(url: string) {
    const requestUrl = new URL(url, window.location.href);
    requestUrl.searchParams.set("_", Date.now().toString());

    const response = await fetch(requestUrl.toString(), {
        signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch seismograph data: ${response.status}`);
    }

    return (await response.json()) as SeismographPayload;
}

function applyCardData(root: HTMLElement, data: SeismographPayload) {
    const link = root as HTMLAnchorElement;
    const brand = root.querySelector<HTMLElement>("[data-seismograph-brand-name]");
    const headline = root.querySelector<HTMLElement>("[data-seismograph-headline]");

    if (data.brand?.url) {
        link.href = data.brand.url;
    }

    if (brand && data.brand?.name) {
        brand.textContent = data.brand.name;
    }

    if (headline && data.summary?.headline) {
        headline.textContent = data.summary.headline;
    }

    updateThreatPresentation(root, data.threat?.level);
}

export function initLiveSeismographEmbeds() {
    document
        .querySelectorAll<HTMLElement>("[data-seismograph-card][data-seismograph-url]")
        .forEach((root) => {
            if (root.dataset.seismographLiveReady === "true") {
                return;
            }

            root.dataset.seismographLiveReady = "true";

            const dataUrl = root.dataset.seismographUrl;
            if (!dataUrl) {
                return;
            }

            fetchLiveSeismographData(dataUrl)
                .then((data) => applyCardData(root, data))
                .catch(() => {
                    // Keep the server-rendered payload when the optional partner refresh fails.
                });
        });
}
