import { bestCriticScore } from '$lib/browse';
import {
	cleanLookupName,
	curateByReception,
	GOOD_RECEPTION_MIN
} from '$lib/curation';
import { lookupGameMeta } from '$lib/server/game-meta';
import { pickBestNameMatch } from '$lib/igdb';
import { lookupMetacriticRating } from '$lib/server/metacritic';
import type { ApiKeys, CatalogEntry, GameRatings, MetacriticPlatform } from '$lib/types';
import { getGameReviews } from 'unofficial-metacritic';

const env = process.env;

const INDEX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_MIN_SCORE = 70;
const DEFAULT_MAX_FALLBACK = 24;

type ScoredCandidate = { name: string; score: number };

let indexCache: { expires: number; entries: ScoredCandidate[] } | null = null;
let indexPromise: Promise<ScoredCandidate[]> | null = null;

function serverApiKeys(): ApiKeys {
	return {
		igdbClientId: env.IGDB_CLIENT_ID?.trim() || undefined,
		igdbClientSecret: env.IGDB_CLIENT_SECRET?.trim() || undefined,
		openCritic: env.OPENCRITIC_API_KEY?.trim() || undefined
	};
}

async function buildMetacriticScoreIndex(): Promise<ScoredCandidate[]> {
	if (indexCache && Date.now() < indexCache.expires) return indexCache.entries;
	if (indexPromise) return indexPromise;

	indexPromise = (async () => {
		const byName = new Map<string, ScoredCandidate>();
		const platforms: MetacriticPlatform[] = ['ps5', 'ps4', 'xbox-series-x', 'pc'];

		for (const platform of platforms) {
			try {
				const rows = await getGameReviews({
					filterBy: 'available',
					platform,
					sortBy: 'metascore'
				});
				for (const row of rows ?? []) {
					const name = row.title?.trim();
					const score = row.score;
					if (!name || score == null) continue;
					const rounded = Math.round(score);
					const key = name.toLowerCase();
					const existing = byName.get(key);
					if (!existing || rounded > existing.score) {
						byName.set(key, { name, score: rounded });
					}
				}
			} catch {
				continue;
			}
		}

		const entries = [...byName.values()];
		indexCache = { expires: Date.now() + INDEX_CACHE_TTL_MS, entries };
		return entries;
	})();

	try {
		return await indexPromise;
	} finally {
		indexPromise = null;
	}
}

function scoreFromIndex(name: string, index: ScoredCandidate[]): number | undefined {
	const match = pickBestNameMatch(cleanLookupName(name), index, 72);
	return match?.score;
}

function ratingsFromMetacriticScore(score: number): GameRatings {
	return {
		scores: [{ source: 'metacritic', label: 'Metacritic', score }],
		metacritic: score
	};
}

function criticScoresFromRatings(ratingsMap: Map<string, GameRatings>): Map<string, number> {
	const scores = new Map<string, number>();
	for (const [id, ratings] of ratingsMap) {
		const best = bestCriticScore(ratings);
		if (best >= 0) scores.set(id, best);
	}
	return scores;
}

async function lookupReceptionRatings(name: string): Promise<GameRatings> {
	const keys = serverApiKeys();
	const lookupName = cleanLookupName(name);
	const meta = await lookupGameMeta(lookupName, keys);
	if (bestCriticScore(meta.ratings) >= 0) return meta.ratings;

	const metacritic = await lookupMetacriticRating(lookupName);
	if (metacritic?.score != null) {
		return {
			scores: [metacritic],
			metacritic: metacritic.score
		};
	}

	return meta.ratings;
}

export async function scoreCatalogEntries(
	entries: CatalogEntry[],
	options?: { maxFallback?: number }
): Promise<Map<string, GameRatings>> {
	const maxFallback = options?.maxFallback ?? DEFAULT_MAX_FALLBACK;
	const index = await buildMetacriticScoreIndex();
	const ratingsMap = new Map<string, GameRatings>();
	const missing: CatalogEntry[] = [];

	for (const entry of entries) {
		const indexed = scoreFromIndex(entry.name, index);
		if (indexed != null) {
			ratingsMap.set(entry.id, ratingsFromMetacriticScore(indexed));
		} else {
			missing.push(entry);
		}
	}

	if (!maxFallback || !missing.length) return ratingsMap;

	const chunkSize = 6;
	const toLookup = missing.slice(0, maxFallback);
	for (let offset = 0; offset < toLookup.length; offset += chunkSize) {
		const chunk = toLookup.slice(offset, offset + chunkSize);
		await Promise.all(
			chunk.map(async (entry) => {
				const ratings = await lookupReceptionRatings(entry.name);
				if (bestCriticScore(ratings) >= 0) ratingsMap.set(entry.id, ratings);
			})
		);
	}

	return ratingsMap;
}

function enrichWithRatings(
	entries: CatalogEntry[],
	ratingsMap: Map<string, GameRatings>
): CatalogEntry[] {
	return entries.map((entry) => {
		const ratings = ratingsMap.get(entry.id);
		return ratings?.scores.length ? { ...entry, ratings } : entry;
	});
}

function curateWithFallback(
	entries: CatalogEntry[],
	scores: Map<string, number>
): CatalogEntry[] {
	if (!entries.length) return [];
	if (!scores.size) return entries;

	let curated = curateByReception(entries, scores, GOOD_RECEPTION_MIN);
	if (curated.length >= Math.min(6, entries.length)) return curated;

	const relaxed = curateByReception(entries, scores, FALLBACK_MIN_SCORE);
	if (relaxed.length > curated.length) return relaxed;

	return curated;
}

export async function curateCatalogEntries(
	entries: CatalogEntry[],
	options?: { maxFallback?: number }
): Promise<CatalogEntry[]> {
	if (!entries.length) return [];

	const ratingsMap = await scoreCatalogEntries(entries, options);
	const scores = criticScoresFromRatings(ratingsMap);
	const curated = curateWithFallback(entries, scores);
	return enrichWithRatings(curated, ratingsMap);
}
