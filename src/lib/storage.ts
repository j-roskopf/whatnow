import { browser } from '$app/environment';

const DISMISSED = 'whatnow:dismissed';
const HAND = 'whatnow:hand';

function read<T>(key: string): T | null {
	if (!browser) return null;
	try {
		const value = localStorage.getItem(key);
		return value ? (JSON.parse(value) as T) : null;
	} catch {
		return null;
	}
}

function write<T>(key: string, value: T) {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Storage can be disabled by a browser policy. The app still works without persistence.
	}
}

export function loadDismissed(): Set<string> {
	return new Set(read<string[]>(DISMISSED) ?? []);
}

export function saveDismissed(value: Set<string>) {
	write(DISMISSED, [...value]);
}

export function loadHand(date: string): string[] | null {
	const saved = read<{ date: string; ids: string[] }>(HAND);
	return saved?.date === date ? saved.ids : null;
}

export function saveHand(date: string, ids: string[]) {
	write(HAND, { date, ids });
}
