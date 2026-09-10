export function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

export function normalizeImageUrl(url?: string | null): string | undefined {
	if (!url) return undefined;
	return decodeHtmlEntities(url.trim());
}

/**
 * CDNs that refuse browser hotlinking from our origin (typically Cloudflare 403).
 * Catalog JSON may still store these; never put them in <img src>.
 */
const BLOCKED_IMAGE_HOST_SNIPPETS = [
	'metacritic.com/a/img',
	'hb.imgix.net'
] as const;

/** True when the URL can be used directly as an <img src> from the browser. */
export function isBrowserSafeImageUrl(url?: string | null): boolean {
	const normalized = normalizeImageUrl(url);
	if (!normalized) return false;
	return !BLOCKED_IMAGE_HOST_SNIPPETS.some((snippet) => normalized.includes(snippet));
}

export function pickDisplayImageUrl(...candidates: (string | undefined | null)[]): string | undefined {
	for (const candidate of candidates) {
		const url = normalizeImageUrl(candidate);
		if (url && isBrowserSafeImageUrl(url)) return url;
	}
	return undefined;
}

const LOCAL_ART_EXTENSIONS = ['.jpg', '.png', '.webp'] as const;

/** Static paths mirrored at build time (or via /api/cover on demand). */
export function localReleaseArtPaths(slug: string): string[] {
	return LOCAL_ART_EXTENSIONS.map((ext) => `/art/releases/${slug}${ext}`);
}

export function localUpcomingArtPaths(slug: string): string[] {
	return LOCAL_ART_EXTENSIONS.map((ext) => `/art/upcoming/${slug}${ext}`);
}
