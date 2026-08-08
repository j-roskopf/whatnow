const IGDB_IMAGE = 'https://images.igdb.com/igdb/image/upload';

let tokenCache: { token: string; expires: number } | null = null;

export type IgdbGameRecord = {
	id?: number;
	name?: string;
	cover?: { image_id?: string };
	screenshots?: { image_id?: string }[];
	artworks?: { image_id?: string }[];
	aggregated_rating?: number;
	aggregated_rating_count?: number;
	rating?: number;
	rating_count?: number;
	first_release_date?: number;
	websites?: { url?: string; category?: number }[];
};

export function igdbImage(imageId: string, size: string) {
	return `${IGDB_IMAGE}/t_${size}/${imageId}.jpg`;
}

export async function twitchToken(clientId: string, clientSecret: string): Promise<string | null> {
	if (tokenCache && Date.now() < tokenCache.expires) return tokenCache.token;

	try {
		const params = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'client_credentials'
		});
		const response = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
		if (!response.ok) return null;
		const json = await response.json();
		if (!json.access_token) return null;
		tokenCache = {
			token: json.access_token,
			expires: Date.now() + (json.expires_in - 120) * 1000
		};
		return json.access_token;
	} catch {
		return null;
	}
}

export async function igdbQuery(
	token: string,
	clientId: string,
	body: string
): Promise<IgdbGameRecord[]> {
	const response = await fetch('https://api.igdb.com/v4/games', {
		method: 'POST',
		headers: {
			'Client-ID': clientId,
			Authorization: `Bearer ${token}`,
			Accept: 'application/json'
		},
		body
	});
	if (!response.ok) return [];
	return response.json();
}

export function normalizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/['']/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function nameMatchScore(query: string, candidate: string): number {
	const q = normalizeName(query);
	const c = normalizeName(candidate);
	if (!q || !c) return 0;
	if (q === c) return 100;
	if (c.includes(q) || q.includes(c)) return 88;

	const qw = q.split(/\s+/).filter(Boolean);
	const cw = c.split(/\s+/).filter(Boolean);
	if (!qw.length) return 0;

	const overlap = qw.filter((word) => cw.includes(word)).length;
	return (overlap / qw.length) * 75;
}

export function releaseDateScore(targetDate?: string, igdbTimestamp?: number): number {
	if (!targetDate || !igdbTimestamp) return 0;
	const target = new Date(`${targetDate}T12:00:00`).getTime();
	const diffDays = Math.abs(target - igdbTimestamp * 1000) / 86400000;
	if (diffDays <= 45) return 25;
	if (diffDays <= 120) return 18;
	if (diffDays <= 365) return 10;
	if (diffDays <= 730) return 4;
	return 0;
}

export function pickBestIgdbMatch(
	query: string,
	candidates: IgdbGameRecord[],
	releaseDate?: string,
	minNameScore = 52
): IgdbGameRecord | null {
	let best: IgdbGameRecord | null = null;
	let bestScore = minNameScore - 1;

	for (const candidate of candidates) {
		if (!candidate.name) continue;
		const nameScore = nameMatchScore(query, candidate.name);
		const dateScore = releaseDateScore(releaseDate, candidate.first_release_date);
		const total = nameScore + dateScore;
		if (nameScore >= 45 && total > bestScore) {
			bestScore = total;
			best = candidate;
		}
	}

	return best;
}

export function searchTerms(name: string, extra?: string[]): string[] {
	const terms = new Set<string>();
	terms.add(name.trim());

	const withoutSubtitle = name.split(':')[0].trim();
	if (withoutSubtitle) terms.add(withoutSubtitle);

	const withoutApostrophe = name.replace(/['']/g, '').trim();
	if (withoutApostrophe) terms.add(withoutApostrophe);

	if (/^gta\s*6$/i.test(name.trim())) terms.add('Grand Theft Auto VI');

	for (const term of extra ?? []) {
		if (term.trim()) terms.add(term.trim());
	}

	return [...terms];
}

export const IGDB_GAME_FIELDS =
	'name,cover.image_id,screenshots.image_id,artworks.image_id,aggregated_rating,aggregated_rating_count,rating,rating_count,first_release_date,websites.url,websites.category';

export async function fetchIgdbGameById(
	clientId: string,
	clientSecret: string,
	igdbId: number
): Promise<IgdbGameRecord | null> {
	const token = await twitchToken(clientId, clientSecret);
	if (!token) return null;
	const games = await igdbQuery(
		token,
		clientId,
		`fields ${IGDB_GAME_FIELDS}; where id = ${igdbId}; limit 1;`
	);
	return games[0] ?? null;
}

export async function searchIgdbGame(
	clientId: string,
	clientSecret: string,
	name: string,
	options?: { releaseDate?: string; searchAs?: string[]; igdbId?: number }
): Promise<IgdbGameRecord | null> {
	if (options?.igdbId) {
		const byId = await fetchIgdbGameById(clientId, clientSecret, options.igdbId);
		if (byId) return byId;
	}

	const token = await twitchToken(clientId, clientSecret);
	if (!token) return null;

	const minScore = options?.releaseDate ? 58 : 52;

	for (const term of searchTerms(name, options?.searchAs)) {
		const safe = term.replace(/"/g, '');
		const games = await igdbQuery(
			token,
			clientId,
			`search "${safe}"; fields ${IGDB_GAME_FIELDS}; limit 12;`
		);
		const match = pickBestIgdbMatch(term, games, options?.releaseDate, minScore);
		if (match) return match;
	}

	return null;
}

export function pickBestNameMatch<T extends { name: string }>(
	query: string,
	candidates: T[],
	minScore = 55
): T | null {
	let best: T | null = null;
	let bestScore = minScore - 1;
	for (const candidate of candidates) {
		const score = nameMatchScore(query, candidate.name);
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	return best;
}
