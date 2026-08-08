<script lang="ts">
	import type { MediaItem } from '$lib/types';

	let {
		items,
		title,
		startIndex = 0,
		onClose
	}: {
		items: MediaItem[];
		title: string;
		startIndex?: number;
		onClose: () => void;
	} = $props();

	let index = $state(0);

	$effect(() => {
		index = startIndex;
	});

	function prev() {
		index = (index - 1 + items.length) % items.length;
	}

	function next() {
		index = (index + 1) % items.length;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
		if (event.key === 'ArrowLeft') prev();
		if (event.key === 'ArrowRight') next();
	}

	let current = $derived(items[index]);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="viewer" role="dialog" aria-modal="true" aria-label={`${title} media`}>
	<button class="viewer-close" type="button" aria-label="Close" onclick={onClose}>✕</button>
	<div class="viewer-head">
		<h2>{title}</h2>
		<span>{index + 1} / {items.length}</span>
	</div>

	<div class="viewer-stage">
		{#if items.length > 1}
			<button class="viewer-nav prev" type="button" aria-label="Previous" onclick={prev}>‹</button>
		{/if}
		<img
			class={current.fit}
			src={current.url}
			alt={`${title} — ${current.kind}`}
		/>
		{#if items.length > 1}
			<button class="viewer-nav next" type="button" aria-label="Next" onclick={next}>›</button>
		{/if}
	</div>

	{#if items.length > 1}
		<div class="viewer-strip" role="tablist" aria-label="Media thumbnails">
			{#each items as item, itemIndex}
				<button
					type="button"
					class:sel={itemIndex === index}
					aria-label={`${item.kind} ${itemIndex + 1}`}
					onclick={() => (index = itemIndex)}
				>
					<img src={item.url} alt="" />
				</button>
			{/each}
		</div>
	{/if}
</div>
