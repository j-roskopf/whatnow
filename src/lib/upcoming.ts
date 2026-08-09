import type { GameMeta } from '$lib/types';

export async function loadUpcomingMeta(): Promise<Record<string, GameMeta>> {
	try {
		const response = await fetch('/data/upcoming-meta.json');
		if (!response.ok) return {};
		return (await response.json()) as Record<string, GameMeta>;
	} catch {
		return {};
	}
}
