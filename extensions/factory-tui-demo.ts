import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

export type HarnessCard = {
	id: string;
	displayName: string;
	description: string;
	type?: string;
	icon: string;
	bestFor: string;
	safetyLevel: string;
	autonomyLevel: string;
	statusLabel: string;
	guards: string[];
	workflow: string[];
};

export class HarnessGalleryDemo {
	private selected = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];
	onSelect?: (profileId: string) => void;
	onCancel?: () => void;

	constructor(private readonly cards: HarnessCard[]) {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.up) && this.selected > 0) {
			this.selected--;
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.down) && this.selected < this.cards.length - 1) {
			this.selected++;
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.onSelect?.(this.cards[this.selected]?.id ?? "");
			return;
		}
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.onCancel?.();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const safeWidth = Math.max(20, width);
		const selectedCard = this.cards[this.selected];
		const lines = [
			"Harness Factory · Select a harness",
			"↑/↓ move · Enter choose · Esc cancel",
			"",
			...this.cards.map((card, index) => {
				const marker = index === this.selected ? "▸" : " ";
				return `${marker} ${card.icon} ${card.id.padEnd(18)} ${card.displayName}`;
			}),
			"",
			"─ Preview ─",
			selectedCard
				? `${selectedCard.displayName} (${selectedCard.id})`
				: "No profiles available",
			selectedCard?.description ?? "",
			selectedCard?.type ? `Type: ${selectedCard.type}` : "Type: custom",
			`Best for: ${selectedCard?.bestFor ?? "general tasks"}`,
			`Safety: ${selectedCard?.safetyLevel ?? "unknown"} · Autonomy: ${selectedCard?.autonomyLevel ?? "unknown"}`,
			`Status: ${selectedCard?.statusLabel ?? "none"}`,
			`Guards: ${selectedCard?.guards.join(", ") || "none"}`,
			`Workflow: ${selectedCard?.workflow.join(", ") || "none"}`,
		];
		this.cachedLines = lines.map((line) => truncateToWidth(line, safeWidth));
		this.cachedWidth = width;
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}
