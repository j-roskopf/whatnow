import type { MetacriticPlatform, MetacriticRelease, MetacriticReleasesResponse } from '$lib/types';

const BASE_URL = 'https://www.metacritic.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; WhatNow/1.0)';
const RELEASES_CACHE_TTL_MS = 30 * 60 * 1000;

type ReleasesCacheEntry = { expires: number; data: MetacriticReleasesResponse };
const releasesCache = new Map<string, ReleasesCacheEntry>();

function parseReleaseDateLabel(label?: string): string | undefined {
	if (!label?.trim()) return undefined;
	const parsed = new Date(label.trim());
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed.toISOString().slice(0, 10);
}

function slugFromHref(href?: string | null): string | undefined {
	if (!href) return undefined;
	const match = href.match(/\/game\/([^/]+)/);
	return match?.[1];
}

function firstSrcsetUrl(srcset?: string | null): string | undefined {
	if (!srcset?.trim()) return undefined;
	const parts = srcset.split(',').map((part) => part.trim());
	const last = parts[parts.length - 1] ?? parts[0];
	return last?.split(/\s+/)[0];
}

function upscaleMetacriticImage(url: string): string {
	return url
		.replace(/([?&])width=\d+/i, '$1width=300')
		.replace(/([?&])height=\d+/i, '$1height=450');
}

function normalizeMetacriticImageUrl(url?: string | null): string | undefined {
	if (!url?.includes('metacritic.com/a/img')) return undefined;
	return upscaleMetacriticImage(url);
}

function extractProductImage(card: Element): string | undefined {
	const container = card.querySelector('[data-testid="product-image"]');
	const img = container?.querySelector('img');
	const fromSrc = normalizeMetacriticImageUrl(img?.getAttribute('src'));
	if (fromSrc) return fromSrc;

	const srcset = img?.getAttribute('srcset') || container?.querySelector('picture img')?.getAttribute('srcset');
	return normalizeMetacriticImageUrl(firstSrcsetUrl(srcset));
}

function parseBrowseReleases(html: string, platform: MetacriticPlatform): MetacriticRelease[] {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const releases: MetacriticRelease[] = [];

	doc.querySelectorAll('div[data-testid="filter-results"]').forEach((card) => {
		const href = card.querySelector('a[href*="/game/"]')?.getAttribute('href');
		const slug = slugFromHref(href);
		const name = card.querySelector('[data-testid="product-title"] span')?.textContent?.trim();
		if (!slug || !name) return;

		const releaseDateLabel = card.querySelector('.uppercase.mb-1 span')?.textContent?.trim();
		const summary = card.querySelector('.line-clamp-2 span')?.textContent?.trim();
		const imageUrl = extractProductImage(card);
		const scoreAlt = card.querySelector('[data-testid="score-badge"] img')?.getAttribute('alt') ?? '';
		const scoreMatch = scoreAlt.match(/\d+/);
		const score = scoreMatch ? Number(scoreMatch[0]) : undefined;

		releases.push({
			id: slug,
			name,
			releaseDate: parseReleaseDateLabel(releaseDateLabel),
			releaseDateLabel: releaseDateLabel || undefined,
			score: Number.isFinite(score) ? score : undefined,
			url: `${BASE_URL}/game/${slug}/`,
			imageUrl: imageUrl || undefined,
			summary: summary || undefined,
			platform
		});
	});

	return releases;
}

async function fetchBrowseHtml(platform: MetacriticPlatform): Promise<string | null> {
	try {
		const response = await fetch(
			`${BASE_URL}/browse/games/release-date/new-releases/${platform}/date`,
			{
				headers: { Accept: 'text/html' },
				redirect: 'follow'
			}
		);
		if (!response.ok) return null;
		return await response.text();
	} catch {
		return null;
	}
}

export async function fetchMetacriticNewReleases(
	platform: MetacriticPlatform
): Promise<MetacriticReleasesResponse> {
	const cached = releasesCache.get(platform);
	if (cached && Date.now() < cached.expires) return cached.data;

	let releases: MetacriticRelease[] = [];
	let source = 'Metacritic browse';

	const html = await fetchBrowseHtml(platform);
	if (html) releases = parseBrowseReleases(html, platform);

	const payload: MetacriticReleasesResponse = {
		releases,
		platform,
		fetchedAt: new Date().toISOString(),
		source
	};
	releasesCache.set(platform, { expires: Date.now() + RELEASES_CACHE_TTL_MS, data: payload });
	return payload;
}
