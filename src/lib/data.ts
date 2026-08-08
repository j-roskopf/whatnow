import type { UpcomingGame } from '$lib/types';

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

export const UPCOMING: UpcomingGame[] = [
	{
		name: 'Metal Gear Solid Collection Vol. 2',
		date: '2026-08-27',
		platforms: 'PS5 · XSX · NS2 · PC',
		searchAs: ['Metal Gear Solid Master Collection Vol.2']
	},
	{
		name: 'Resonance: A Plague Tale Legacy',
		date: '2026-08-27',
		platforms: 'Day one on Game Pass',
		searchAs: ['A Plague Tale: Requiem']
	},
	{ name: 'Star Wars Zero Company', date: '2026-08-27', platforms: 'PS5 · XSX · PC' },
	{
		name: 'Elden Ring: Tarnished Edition',
		date: '2026-08-28',
		platforms: 'Switch 2',
		searchAs: ['Elden Ring']
	},
	{ name: 'The Blood of Dawnwalker', date: '2026-09-03', platforms: 'PS5 · XSX · PC' },
	{ name: 'Onimusha: Way of the Sword', date: '2026-09-04', platforms: 'PS5 · XSX · NS2 · PC' },
	{ name: "Marvel's Wolverine", date: '2026-09-15', platforms: 'PS5' },
	{
		name: "Fire Emblem: Fortune's Weave",
		date: '2026-09-17',
		platforms: 'Switch 2',
		searchAs: ['Fire Emblem']
	},
	{ name: 'Silent Hill: Townfall', date: '2026-09-24', platforms: 'PS5 · PC' },
	{ name: 'Control Resonant', date: '2026-09-24', platforms: 'PS5 · XSX · PC', searchAs: ['Control'] },
	{
		name: 'Gears of War: E-Day',
		date: '2026-10-06',
		platforms: 'Day one on Game Pass',
		searchAs: ['Gears of War E-Day']
	},
	{ name: 'Final Fantasy Resonance', date: '2026-10-22', platforms: 'PS5 · XSX · NS2 · PC' },
	{ name: 'Phantom Blade Zero', date: '2026-10-29', platforms: 'PS5 · PC' },
	{
		name: 'GTA 6',
		date: '2026-11-19',
		platforms: 'PS5 · XSX',
		searchAs: ['Grand Theft Auto VI', 'Grand Theft Auto 6']
	},
	{ name: 'God of War: Laufey', date: '2027-02-16', platforms: 'PS5', searchAs: ['God of War'] },
	{
		name: 'Persona 4 Revival',
		date: '2027-02-18',
		platforms: 'PS5 · XSX · PC',
		searchAs: ['Persona 4 Golden']
	}
];
