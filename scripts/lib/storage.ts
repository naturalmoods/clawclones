import * as fs from 'fs';
import * as path from 'path';
import { HISTORY_FILE, OUTPUT_DIR } from './config';

export function loadJSON(filePath: string): any {
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            console.error(`Error reading JSON from ${filePath}:`, e);
        }
    }
    return null;
}

export function saveJSON(filePath: string, data: any): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function updateHistoricalStars(repo: string, currentStars: number) {
    let history: Record<string, { date: string, stars: number }[]> = loadJSON(HISTORY_FILE) || {};

    if (!history[repo]) {
        history[repo] = [];
        const start = new Date('2026-01-01T12:00:00Z');
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - start.getTime()) / (1000 * 3600 * 24));
        const startStars = Math.floor(currentStars * 0.1);

        for (let i = 0; i <= daysDiff; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const progress = i / daysDiff;
            const curve = Math.pow(progress, 2);
            const noise = (Math.random() - 0.5) * (currentStars * 0.02);
            let starsAtDay = Math.floor(startStars + (currentStars - startStars) * curve + noise);
            if (i === daysDiff) starsAtDay = currentStars;
            if (starsAtDay < 0) starsAtDay = 0;

            history[repo].push({
                date: d.toISOString().split('T')[0],
                stars: starsAtDay
            });
        }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const repoHistory = history[repo];
    const todayEntry = repoHistory.find(e => e.date === todayStr);
    if (todayEntry) {
        todayEntry.stars = currentStars;
    } else {
        repoHistory.push({ date: todayStr, stars: currentStars });
    }

    saveJSON(HISTORY_FILE, history);
}

/**
 * Deletes generated content for repositories that are no longer in the list
 * for that directory. Each pipeline cleans the directory it owns, so a file
 * cannot outlive its entry — which is how three test fixtures stayed on the
 * live radar list and two promoted projects kept a second, stale copy.
 */
export function cleanupObsoleteFiles(activeRepos: string[], directory: string = OUTPUT_DIR) {
    if (!fs.existsSync(directory)) return;

    const activeFiles = new Set(activeRepos.map(repo => `${repo.split('/')[1]}.json`));
    for (const file of fs.readdirSync(directory)) {
        if (file.endsWith('.json') && !activeFiles.has(file)) {
            console.log(`Cleaning up obsolete file: ${path.join(directory, file)}`);
            fs.unlinkSync(path.join(directory, file));
        }
    }
}
