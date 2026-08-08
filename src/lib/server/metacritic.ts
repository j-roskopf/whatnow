import { load, type Cheerio, type Element } from 'cheerio';
import { getGameReviews } from 'unofficial-metacritic';
import { pickBestNameMatch } from '$lib/igdb';
import type {
	MetacriticPlatform,
	MetacriticRelease,
	MetacriticReleasesResponse,
	RatingScore
} from '$lib/types';

const BASE_URL = 'https://www.metacritic.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; WhatNow/1.0)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RELEASES_CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = { expires: number; data: RatingScore | null };
const cache = new Map<string, CacheEntry>();

type ReleasesCacheEntry = { expires: number; data: MetacriticReleasesResponse };
const releasesCache = new Map<string, ReleasesCacheEntry>();

const METACRITIC_PLATFORMS: MetacriticPlatform[] = ['ps5', 'ps4', 'xbox-series-x', 'pc'];

function isMetacriticPlatform(value?: string): MetacriticPlatform | null {
	if (value && METACRITIC_PLATFORMS.includes(value as MetacriticPlatform)) {
		return value as MetacriticPlatform;
	}
	return null;
}

function slugify(name: string) {
	return name
		.toLowerCase()
		.replace(/[™®©]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function searchVariants(name: string, searchAs?: string[]) {
	const terms = new Set<string>();
	const push = (value?: string) => {
		const trimmed = value?.trim();
		if (trimmed) terms.add(trimmed);
	};
	push(name);
	for (const alias of searchAs ?? []) push(alias);
	push(name.replace(/\s+(ps4|ps5|xbox|pc|windows).*$/i, '').trim());
	push(name.replace(/[™®©]/g, '').trim());
	return [...terms];
}

function parseJsonLdRatings(html: string, pageUrl: string): RatingScore | null {
	const $ = load(html);
	const scripts = $('script[type="application/ld+json"]');
	for (let index = 0; index < scripts.length; index += 1) {
		const raw = scripts.eq(index).html();
		if (!raw) continue;
		try {
			const json = JSON.parse(raw);
			const rating = json?.aggregateRating;
			if (!rating?.ratingValue) continue;
			const score = Math.round(Number(rating.ratingValue));
			if (!Number.isFinite(score)) continue;
			return {
				source: 'metacritic',
				label: 'Metacritic',
				score,
				url: pageUrl,
				count: rating.reviewCount ? Number(rating.reviewCount) : undefined
			};
		} catch {
			continue;
		}
	}
	return null;
}

async function fetchGamePage(slug: string): Promise<RatingScore | null> {
	const pageUrl = `${BASE_URL}/game/${slug}/`;
	try {
		const response = await fetch(pageUrl, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }
		});
		if (!response.ok) return null;
		return parseJsonLdRatings(await response.text(), pageUrl);
	} catch {
		return null;
	}
}

async function browseFallback(name: string): Promise<RatingScore | null> {
	try {
		const platforms = ['ps5', 'ps4', 'xbox-series-x', 'pc'] as const;
		for (const platform of platforms) {
			const results = await getGameReviews({
				filterBy: 'available',
				platform,
				sortBy: 'name'
			});
			if (!results?.length) continue;
			const candidates = results
				.filter((row) => row?.title)
				.map((row) => ({ name: row.title as string, score: row.score as number | null }));
			const match = pickBestNameMatch(name, candidates, 72);
			if (!match?.score) continue;
			const slug = slugify(match.name);
			return {
				source: 'metacritic',
				label: 'Metacritic',
				score: Math.round(match.score),
				url: `${BASE_URL}/game/${slug}/`
			};
		}
	} catch {
		// Browse scrape is best-effort when Metacritic changes layout.
	}
	return null;
}

function parseReleaseDateLabel(label?: string): string | undefined {
	if (!label?.trim()) return undefined;
	const parsed = new Date(label.trim());
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed.toISOString().slice(0, 10);
}

function slugFromHref(href?: string): string | undefined {
	if (!href) return undefined;
	const match = href.match(/\/game\/([^/]+)/);
	return match?.[1];
}

function firstSrcsetUrl(srcset?: string): string | undefined {
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

function normalizeMetacriticImageUrl(url?: string): string | undefined {
	if (!url?.includes('metacritic.com/a/img')) return undefined;
	return upscaleMetacriticImage(url);
}

function extractImageFromHtml(html: string): string | undefined {
	const srcsetMatch = html.match(
		/srcset="(https:\/\/www\.metacritic\.com\/a\/img\/resize\/[^"]+)"/i
	);
	if (srcsetMatch) return normalizeMetacriticImageUrl(firstSrcsetUrl(srcsetMatch[1]));

	const srcMatch = html.match(
		/src="(https:\/\/www\.metacritic\.com\/a\/img\/resize\/[^"]+)"/i
	);
	if (srcMatch) return normalizeMetacriticImageUrl(srcMatch[1]);

	return undefined;
}

