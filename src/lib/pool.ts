import type { PoolResponse } from '$lib/types';
import { dedupeById } from '$lib/dedupe';

export async function loadPool(options?: { fast?: boolean }): Promise<PoolResponse> {
	try {
		const file = options?.fast ? '/data/pool-fast.json' : '/data/pool.json';
		const response = await fetch(file);
		if (!response.ok) {
			return { games: [], fetchedAt: new Date().toISOString(), source: 'error' };
		}
		const data = (await response.json()) as PoolResponse;
		return { ...data, games: dedupeById(data.games ?? []) };
	} catch {
		return { games: [], fetchedAt: new Date().toISOString(), source: 'error' };
	}
}
