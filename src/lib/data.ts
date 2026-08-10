import type { CuratedUpcomingGame } from '$lib/types';

export const SYSTEMS = {
	snes: 'Nintendo - Super Nintendo Entertainment System',
	gba: 'Nintendo - Game Boy Advance',
	nds: 'Nintendo - Nintendo DS',
	n64: 'Nintendo - Nintendo 64',
	gc: 'Nintendo - GameCube',
	ps1: 'Sony - PlayStation',
	ps2: 'Sony - PlayStation 2',
	md: 'Sega - Mega Drive - Genesis'
} as const;

export const RETRO_SYSTEM_LABELS: Record<keyof typeof SYSTEMS, string> = {
	snes: 'SNES',
	gba: 'GBA',
	nds: 'NDS',
	n64: 'N64',
	gc: 'GameCube',
	ps1: 'PS1',
	ps2: 'PS2',
	md: 'Mega Drive'
};

export const RETRO_SYSTEM_KEYS = Object.keys(SYSTEMS) as (keyof typeof SYSTEMS)[];

/** Hand-picked highlights merged into the live upcoming feed. */
export const CURATED_UPCOMING: CuratedUpcomingGame[] = [
	{
		name: "Castlevania: Belmont's Curse",
		date: '2026-10-14',
		platforms: 'PC · PS5 · Xbox · Switch 2',
		platformKeys: ['pc', 'ps5', 'xbox-series-x', 'switch2'],
		steamAppId: 4231820,
		storeUrl: 'https://store.steampowered.com/app/4231820/Castlevania_Belmonts_Curse/'
	},
	{
		name: 'Metal Gear Solid Collection Vol. 2',
		date: '2026-08-27',
		platforms: 'PS5 · Xbox · Switch 2 · PC',
		platformKeys: ['ps5', 'xbox-series-x', 'switch2', 'pc'],
		searchAs: ['Metal Gear Solid Master Collection Vol.2']
	},
	{
		name: 'Resonance: A Plague Tale Legacy',
		date: '2026-08-27',
		platforms: 'Day one on Game Pass',
		platformKeys: ['xbox-series-x', 'pc'],
		searchAs: ['A Plague Tale: Requiem']
	},
	{
		name: 'Star Wars Zero Company',
		date: '2026-08-27',
		platforms: 'PS5 · Xbox · PC',
		platformKeys: ['ps5', 'xbox-series-x', 'pc']
	},
	{
		name: 'Elden Ring: Tarnished Edition',
		date: '2026-08-28',
		platforms: 'Switch 2',
		platformKeys: ['switch2'],
		searchAs: ['Elden Ring']
	},
	{
		name: 'The Blood of Dawnwalker',
		date: '2026-09-03',
		platforms: 'PS5 · Xbox · PC',
		platformKeys: ['ps5', 'xbox-series-x', 'pc']
	},
	{
		name: 'Onimusha: Way of the Sword',
		date: '2026-09-04',
		platforms: 'PS5 · Xbox · Switch 2 · PC',
		platformKeys: ['ps5', 'xbox-series-x', 'switch2', 'pc']
	},
	{
		name: "Marvel's Wolverine",
		date: '2026-09-15',
		platforms: 'PS5',
		platformKeys: ['ps5']
	},
	{
		name: "Fire Emblem: Fortune's Weave",
		date: '2026-09-17',
		platforms: 'Switch 2',
		platformKeys: ['switch2'],
		searchAs: ['Fire Emblem']
	},
	{
		name: 'Silent Hill: Townfall',
		date: '2026-09-24',
		platforms: 'PS5 · PC',
		platformKeys: ['ps5', 'pc']
	},
	{
		name: 'Control Resonant',
		date: '2026-09-24',
		platforms: 'PS5 · Xbox · PC',
		platformKeys: ['ps5', 'xbox-series-x', 'pc'],
		searchAs: ['Control']
	},
	{
		name: 'Gears of War: E-Day',
		date: '2026-10-06',
		platforms: 'Day one on Game Pass',
		platformKeys: ['xbox-series-x', 'pc'],
		searchAs: ['Gears of War E-Day']
	},
	{
		name: 'Final Fantasy Resonance',
		date: '2026-10-22',
		platforms: 'PS5 · Xbox · Switch 2 · PC',
		platformKeys: ['ps5', 'xbox-series-x', 'switch2', 'pc']
	},
	{
		name: 'Phantom Blade Zero',
		date: '2026-10-29',
		platforms: 'PS5 · PC',
		platformKeys: ['ps5', 'pc']
	},
	{
		name: 'GTA 6',
		date: '2026-11-19',
		platforms: 'PS5 · Xbox',
		platformKeys: ['ps5', 'xbox-series-x'],
		searchAs: ['Grand Theft Auto VI', 'Grand Theft Auto 6']
	},
	{
		name: 'God of War: Laufey',
		date: '2027-02-16',
		platforms: 'PS5',
		platformKeys: ['ps5'],
		searchAs: ['God of War']
	},
	{
		name: 'Persona 4 Revival',
		date: '2027-02-18',
		platforms: 'PS5 · Xbox · PC',
		platformKeys: ['ps5', 'xbox-series-x', 'pc'],
		searchAs: ['Persona 4 Golden']
	}
];

/** @deprecated Use generated upcoming catalog instead. */
export const UPCOMING = CURATED_UPCOMING;
