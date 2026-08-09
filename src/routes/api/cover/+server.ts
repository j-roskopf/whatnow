import { error } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'node:fs';
import { mirrorMetacriticCover } from '$lib/server/mirror-image';
import type { RequestHandler } from './$types';

export const prerender = false;

const EXT_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp'
};

function readLocalCover(slug: string): { body: Buffer; type: string } | null {
	for (const [ext, type] of Object.entries(EXT_TYPES)) {
		const path = `static/art/releases/${slug}${ext}`;
		if (!existsSync(path)) continue;
		return { body: readFileSync(path), type };
	}
	return null;
}

export const GET: RequestHandler = async ({ url }) => {
	const slug = url.searchParams.get('slug')?.trim();
	if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
		error(400, 'Invalid slug');
	}

	let local = readLocalCover(slug);
	if (!local) {
		const mirrored = await mirrorMetacriticCover(slug, 'releases');
		if (!mirrored) error(404, 'Cover not found');
		local = readLocalCover(slug);
		if (!local) error(404, 'Cover not found');
	}

	return new Response(new Uint8Array(local.body), {
		headers: {
			'Content-Type': local.type,
			'Cache-Control': 'public, max-age=86400, immutable'
		}
	});
};
