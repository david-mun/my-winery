# Photo analysis module

`contracts.ts` contains provider-independent, browser-safe v2 DTOs and Zod schemas.
`validation.ts` checks and cleans observed facts without network or database calls.
`gemini.ts` is the server-only provider adapter; it owns credentials, schema projection,
prompting, request timeouts and response handling.
`handler.ts` enforces session/origin/image/quota boundaries before invoking a provider.

Do not import `gemini.ts` or `handler.ts` into Client Components. Do not log images,
keys, full model responses or private receipt text. Analysis must not save content.
Model output always requires user review and existing domain/RPC validation before saving.

See [implementation and API contract](../../docs/GEMINI_INTEGRATION.md).
