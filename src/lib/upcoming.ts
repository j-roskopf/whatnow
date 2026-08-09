import { isBrowserSafeImageUrl } from '$lib/html';
import type { GameMeta } from '$lib/types';

function sanitizeMeta(meta: Record<string, GameMeta>): Record<string, GameMeta> {
	const cleaned: Record<string, GameMeta> = {};
	for (const [id, entry] of Object.entries(meta)) {
		const items = entry.items.filter((item) => isBrowserSafeImageUrl(item.url));
		if (items.length || entry.ratings.scores.length) {
			cleaned[id] = { ...entry, items };
		}
	}
	return cleaned;
}

export async function loadUpcomingMeta(): Promise<Record<string, GameMeta>> {
	try {
		const response = await fetch('/data/upcoming-meta.json');
		if (!response.ok) return {};
		return sanitizeMeta((await response.json()) as Record<string, GameMeta>);
	} catch {
		return {};
	}
}
