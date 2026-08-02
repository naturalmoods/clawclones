import * as fs from 'fs';
import { OUTPUT_DIR, DATA_DIR } from './config';

export const isValidToken = (token: string | undefined): boolean => {
    if (!token) return false;
    const t = token.toLowerCase();
    return !t.includes('mock') && !t.includes('your_') && token.length > 10;
};

export function ensureDirectories() {
    [OUTPUT_DIR, DATA_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) throw error;
        console.warn(`Retrying... (${retries} left) after ${delay}ms`);
        await sleep(delay);
        return retry(fn, retries - 1, delay * 2);
    }
}

export function getSafeFileName(repo: string): string {
    return repo.split('/')[1];
}
