# Tool schema audit

Run this checklist when classification bucket is `tool_selection` or `tool_arguments`.

## Per-tool checklist

- [ ] **Name** is verb-first (`search_orders`, not `orders_search`)
- [ ] **Description** states what it does, when to use, when NOT to use
- [ ] No sibling tool with overlapping description
- [ ] **≤15 tools** visible to the model at once (split by workflow if needed)
- [ ] Every parameter has `description` + correct JSON Schema `type`
- [ ] Only truly required fields in `required` array
- [ ] Use `enum` for closed sets (status, sort order)
- [ ] `strict: true` enabled (OpenAI / Anthropic) where supported
- [ ] No deeply nested objects (prefer flat top-level params)
- [ ] `examples` on ambiguous string fields

## Overlap merge rule

If two tools differ only by name:

| Before | After |
|--------|-------|
| `search_users` + `find_users` | `search_users` with `mode: "exact" \| "fuzzy"` |
| `read_file` + `get_file` | `read_file` |

## Description template

```
<What it does in one sentence>.
Use when: <specific user intent>.
Do not use when: <cases handled by another tool>.
Returns: <shape of success output>.
```

## Quick test

1. List tool names only — can you tell which to pick for 3 sample user queries?
2. If not, descriptions are too vague.
3. Add failing query to regression test (see `templates/`).
