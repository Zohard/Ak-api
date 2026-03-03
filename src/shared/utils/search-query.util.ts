/**
 * SQL fragment builders for unaccent-aware search.
 *
 * Usage:
 *   const where = unaccentILIKE('titre', '$1')
 *   // → "unaccent(titre) ILIKE unaccent($1)"
 */

/**
 * Build a single unaccent ILIKE condition.
 * @param column  SQL column expression (e.g. `titre`, `COALESCE(synopsis, '')`)
 * @param param   Parameter placeholder (e.g. `$1`, `${variable}`)
 */
export function unaccentILIKE(column: string, param: string): string {
  return `unaccent(${column}) ILIKE unaccent(${param})`;
}

/**
 * Build an OR group of unaccent ILIKE conditions.
 * @param columns Array of SQL column expressions
 * @param param   Parameter placeholder shared by all conditions
 */
export function unaccentILIKEOr(columns: string[], param: string): string {
  return columns.map((col) => unaccentILIKE(col, param)).join('\n           OR ');
}
