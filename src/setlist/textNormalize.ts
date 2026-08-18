/**
 * Normalizes text for matching by dropping punctuation/symbols (brackets, apostrophes, etc.)
 * that often differ between a pasted line and the actual file name — a fuzzy search otherwise
 * fails outright when the query contains a character (e.g. an apostrophe) the target doesn't
 * have at all, since every query character must be found in order in the target. "&" becomes
 * "and" first, since that's a common spelled-out/symbol split between the two.
 */
export function normalizeForMatch(text: string): string {
	return text
		.toLowerCase()
		.replace(/&/g, " and ")
		// Apostrophes/quotes collapse rather than becoming a space, so "don't" -> "dont"
		// (contiguous) matches how such titles are typically saved as file names.
		.replace(/['’"]/g, "")
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}