function extractProductImage($card: Cheerio<Element>): string | undefined {
	const container = $card.find('[data-testid="product-image"]');
	const img = container.find('img').first();
	const fromSrc = normalizeMetacriticImageUrl(img.attr('src'));
	if (fromSrc) return fromSrc;

	const srcset = img.attr('srcset') || container.find('picture img').first().attr('srcset');
	const fromSrcset = normalizeMetacriticImageUrl(firstSrcsetUrl(srcset));
	if (fromSrcset) return fromSrcset;

	return undefined;
}

function mapLibraryRelease(
	row: {
		title?: string | null;
		poster?: string | null;
		score?: number | null;
		release_date?: string | null;
	},
	platform: MetacriticPlatform
): MetacriticRelease | null {
	const name = row.title?.trim();
	if (!name) return null;
	const id = slugify(name);
	return {
		id,
		name,
		releaseDate: parseReleaseDateLabel(row.release_date ?? undefined),
		releaseDateLabel: row.release_date?.trim() || undefined,
		score: row.score ?? undefined,
		url: `${BASE_URL}/game/${id}/`,
		imageUrl: row.poster ?? undefined,
		platform
	};
}

function parseBrowseReleases(html: string, platform: MetacriticPlatform): MetacriticRelease[] {
	const $ = load(html);
	const releases: MetacriticRelease[] = [];

	$('div[data-testid="filter-results"]').each((_, element) => {
		const $card = $(element);
		const href = $card.find('a[href*="/game/"]').first().attr('href');
		const slug = slugFromHref(href);
		const name = $card.find('[data-testid="product-title"] span').first().text().trim();
		if (!slug || !name) return;

		const releaseDateLabel = $card.find('.uppercase.mb-1 span').first().text().trim();
		const summary = $card.find('.line-clamp-2 span').first().text().trim();
		const imageUrl = extractProductImage($card);
		const scoreAlt = $card.find('[data-testid="score-badge"] img').attr('alt') ?? '';
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

async function fetchGamePageImage(slug: string): Promise<string | undefined> {
	const pageUrl = `${BASE_URL}/game/${slug}/`;
	try {
		const response = await fetch(pageUrl, {
			headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
			redirect: 'follow'
		});
		if (!response.ok) return undefined;
		return extractImageFromHtml(await response.text());
	} catch {
		return undefined;
	}
}

const gameImageCache = new Map<string, string | undefined>();

async function enrichReleaseImages(releases: MetacriticRelease[]): Promise<MetacriticRelease[]> {
	const missing = releases.filter((release) => !release.imageUrl);
	if (!missing.length) return releases;

	const updates = new Map<string, string>();
	const chunkSize = 6;

	for (let index = 0; index < missing.length; index += chunkSize) {
		const chunk = missing.slice(index, index + chunkSize);
		await Promise.all(
			chunk.map(async (release) => {
				const cached = gameImageCache.get(release.id);
				if (cached) {
					updates.set(release.id, cached);
					return;
				}
				const imageUrl = await fetchGamePageImage(release.id);
				if (imageUrl) {
					gameImageCache.set(release.id, imageUrl);
					updates.set(release.id, imageUrl);
				} else {
					gameImageCache.set(release.id, undefined);
				}
			})
		);
	}

	if (!updates.size) return releases;
	return releases.map((release) => {
		const imageUrl = release.imageUrl ?? updates.get(release.id);
		return imageUrl ? { ...release, imageUrl } : release;
	});
}

async function fetchBrowseHtml(platform: MetacriticPlatform): Promise<string | null> {
	try {
		const response = await fetch(
			`${BASE_URL}/browse/games/release-date/new-releases/${platform}/date`,
			{
				headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
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
	let source = 'Metacritic new releases';

	try {
		const libraryRows = await getGameReviews({
			filterBy: 'new-releases',
			platform,
			sortBy: 'date'
		});
		if (libraryRows?.length) {
			releases = libraryRows
				.map((row) => mapLibraryRelease(row, platform))
				.filter((row): row is MetacriticRelease => Boolean(row));
			source = 'unofficial-metacritic';
		}
	} catch {
		// Library scrape may fail when Metacritic changes layout.
	}

	if (!releases.length) {
		const html = await fetchBrowseHtml(platform);
		if (html) {
			releases = parseBrowseReleases(html, platform);
			source = 'Metacritic browse';
		}
	}

	if (releases.length) {
		releases = await enrichReleaseImages(releases);
	}

	const payload: MetacriticReleasesResponse = {
		releases,
		platform,
		fetchedAt: new Date().toISOString(),
		source
	};
	releasesCache.set(platform, { expires: Date.now() + RELEASES_CACHE_TTL_MS, data: payload });
	return payload;
}

export function parseMetacriticPlatform(value?: string): MetacriticPlatform {
	return isMetacriticPlatform(value) ?? 'ps5';
}

export async function lookupMetacriticRating(
	name: string,
	searchAs?: string[]
): Promise<RatingScore | null> {
	const key = name.toLowerCase();
	const cached = cache.get(key);
	if (cached && Date.now() < cached.expires) return cached.data;

	for (const term of searchVariants(name, searchAs)) {
		const slug = slugify(term);
		if (!slug) continue;
		const hit = await fetchGamePage(slug);
		if (hit) {
			cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: hit });
			return hit;
		}
	}

	const browse = await browseFallback(name);
	cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data: browse });
	return browse;
}
