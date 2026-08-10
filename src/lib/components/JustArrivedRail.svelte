<script lang="ts">
	import { onMount } from 'svelte';
	import CatalogCard from '$lib/components/CatalogCard.svelte';
	import { loadCatalog } from '$lib/catalog';
	import type { CatalogEntry } from '$lib/types';

	const LIMIT = 12;

	let loading = $state(true);
	let entries = $state<CatalogEntry[]>([]);
	let fetchedAt = $state('');

	function parseDate(value?: string): number {
		if (!value) return 0;
		const ms = new Date(value).getTime();
		if (!Number.isFinite(ms) || ms > Date.now() + 86400000 * 365) return 0;
		return ms;
	}

	function mergeEntries(gamepass: CatalogEntry[], psplus: CatalogEntry[]): CatalogEntry[] {
		const seen = new Set<string>();
		const merged: CatalogEntry[] = [];

		for (const entry of [...gamepass, ...psplus]) {
			const key = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '');
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(entry);
		}

		return merged
			.sort((a, b) => parseDate(b.releaseDate) - parseDate(a.releaseDate))
			.slice(0, LIMIT);
	}

	onMount(async () => {
		const [gamepass, psplus] = await Promise.all([
			loadCatalog('gamepass', 'new'),
			loadCatalog('psplus', 'new')
		]);

		fetchedAt = [gamepass.fetchedAt, psplus.fetchedAt].filter(Boolean).sort().at(-1) ?? '';
		entries = mergeEntries(gamepass.entries, psplus.entries);
		loading = false;
	});
</script>

{#if loading}
	<div class="slab">
		<h2>Just arrived</h2>
		<div class="line"></div>
	</div>
	<div class="loading">Loading recent additions…</div>
{:else if entries.length}
	<div class="slab">
		<h2>Just arrived</h2>
		<div class="line"></div>
		{#if fetchedAt}
			<span class="count">
				Updated {new Date(fetchedAt).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric'
				})}
			</span>
		{/if}
	</div>
	<div class="shelf">
		{#each entries as entry (entry.id)}
			<CatalogCard entry={entry} showSummary={false} />
		{/each}
	</div>
{/if}
