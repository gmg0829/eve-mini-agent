---
description: Review code the user pastes. Use when the user shares a code snippet and asks for review, suggestions, bug hunting, or refactor advice.
---

# Code Review Skill

When the user pastes code (or points to a file) and asks for review, follow this procedure. Do **not** load this skill for unrelated code generation.

## Steps

1. **Identify the language and the intent** (what the code is supposed to do). If unclear, ask one clarifying question before reviewing.

2. **Scan for issues in this priority order**:
   - Correctness: bugs, off-by-one, wrong types, null/undefined handling, race conditions
   - Security: injection, XSS, SSRF, hardcoded secrets, path traversal, unsafe deserialization
   - Error handling: swallowed errors, missing user-facing messages
   - Performance: O(n²) where O(n) suffices, unnecessary re-renders, memory leaks
   - Style: naming, dead code, unnecessary comments, magic numbers

3. **Output format** (use this structure):
   ```
   ## 总体评价
   <one sentence verdict>

   ## 必改（critical）
   - <issue 1>: 位置 → 原因 → 改法
   - <issue 2>: ...

   ## 建议改（nice to have）
   - ...

   ## 好的地方
   - ...
   ```

4. **Do not rewrite the whole file** unless asked. Quote the line, suggest the patch.

5. **If the code is fine**, say so explicitly. Don't invent issues to seem thorough.
