import { isGamePass, isPsPlus } from '$lib/browse';
import { loadCatalog } from '$lib/catalog';
import { catalogEntryToGame } from '$lib/catalog-game';
import { RETRO_SYSTEM_KEYS } from '$lib/data';
import { loadPinned } from '$lib/pinned';
import { loadPool } from '$lib/pool';
import type { Game } from '$lib/types';

export type RandomSource = 'psplus' | 'gamepass' | 'humble' | 'modern' | 'retro';

export const RANDOM_SOURCES: { id: RandomSource; label: string }[] = [
	{ id: 'psplus', label: 'PS Plus' },
	{ id: 'gamepass', label: 'Game Pass' },
	{ id: 'humble', label: 'Humble' },
	{ id: 'modern', label: 'Modern' },
	{ id: 'retro', label: 'Retro' }
];

export function randomSourceOf(game: Game): RandomSource {
	if (game.id.startsWith('humble-') || game.systemLabel === 'Humble') return 'humble';
	if (isPsPlus(game)) return 'psplus';
	if (isGamePass(game)) return 'gamepass';
	if (game.reason === 'retro') return 'retro';
	return 'modern';
}

function dedupeGames(games: Game[]): Game[] {
	const seen = new Set<string>();
	const result: Game[] = [];
	for (const game of games) {
		if (seen.has(game.id)) continue;
		seen.add(game.id);
		result.push(game);
	}
	return result;
}

export async function buildRandomPool(): Promise<Game[]> {
	const retroCatalogs = await Promise.all(
		RETRO_SYSTEM_KEYS.map((system) => loadCatalog('retro', 'library', system))
	);

	const [pool, pinned, psplus, gamepass, psplusLeaving, gamepassLeaving, modern] = await Promise.all([
		loadPool(),
		loadPinned(),
		loadCatalog('psplus', 'library'),
		loadCatalog('gamepass', 'library'),
		loadCatalog('psplus', 'leaving'),
		loadCatalog('gamepass', 'leaving'),
		loadCatalog('modern', 'library')
	]);

	const pinnedEntries = pinned.sections.flatMap((section) => section.entries);

	const catalogEntries = [
		...pinnedEntries,
		...psplus.entries,
		...gamepass.entries,
		...psplusLeaving.entries,
		...gamepassLeaving.entries,
		...modern.entries,
		...retroCatalogs.flatMap((catalog) => catalog.entries)
	];

	const fromCatalog = catalogEntries.map((entry) => catalogEntryToGame(entry));

	return dedupeGames([...pool.games, ...fromCatalog]);
}
