import {
	igdbImage,
	pickBestNameMatch,
	searchIgdbGame,
	type IgdbGameRecord
} from '$lib/igdb';
import { lookupMetacriticRating } from '$lib/server/metacritic';
import type { ApiKeys, GameMeta, GameRatings, MediaItem, RatingScore } from '$lib/types';

const MAX_SCREENSHOTS = 10;
const MAX_ARTWORKS = 4;

type LookupOptions = {
	releaseDate?: string;
	searchAs?: string[];
	igdbId?: number;
};

async function steamGridDbSearch(name: string, key: string) {
	const headers = { Authorization: `Bearer ${key}` };
	const search = await fetch(
		`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(name)}`,
		{ headers }
	);
	if (!search.ok) return null;
	const searchJson = await search.json();
	const results = searchJson.data ?? [];
	return pickBestNameMatch(name, results, 60);
}

async function steamGridDbCover(
	name: string,
	key?: string,
	searchAs?: string[]
): Promise<MediaItem | null> {
	if (!key) return null;

	const terms = [name, ...(searchAs ?? [])];
	for (const term of terms) {
		try {
			const match = await steamGridDbSearch(term, key);
			if (!match?.id) continue;

			const headers = { Authorization: `Bearer ${key}` };
			const grids = await fetch(
				`https://www.steamgriddb.com/api/v2/grids/game/${match.id}?dimensions=600x900&types=static`,
				{ headers }
			);
			if (!grids.ok) continue;
			const gridsJson = await grids.json();
			const url = gridsJson.data?.[0]?.url;
			if (url) return { url, fit: 'cover', source: 'steamgriddb', kind: 'cover' };
		} catch {
			continue;
		}
	}

	return null;
}

function igdbMediaFromGame(game: IgdbGameRecord): MediaItem[] {
	const items: MediaItem[] = [];

	if (game.cover?.image_id) {
		items.push({
			url: igdbImage(game.cover.image_id, 'cover_big'),
			fit: 'cover',
			source: 'igdb',
			kind: 'cover'
		});
	}

	for (const shot of game.screenshots?.slice(0, MAX_SCREENSHOTS) ?? []) {
		if (shot.image_id) {
			items.push({
				url: igdbImage(shot.image_id, 'screenshot_huge'),
				fit: 'cover',
				source: 'igdb',
				kind: 'screenshot'
			});
		}
	}

	for (const art of game.artworks?.slice(0, MAX_ARTWORKS) ?? []) {
		if (art.image_id) {
			items.push({
				url: igdbImage(art.image_id, '1080p'),
				fit: 'cover',
				source: 'igdb',
				kind: 'hero'
			});
		}
	}

	return items;
}

function websiteUrl(game: IgdbGameRecord, host: string): string | undefined {
	return game.websites?.find((site) => site.url?.includes(host))?.url;
}

function ratingsFromIgdb(game: IgdbGameRecord): GameRatings {
	const scores: RatingScore[] = [];

	if (game.aggregated_rating != null) {
		scores.push({
			source: 'igdb-critics',
			label: 'Critics',
			score: Math.round(game.aggregated_rating),
			count: game.aggregated_rating_count
		});
	}

	if (game.rating != null) {
		scores.push({
			source: 'igdb-players',
			label: 'Players',
			score: Math.round(game.rating),
			count: game.rating_count
		});
	}

	const metacriticUrl = websiteUrl(game, 'metacritic.com');
	if (metacriticUrl) {
		scores.push({ source: 'metacritic', label: 'Metacritic', url: metacriticUrl });
	}

	const opencritic = websiteUrl(game, 'opencritic.com');
	if (opencritic) {
		scores.push({ source: 'opencritic', label: 'OpenCritic', url: opencritic });
	}

	const bestCritic = scores.find((s) => s.source === 'igdb-critics')?.score;
	const bestPlayers = scores.find((s) => s.source === 'igdb-players')?.score;

	return { scores, bestCritic, bestPlayers };
}

