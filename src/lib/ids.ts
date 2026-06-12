/** UUID v4 for all entities (§6). */
export function newId(): string {
  return crypto.randomUUID();
}
