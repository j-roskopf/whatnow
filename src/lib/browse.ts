import type {
	BrowseTab,
	CatalogEntry,
	Game,
	GameRatings,
	MinScoreSource,
	RatingSource,
	SortKey
} from '$lib/types';

export function isPsPlus(game: Game) {
	return /ps plus|premium/i.test(game.where) || /ps plus|premium/i.test(game.systemLabel);
}

export function isGamePass(game: Game) {
	return /game pass/i.test(game.where) || /game pass/i.test(game.systemLabel);
}

export function isRetro(game: Game) {
	return game.reason === 'retro';
}

export function isModern(game: Game) {
	return game.reason === 'modern' || game.reason === 'leaving' || game.reason === 'free';
}

export function filterByTab(games: Game[], tab: BrowseTab): Game[] {
	switch (tab) {
		case 'psplus':
			return games.filter(isPsPlus);
		case 'gamepass':
			return games.filter(isGamePass);
		case 'retro':
			return games.filter(isRetro);
		case 'modern':
			return games.filter(isModern);
		default:
			return games;
	}
}

export function parseHours(hours: string): number {
	if (!hours || hours === '—') return -1;
	const trimmed = hours.trim().toLowerCase();
	const minuteMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*m$/);
	if (minuteMatch) return Number(minuteMatch[1]) / 60;
	const hourMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*h?$/);
	if (hourMatch) return Number(hourMatch[1]);
	return -1;
}

export function scoreForSource(
	ratings: GameRatings | undefined,
	source: RatingSource | MinScoreSource
): number {
	if (!ratings) return -1;
	switch (source) {
		case 'igdb-critics':
			return ratings.bestCritic ?? -1;
		case 'metacritic':
			return ratings.metacritic ?? -1;
		case 'opencritic':
			return ratings.openCritic ?? -1;
		case 'igdb-players':
			return ratings.bestPlayers ?? -1;
		default:
			const hit = ratings.scores.find((row) => row.source === source);
			return hit?.score ?? -1;
	}
}

/** Best available critic score from IGDB, Metacritic, or OpenCritic. */
export function bestCriticScore(ratings?: GameRatings): number {
	if (!ratings) return -1;
	const candidates = [ratings.bestCritic, ratings.metacritic, ratings.openCritic].filter(
		(score): score is number => score != null && Number.isFinite(score)
	);
	return candidates.length ? Math.max(...candidates) : -1;
}

export function sortGames(
	games: Game[],
	sort: SortKey,
	ratings: Record<string, GameRatings>
): Game[] {
	const copy = [...games];
	switch (sort) {
		case 'critics':
			return copy.sort(
				(a, b) => scoreForSource(ratings[b.id], 'igdb-critics') - scoreForSource(ratings[a.id], 'igdb-critics')
			);
		case 'metacritic':
			return copy.sort(
				(a, b) => scoreForSource(ratings[b.id], 'metacritic') - scoreForSource(ratings[a.id], 'metacritic')
			);
		case 'opencritic':
			return copy.sort(
				(a, b) => scoreForSource(ratings[b.id], 'opencritic') - scoreForSource(ratings[a.id], 'opencritic')
			);
		case 'players':
			return copy.sort(
				(a, b) => scoreForSource(ratings[b.id], 'igdb-players') - scoreForSource(ratings[a.id], 'igdb-players')
			);
		case 'hours':
			return copy.sort((a, b) => parseHours(b.hours) - parseHours(a.hours));
		case 'name':
			return copy.sort((a, b) => a.name.localeCompare(b.name));
		default:
			return copy;
	}
}

export function sortCatalog(
	entries: CatalogEntry[],
	sort: SortKey,
	ratings: Record<string, GameRatings> = {}
): CatalogEntry[] {
	const copy = [...entries];
	const ratingsFor = (entry: CatalogEntry) => ratings[entry.id] ?? entry.ratings;
	switch (sort) {
		case 'critics':
			return copy.sort(
				(a, b) =>
					scoreForSource(ratingsFor(b), 'igdb-critics') -
					scoreForSource(ratingsFor(a), 'igdb-critics')
			);
		case 'metacritic':
			return copy.sort(
				(a, b) =>
					scoreForSource(ratingsFor(b), 'metacritic') - scoreForSource(ratingsFor(a), 'metacritic')
			);
		case 'opencritic':
			return copy.sort(
				(a, b) =>
					scoreForSource(ratingsFor(b), 'opencritic') - scoreForSource(ratingsFor(a), 'opencritic')
			);
		case 'players':
			return copy.sort(
				(a, b) =>
					scoreForSource(ratingsFor(b), 'igdb-players') -
					scoreForSource(ratingsFor(a), 'igdb-players')
			);
		case 'date':
			return copy.sort((a, b) => {
				const ad = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
				const bd = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
				return bd - ad;
			});
		case 'name':
			return copy.sort((a, b) => a.name.localeCompare(b.name));
		default:
			return copy.sort((a, b) => a.name.localeCompare(b.name));
	}
}

export function filterByMinScore(
	games: Game[],
	minScore: number,
	ratings: Record<string, GameRatings>,
	source: MinScoreSource = 'igdb-critics'
): Game[] {
	if (!minScore) return games;
	return games.filter((game) => scoreForSource(ratings[game.id], source) >= minScore);
}

export function filterCatalogByMinScore(
	entries: CatalogEntry[],
	minScore: number,
	source: MinScoreSource = 'igdb-critics',
	ratings: Record<string, GameRatings> = {}
): CatalogEntry[] {
	if (!minScore) return entries;
	return entries.filter(
		(entry) => scoreForSource(ratings[entry.id] ?? entry.ratings, source) >= minScore
	);
}

export const BROWSE_TABS: { id: BrowseTab; label: string }[] = [
	{ id: 'tonight', label: 'Tonight' },
	{ id: 'random', label: 'Random' },
	{ id: 'psplus', label: 'PS Plus' },
	{ id: 'gamepass', label: 'Game Pass' },
	{ id: 'modern', label: 'Modern' },
	{ id: 'retro', label: 'Retro' },
	{ id: 'new', label: 'New releases' },
	{ id: 'soon', label: 'Landing soon' }
];
