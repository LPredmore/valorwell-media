

## Diagnosis

The CSV contains multi-line quoted fields — the `topic` column has full paragraphs with newlines inside double quotes. The current `parseCSV` function splits on `\n` first, then parses each line individually. This fundamentally cannot work with multi-line fields because a single cell's content gets split across dozens of "lines," each parsed independently. The result: corrupted column mapping, narrative text landing in `planned_date`, and a Postgres type error.

Secondary issue: the CSV also has columns (`id`, `created_at`, `playlist_id`) not in `CSV_COLUMNS`. The current code handles this fine (it looks up columns by name), so that is not the problem.

Third issue: the `planned_date` values in the CSV are malformed (`2026-03-010` — note the extra zero). Even with correct parsing, these would fail Postgres timestamp validation.

## Fix

### 1. Replace the CSV parser with one that handles multi-line quoted fields

The current parser splits on newlines first, which is architecturally wrong for RFC 4180 CSV. The replacement must parse the entire text character-by-character, tracking quote state across newlines. When inside a quoted field, newlines become part of the cell content rather than row boundaries.

This is a rewrite of the `parseCSV` function only — same signature, same return type.

### 2. Validate `planned_date` before insertion

After parsing, validate that `planned_date` values produce a valid `Date` object. If they don't (like `2026-03-010`), set to `null` and continue rather than letting the bad value reach Supabase where it causes a hard error. Show a toast noting how many rows had invalid dates.

### 3. No other changes needed

- `CSV_COLUMNS` already uses name-based lookup, so extra columns in the CSV are harmless.
- The insert logic, hooks, and database schema are all fine.
- The `content_ideas` table accepts nullable `planned_date`, so nulling out bad dates is safe.

## Scope

Single file change: `src/pages/Ideas.tsx` — rewrite `parseCSV` function and add date validation in `handleCSV`.

