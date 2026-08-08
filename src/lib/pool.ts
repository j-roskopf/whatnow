import { fetchLivePool, fetchCatalog } from '$lib/live/catalog';
import type { PoolResponse } from '$lib/types';

export async function loadPool(options?: { fast?: boolean }): Promise<PoolResponse> {
	try {
		return await fetchLivePool({ includeRetro: !options?.fast });
	} catch {
		return { games: [], fetchedAt: new Date().toISOString(), source: 'error' };
	}
}
