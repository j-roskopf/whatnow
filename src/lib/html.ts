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

/** Metacritic's CDN blocks browser hotlinking (Cloudflare 403). */
export function isBrowserSafeImageUrl(url?: string | null): boolean {
	const normalized = normalizeImageUrl(url);
	if (!normalized) return false;
	return !normalized.includes('metacritic.com/a/img');
}

export function pickDisplayImageUrl(...candidates: (string | undefined | null)[]): string | undefined {
	for (const candidate of candidates) {
		const url = normalizeImageUrl(candidate);
		if (url && isBrowserSafeImageUrl(url)) return url;
	}
	return undefined;
}
