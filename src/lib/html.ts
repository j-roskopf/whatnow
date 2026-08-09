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
