import type { PinnedResponse } from '$lib/types';

const emptyPinned = (): PinnedResponse => ({
	sections: [],
	fetchedAt: new Date().toISOString(),
	source: 'error'
});

export async function loadPinned(): Promise<PinnedResponse> {
	try {
		const response = await fetch('/data/pinned.json');
		if (!response.ok) return emptyPinned();
		return (await response.json()) as PinnedResponse;
	} catch {
		return emptyPinned();
	}
}
