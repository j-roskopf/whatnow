import type { CatalogEntry, Game, GameReason } from '$lib/types';

function serviceLabels(entry: CatalogEntry): { systemLabel: string; where: string } {
	const id = entry.id ?? '';
	if (entry.service === 'gamepass' || id.startsWith('gamepass-')) {
		return { systemLabel: 'Game Pass', where: entry.tier ?? 'Game Pass' };
	}
	if (entry.service === 'psplus' || id.startsWith('psplus-')) {
		const tier = entry.tier ?? 'Extra';
		const where = /plus/i.test(tier) ? tier : `PS Plus ${tier}`;
		return { systemLabel: 'PS Plus', where };
	}
	if (entry.service === 'humble' || id.startsWith('humble-')) {
		const tier = entry.tier ?? 'Humble';
		return { systemLabel: 'Humble', where: tier };
	}
	if (entry.service === 'modern' || id.startsWith('modern-')) {
		return {
			systemLabel: 'Modern',
			where: entry.platforms ?? 'Retail'
		};
	}
	return {
		systemLabel: entry.systemLabel ?? 'Retro',
		where: entry.platforms === 'Emulated' ? 'Emulated' : (entry.platforms ?? 'Emulated')
	};
}

function defaultWhy(reason: GameReason, entry: CatalogEntry): string {
	const labels = serviceLabels(entry);
	if (reason === 'leaving') {
		return `Leaving soon on ${labels.where}. Play it before it disappears from your subscription.`;
	}
	if (reason === 'free') {
		return `Recently added to ${labels.where}. Worth a look while it costs nothing.`;
	}
	if (reason === 'modern') {
		return `Standalone ${labels.where} title — not tied to a subscription, worth playing on its own.`;
	}
	return `Classic ${labels.systemLabel} title — emulated, good for a short session.`;
}

export function reasonForCatalogEntry(entry: CatalogEntry): GameReason {
	if (entry.service === 'retro') return 'retro';
	if (entry.service === 'modern') return 'modern';
	if (entry.section === 'leaving') return 'leaving';
	return 'free';
}

export function catalogEntryToGame(entry: CatalogEntry, reason?: GameReason): Game {
	const resolvedReason = reason ?? reasonForCatalogEntry(entry);
	const labels = serviceLabels(entry);
	const tag =
		entry.tier ??
		entry.systemLabel ??
		(resolvedReason === 'leaving'
			? 'Leaving soon'
			: resolvedReason === 'free'
				? 'New'
				: resolvedReason === 'modern'
					? 'Modern'
					: labels.systemLabel);

	return {
		id: entry.id,
		name: entry.name,
		reason: resolvedReason,
		tag,
		systemLabel: labels.systemLabel,
		where: labels.where,
		hours: '—',
		platforms: entry.platforms ?? '',
		why: entry.summary ?? defaultWhy(resolvedReason, entry),
		system: entry.system,
		file: entry.file,
		imageUrl: entry.imageUrl,
		snapUrl: entry.snapUrl,
		storeUrl: entry.storeUrl
	};
}
