import { error } from '@sveltejs/kit';
import { fetchMirroredCover } from '$lib/server/mirror-image';
import type { RequestHandler } from './$types';

export const prerender = false;

type CoverCategory = 'releases' | 'upcoming';

function parseCategory(value: string | null): CoverCategory {
	return value === 'upcoming' ? 'upcoming' : 'releases';
}

export const GET: RequestHandler = async ({ url }) => {
	const slug = url.searchParams.get('slug')?.trim();
	if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
		error(400, 'Invalid slug');
	}

	const category = parseCategory(url.searchParams.get('category'));
	const mirrored = await fetchMirroredCover(slug, category);
	if (!mirrored) error(404, 'Cover not found');

	return new Response(new Uint8Array(mirrored.body), {
		headers: {
			'Content-Type': mirrored.type,
			'Cache-Control': 'public, max-age=86400, immutable'
		}
	});
};
