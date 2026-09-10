import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodeHtmlEntities } from '$lib/html';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

const EXT_FOR_TYPE: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp'
};

const TYPE_FOR_EXT: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp'
};

const IMAGE_URL_RE = /https:\/\/www\.metacritic\.com\/a\/img\/resize\/[^"'\s)]+/g;

export type MirroredCover = {
	body: Buffer;
	type: string;
	/** Public path when persisted under static/ (build-time / local only). */
	publicPath?: string;
};

function coverCandidates(html: string): string[] {
	const seen = new Set<string>();
	const urls: string[] = [];
	for (const match of html.matchAll(IMAGE_URL_RE)) {
		const url = decodeHtmlEntities(match[0]);
		if (seen.has(url)) continue;
		seen.add(url);
		urls.push(url);
	}
	return urls.sort((a, b) => {
		const aCrop = a.includes('fit=crop') ? 0 : 1;
		const bCrop = b.includes('fit=crop') ? 0 : 1;
		return aCrop - bCrop;
	});
}

function readExistingCover(
	slug: string,
	category: 'releases' | 'upcoming'
): MirroredCover | undefined {
	const bases = [
		`static/art/${category}/${slug}`,
		`/tmp/whatnow-art/${category}/${slug}`
	];

	for (const base of bases) {
		for (const [ext, type] of Object.entries(TYPE_FOR_EXT)) {
			const path = `${base}${ext}`;
			if (!existsSync(path)) continue;
			return {
				body: readFileSync(path),
				type,
				publicPath: base.startsWith('static/') ? `/art/${category}/${slug}${ext}` : undefined
			};
		}
	}

	return undefined;
}

function tryWrite(path: string, body: Buffer) {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, body);
		return true;
	} catch {
		// Vercel (and similar) keep the deploy FS read-only; /tmp may still work.
		return false;
	}
}

/**
 * Fetches a Metacritic cover server-side (with page cookies).
 * Returns image bytes for the API response. Best-effort disk cache only —
 * never required, so serverless read-only filesystems stay healthy.
 */
export async function fetchMirroredCover(
	slug: string,
	category: 'releases' | 'upcoming'
): Promise<MirroredCover | undefined> {
	const existing = readExistingCover(slug, category);
	if (existing) return existing;

	const pageUrl = `https://www.metacritic.com/game/${slug}/`;
	let pageResponse: Response;
	try {
		pageResponse = await fetch(pageUrl, {
			headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
			redirect: 'follow'
		});
	} catch {
		return undefined;
	}
	if (!pageResponse.ok) return undefined;

	const cookies =
		pageResponse.headers
			.getSetCookie?.()
			.map((cookie) => cookie.split(';')[0])
			.join('; ') ?? '';

	const html = await pageResponse.text();
	const candidates = coverCandidates(html);
	if (!candidates.length) return undefined;

	const imageHeaders = {
		'User-Agent': BROWSER_UA,
		Referer: pageUrl,
		Accept: 'image/*',
		...(cookies ? { Cookie: cookies } : {})
	};

	for (const imageUrl of candidates) {
		let imageResponse: Response;
		try {
			imageResponse = await fetch(imageUrl, { headers: imageHeaders });
		} catch {
			continue;
		}
		if (!imageResponse.ok) continue;

		const contentType = imageResponse.headers.get('content-type')?.split(';')[0]?.trim();
		if (!contentType?.startsWith('image/')) continue;

		const ext = EXT_FOR_TYPE[contentType] || '.jpg';
		const body = Buffer.from(await imageResponse.arrayBuffer());
		const publicPath = `/art/${category}/${slug}${ext}`;

		const wroteStatic = tryWrite(`static${publicPath}`, body);
		tryWrite(`/tmp/whatnow-art/${category}/${slug}${ext}`, body);

		return {
			body,
			type: contentType,
			publicPath: wroteStatic ? publicPath : undefined
		};
	}

	return undefined;
}

/**
 * Downloads a Metacritic cover and returns the public static path when possible.
 * Used by generate-data at build time; on Vercel prefer fetchMirroredCover.
 */
export async function mirrorMetacriticCover(
	slug: string,
	category: 'releases' | 'upcoming'
): Promise<string | undefined> {
	const mirrored = await fetchMirroredCover(slug, category);
	return mirrored?.publicPath;
}
