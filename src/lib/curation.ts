export const GOOD_RECEPTION_MIN = 75;

export type ScoreBand = { min: number; max: number; cap: number };

/** Sample across score bands so picks aren't only 90+ blockbusters. */
export const RECEPTION_BANDS: ScoreBand[] = [
	{ min: 90, max: 100, cap: 10 },
	{ min: 85, max: 89, cap: 15 },
	{ min: 75, max: 84, cap: 25 }
];

export function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[swap]] = [copy[swap], copy[index]];
	}
	return copy;
}

export function curateByReception<T extends { id: string; name: string }>(
	entries: T[],
	scores: Map<string, number>,
	minScore = GOOD_RECEPTION_MIN,
	bands = RECEPTION_BANDS
): T[] {
	const qualified = entries.filter((entry) => (scores.get(entry.id) ?? -1) >= minScore);
	const picked: T[] = [];
	const usedNames = new Set<string>();

	for (const band of bands) {
		const bandMin = Math.max(band.min, minScore);
		const pool = qualified.filter((entry) => {
			const score = scores.get(entry.id) ?? -1;
			return (
				score >= bandMin &&
				score <= band.max &&
				!usedNames.has(entry.name.toLowerCase())
			);
		});

		for (const entry of shuffle(pool).slice(0, band.cap)) {
			picked.push(entry);
			usedNames.add(entry.name.toLowerCase());
		}
	}

	return picked;
}

export function cleanLookupName(name: string): string {
	return name
		.replace(/\s*\((game preview|windows|pc|xbox|cloud)\)/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
}
