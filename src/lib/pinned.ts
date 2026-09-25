import type { PinnedResponse } from '$lib/types';
import { dedupeById } from '$lib/dedupe';

const emptyPinned = (): PinnedResponse => ({
	sections: [],
	fetchedAt: new Date().toISOString(),
	source: 'error'
});

export async function loadPinned(): Promise<PinnedResponse> {
	try {
		const response = await fetch('/data/pinned.json');
		if (!response.ok) return emptyPinned();
		const data = (await response.json()) as PinnedResponse;
		return {
			...data,
			sections: (data.sections ?? []).map((section) => ({
				...section,
				entries: dedupeById(section.entries ?? [])
			}))
		};
	} catch {
		return emptyPinned();
	}
}
