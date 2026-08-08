import type { PoolResponse } from '$lib/types';

export async function loadPool(options?: { fast?: boolean }): Promise<PoolResponse> {
	try {
		const file = options?.fast ? '/data/pool-fast.json' : '/data/pool.json';
		const response = await fetch(file);
		if (!response.ok) {
			return { games: [], fetchedAt: new Date().toISOString(), source: 'error' };
		}
		return (await response.json()) as PoolResponse;
	} catch {
		return { games: [], fetchedAt: new Date().toISOString(), source: 'error' };
	}
}
