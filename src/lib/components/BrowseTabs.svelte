<script lang="ts">
	import { BROWSE_TABS } from '$lib/browse';
	import type { BrowseTab } from '$lib/types';

	let {
		active,
		onChange
	}: {
		active: BrowseTab;
		onChange: (tab: BrowseTab) => void;
	} = $props();
</script>

<div class="tabs" role="tablist" aria-label="Browse categories">
	{#each BROWSE_TABS as tab}
		<button
			type="button"
			role="tab"
			class:sel={active === tab.id}
			aria-selected={active === tab.id}
			onclick={() => onChange(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>
