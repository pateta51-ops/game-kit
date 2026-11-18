// Number and text format helpers.
/** "1 boss", "2 bosses": the count with the word in the right number. */
export const plural = (n: number, one: string, many = `${one}s`): string => `${String(n)} ${n === 1 ? one : many}`;
/** The word alone in the right number. */
export const pluralWord = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);
/** "+2", "-1", "0". */
export const signed = (n: number): string => (n > 0 ? `+${String(n)}` : String(n));
/** "a", "a and b", "a, b and c". */
export const listText = (items: readonly string[], and = 'and'): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1] as string}`;
/** "1,234" style grouping with the given separator. */
export const groupDigits = (n: number, sep = ','): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