async function openCriticRating(name: string, key?: string): Promise<RatingScore | null> {
	if (!key) return null;

	try {
		const search = await fetch(
			`https://opencritic-api.p.rapidapi.com/game/search?criteria=${encodeURIComponent(name)}`,
			{
				headers: {
					'x-rapidapi-key': key,
					'x-rapidapi-host': 'opencritic-api.p.rapidapi.com'
				}
			}
		);
		if (!search.ok) return null;
		const results = await search.json();
		const match = pickBestNameMatch(name, results ?? [], 60);
		if (!match?.id) return null;

		const detail = await fetch(`https://opencritic-api.p.rapidapi.com/game/${match.id}`, {
			headers: {
				'x-rapidapi-key': key,
				'x-rapidapi-host': 'opencritic-api.p.rapidapi.com'
			}
		});
		if (!detail.ok) return null;
		const game = await detail.json();
		if (!game?.topCriticScore) return null;

		return {
			source: 'opencritic',
			label: 'OpenCritic',
			score: Math.round(game.topCriticScore),
			url: `https://opencritic.com/game/${match.id}`
		};
	} catch {
		return null;
	}
}

function dedupe(items: MediaItem[]): MediaItem[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		if (seen.has(item.url)) return false;
		seen.add(item.url);
		return true;
	});
}

function mergeMedia(cover: MediaItem | null, igdb: MediaItem[]): MediaItem[] {
	const items: MediaItem[] = [];
	if (cover) items.push(cover);

	const igdbCover = igdb.find((item) => item.kind === 'cover');
	if (!cover && igdbCover) items.push(igdbCover);

	const screenshots = igdb.filter((item) => item.kind === 'screenshot');
	if (screenshots.length) {
		items.push(...screenshots);
	} else {
		items.push(...igdb.filter((item) => item.kind === 'hero'));
	}

	return dedupe(items);
}

function upsertScore(scores: RatingScore[], score: RatingScore) {
	const index = scores.findIndex((row) => row.source === score.source);
	if (index >= 0) {
		const existing = scores[index];
		scores[index] = {
			...existing,
			...score,
			score: score.score ?? existing.score,
			url: score.url ?? existing.url
		};
	} else {
		scores.push(score);
	}
}

function mergeRatings(
	igdb: GameRatings,
	openCritic?: RatingScore | null,
	metacritic?: RatingScore | null
): GameRatings {
	const scores = [...igdb.scores];
	if (openCritic?.score) upsertScore(scores, openCritic);
	if (metacritic) upsertScore(scores, metacritic);

	const metacriticScore =
		metacritic?.score ?? scores.find((s) => s.source === 'metacritic' && s.score)?.score;
	const openCriticScore =
		openCritic?.score ?? scores.find((s) => s.source === 'opencritic' && s.score)?.score;

	return {
		scores,
		bestCritic: igdb.bestCritic,
		bestPlayers: igdb.bestPlayers,
		metacritic: metacriticScore,
		openCritic: openCriticScore
	};
}

export async function lookupGameMeta(
	name: string,
	keys: ApiKeys,
	options?: LookupOptions
): Promise<GameMeta> {
	const [sgdbCover, igdbGame, openCritic, metacritic] = await Promise.all([
		steamGridDbCover(name, keys.steamGridDb, options?.searchAs),
		keys.igdbClientId && keys.igdbClientSecret
			? searchIgdbGame(keys.igdbClientId, keys.igdbClientSecret, name, options)
			: Promise.resolve(null),
		openCriticRating(name, keys.openCritic),
		lookupMetacriticRating(name, options?.searchAs)
	]);

	const igdbItems = igdbGame ? igdbMediaFromGame(igdbGame) : [];
	const items = mergeMedia(sgdbCover, igdbItems);
	const ratings = mergeRatings(
		igdbGame ? ratingsFromIgdb(igdbGame) : { scores: [] },
		openCritic,
		metacritic
	);

	return { items, ratings };
}

export async function lookupRemoteMedia(
	name: string,
	keys: ApiKeys,
	options?: LookupOptions
): Promise<MediaItem[]> {
	return (await lookupGameMeta(name, keys, options)).items;
}
