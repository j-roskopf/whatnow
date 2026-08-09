<script lang="ts">
	import { onMount } from 'svelte';
	import CatalogCard from '$lib/components/CatalogCard.svelte';
	import { loadPinned } from '$lib/pinned';
	import type { PinnedSection } from '$lib/types';

	let loading = $state(true);
	let sections = $state<PinnedSection[]>([]);
	let fetchedAt = $state('');
	let source = $state('');

	const visibleSections = $derived(sections.filter((section) => section.entries.length > 0));

	onMount(async () => {
		const pinned = await loadPinned();
		sections = pinned.sections;
		fetchedAt = pinned.fetchedAt;
		source = pinned.source;
		loading = false;
	});
</script>

{#if loading}
	<div class="slab">
		<h2>Subscriptions</h2>
		<div class="line"></div>
	</div>
	<div class="loading">Loading subscriptions…</div>
{:else if visibleSections.length}
	{#each visibleSections as section, index (section.id)}
		<div class="slab">
			<h2>{section.label}</h2>
			<div class="line"></div>
			{#if index === 0 && fetchedAt}
				<span class="count">
					Updated {new Date(fetchedAt).toLocaleDateString('en-US', {
						month: 'short',
						day: 'numeric'
					})}
				</span>
			{/if}
		</div>
		<div class="shelf">
			{#each section.entries as entry (entry.id)}
				<CatalogCard entry={entry} />
			{/each}
		</div>
	{/each}
{/if}
