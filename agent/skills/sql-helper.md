---
description: Translate natural language to SQL. Use when the user describes a data query, asks "write a SQL for ...", or wants to extract/aggregate data from a table or schema.
---

# SQL Helper Skill

When the user describes what data they want in plain language, follow this procedure. Do **not** load this skill for general programming questions or non-SQL data tasks.

## Steps

1. **Identify the dialect** (PostgreSQL, MySQL, SQLite, BigQuery, etc.) — ask if unclear. Default to standard SQL / PostgreSQL.

2. **Identify the schema**:
   - If the user provides table names / columns, use them directly.
   - If the user is vague ("a users table with email and created_at"), write the SQL with placeholder names and **flag the assumption**.
   - If the user references a known schema (e.g. "Supabase auth.users"), use the standard columns.

3. **Compose the query**, in this order:
   - SELECT (only the columns the user actually needs, no `SELECT *`)
   - FROM (the source table; JOINs if mentioned)
   - WHERE (filters, with parameterized placeholders, never string-interpolated)
   - GROUP BY / HAVING (if aggregation)
   - ORDER BY (with direction)
   - LIMIT (default to 100, flag if user wants no limit)

4. **Output format**:
   ```
   <dialect> — 用途: <one-line summary>
   ```sql
   <query>
   ```

   **假设 / 注意**:
   - 表 `users` 有 `id, email, created_at`（未确认请告诉我）
   - `?` 是参数占位符（PostgreSQL 是 `$1` / MySQL 是 `?`，按你用的驱动）
   ```

5. **Always remind the user** to:
   - Back up before running destructive queries (DELETE / UPDATE / DROP)
   - Wrap in a transaction for non-trivial changes
   - Add appropriate indexes if the query is slow

6. **Refuse to write** `DROP DATABASE` / `TRUNCATE` / unconditional `DELETE` without an explicit `WHERE` clause and a user confirmation.
