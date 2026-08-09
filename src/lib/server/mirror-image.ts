import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodeHtmlEntities } from '$lib/html';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

const EXT_FOR_TYPE: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp'
};

const IMAGE_URL_RE = /https:\/\/www\.metacritic\.com\/a\/img\/resize\/[^"'\s)]+/g;

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

/**
 * Downloads a Metacritic cover server-side (with page cookies) and saves it under static/art/.
 * Returns the public path (e.g. /art/releases/foo.jpg) or undefined on failure.
 */
export async function mirrorMetacriticCover(
	slug: string,
	category: 'releases' | 'upcoming'
): Promise<string | undefined> {
	const baseName = `${category}/${slug}`;
	const publicBase = `/art/${baseName}`;

	for (const ext of ['.jpg', '.png', '.webp']) {
		if (existsSync(`static${publicBase}${ext}`)) return `${publicBase}${ext}`;
	}

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
		const diskPath = `static${publicBase}${ext}`;
		const publicPath = `${publicBase}${ext}`;

		mkdirSync(dirname(diskPath), { recursive: true });
		writeFileSync(diskPath, Buffer.from(await imageResponse.arrayBuffer()));
		return publicPath;
	}

	return undefined;
}
