export type GameReason = 'leaving' | 'free' | 'retro' | 'modern';
export type ArtFit = 'contain' | 'cover';
export type ArtSource = 'libretro' | 'steamgriddb' | 'igdb' | 'rawg';
export type ArtStatus = 'loaded' | 'missing' | 'no-source';
export type MediaKind = 'cover' | 'screenshot' | 'hero' | 'title' | 'logo';

export type BrowseTab =
	| 'tonight'
	| 'random'
	| 'psplus'
	| 'gamepass'
	| 'retro'
	| 'modern'
	| 'soon'
	| 'new';
export type MetacriticPlatform = 'ps5' | 'ps4' | 'switch' | 'xbox-series-x' | 'pc';
export type UpcomingPlatformKey = MetacriticPlatform | 'switch2' | 'all';
export type SortKey =
	| 'critics'
	| 'metacritic'
	| 'opencritic'
	| 'players'
	| 'name'
	| 'hours'
	| 'date';
export type RatingSource = 'igdb-critics' | 'igdb-players' | 'opencritic' | 'metacritic';
export type MinScoreSource = 'igdb-critics' | 'metacritic' | 'opencritic';

export type CatalogService = 'gamepass' | 'psplus' | 'modern' | 'retro' | 'humble';
export type PinnedSectionId = 'psplus-monthly' | 'humble-choice' | 'humble-bundles';
export type CatalogSection = 'leaving' | 'new' | 'library' | 'picks';
export type RetroSystemKey = 'snes' | 'gba' | 'nds' | 'n64' | 'gc' | 'ps1' | 'ps2' | 'md';

export interface CatalogEntry {
	id: string;
	name: string;
	service: CatalogService;
	section: CatalogSection;
	platforms?: string;
	/** Metacritic browse platform keys for filtering the modern catalog. */
	platformKeys?: MetacriticPlatform[];
	imageUrl?: string;
	snapUrl?: string;
	releaseDate?: string;
	storeUrl?: string;
	tier?: string;
	summary?: string;
	system?: string;
	file?: string;
	systemLabel?: string;
	ratings?: GameRatings;
}

export interface CatalogResponse {
	entries: CatalogEntry[];
	fetchedAt: string;
	source: string;
}

export interface PinnedSection {
	id: PinnedSectionId;
	label: string;
	entries: CatalogEntry[];
}

export interface PinnedResponse {
	sections: PinnedSection[];
	fetchedAt: string;
	source: string;
}

export interface Game {
	id: string;
	name: string;
	reason: GameReason;
	tag: string;
	systemLabel: string;
	where: string;
	hours: string;
	platforms: string;
	why: string;
	system?: string;
	file?: string;
	imageUrl?: string;
	snapUrl?: string;
	storeUrl?: string;
}

export interface PoolResponse {
	games: Game[];
	fetchedAt: string;
	source: string;
	counts?: {
		leaving: number;
		free: number;
		retro: number;
		modern: number;
	};
}

export interface UpcomingGame {
	id: string;
	name: string;
	date: string;
	releaseDateLabel?: string;
	platforms: string;
	platformKeys?: UpcomingPlatformKey[];
	storeUrl?: string;
	imageUrl?: string;
	score?: number;
	summary?: string;
	searchAs?: string[];
	igdbId?: number;
	steamAppId?: number;
}

export interface CuratedUpcomingGame {
	name: string;
	date: string;
	platforms: string;
	platformKeys?: Exclude<UpcomingPlatformKey, 'all'>[];
	storeUrl?: string;
	imageUrl?: string;
	searchAs?: string[];
	igdbId?: number;
	steamAppId?: number;
}

export interface UpcomingResponse {
	games: UpcomingGame[];
	platform: UpcomingPlatformKey;
	fetchedAt: string;
	source: string;
}

export interface MetacriticRelease {
	id: string;
	name: string;
	releaseDate?: string;
	releaseDateLabel?: string;
	score?: number;
	url: string;
	imageUrl?: string;
	summary?: string;
	platform: MetacriticPlatform;
}

export interface MetacriticReleasesResponse {
	releases: MetacriticRelease[];
	platform: MetacriticPlatform;
	fetchedAt: string;
	source: string;
}

export interface ApiKeys {
	steamGridDb?: string;
	igdbClientId?: string;
	igdbClientSecret?: string;
	openCritic?: string;
}

export interface MediaItem {
	url: string;
	fit: ArtFit;
	source: ArtSource;
	kind: MediaKind;
}

export interface GameMedia {
	items: MediaItem[];
}

export interface RatingScore {
	source: RatingSource;
	label: string;
	score?: number;
	url?: string;
	count?: number;
}

export interface GameRatings {
	scores: RatingScore[];
	bestCritic?: number;
	bestPlayers?: number;
	metacritic?: number;
	openCritic?: number;
}

export interface GameMeta {
	items: MediaItem[];
	ratings: GameRatings;
}

/** @deprecated Use MediaItem — kept for cache migration */
export interface ArtResult {
	url: string;
	fit: ArtFit;
	source: ArtSource;
}

export interface ArtLookup {
	id: string;
	name: string;
	system?: string;
	file?: string;
	releaseDate?: string;
	igdbId?: number;
	searchAs?: string[];
}
