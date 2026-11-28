# Photo analysis module

`contracts.ts` contains provider-independent, browser-safe receipt v3 / label v2 / wine-photo v2 DTOs and Zod schemas.
Receipt `wines.details` contains unverified product-knowledge suggestions, separate from printed names.
Wine-photo accepts one to twenty bottles with observed facts and optional product candidates.
It has no purchase date, merchant, payment, price or discount fields. Purchase facts are entered by the user.
`validation.ts` checks and cleans observed facts and suggestions without network or database calls.
`gemini.ts` is the server-only provider adapter; it owns credentials, schema projection,
prompting, request timeouts and response handling.
`handler.ts` enforces session/origin/image/quota boundaries before invoking a provider.
For purchase photo/receipt analysis, `collection-context.ts` loads every wine identity
in the authenticated owner's collection using their RLS client plus an owner filter.
`collection-matching.ts` sends only identity metadata and request-local references,
then resolves valid suggestions back to the supplied owner IDs. Suggestions live in
the result's `collection_matches` envelope, separate from observed facts and money.
The purchase editor preselects these editable suggestions and still requires review.

Do not import `gemini.ts` or `handler.ts` into Client Components. Do not log images,
keys, full model responses or private receipt text. Analysis must not save content.
Model output always requires user review and existing domain/RPC validation before saving.

See [implementation and API contract](../../docs/GEMINI_INTEGRATION.md).
