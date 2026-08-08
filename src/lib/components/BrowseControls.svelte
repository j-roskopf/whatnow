<script lang="ts">
	import type { MinScoreSource, SortKey } from '$lib/types';

	let {
		sort,
		minScore,
		minScoreSource,
		onSortChange,
		onMinScoreChange,
		onMinScoreSourceChange
	}: {
		sort: SortKey;
		minScore: number;
		minScoreSource: MinScoreSource;
		onSortChange: (sort: SortKey) => void;
		onMinScoreChange: (min: number) => void;
		onMinScoreSourceChange: (source: MinScoreSource) => void;
	} = $props();
</script>

<div class="browse-controls">
	<label>
		<span class="sr-only">Sort by</span>
		<select value={sort} onchange={(e) => onSortChange((e.currentTarget as HTMLSelectElement).value as SortKey)}>
			<option value="critics">IGDB critics</option>
			<option value="metacritic">Metacritic</option>
			<option value="opencritic">OpenCritic</option>
			<option value="players">IGDB players</option>
			<option value="name">Name</option>
			<option value="hours">Length</option>
		</select>
	</label>
	<label>
		<span>Min score</span>
		<select
			value={minScoreSource}
			onchange={(e) =>
				onMinScoreSourceChange((e.currentTarget as HTMLSelectElement).value as MinScoreSource)}
		>
			<option value="igdb-critics">IGDB critics</option>
			<option value="metacritic">Metacritic</option>
			<option value="opencritic">OpenCritic</option>
		</select>
		<select
			value={String(minScore)}
			onchange={(e) => onMinScoreChange(Number((e.currentTarget as HTMLSelectElement).value))}
		>
			<option value="0">Any</option>
			<option value="70">70+</option>
			<option value="80">80+</option>
			<option value="90">90+</option>
		</select>
	</label>
</div>
