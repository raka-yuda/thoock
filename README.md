# Thoock

Thoock is a private, single-user production workspace for researching potentially useful Adobe Stock topics, creating AI-assisted commercial prompts, generating and reviewing image candidates, selectively upscaling approved images, and exporting prepared JPEG + CSV upload packs. Final upload always happens manually in Adobe Contributor Portal.

The repository is a portfolio-oriented MVP, not a SaaS product. It intentionally has no registration, multi-user model, subscriptions, payments, teams, public generation endpoint, or automatic Adobe submission.

## Screenshots

Add portfolio screenshots after starting the app:

- `docs/screenshots/dashboard.png`
- `docs/screenshots/opportunities.png`
- `docs/screenshots/review-queue.png`
- `docs/screenshots/upscale-comparison.png`
- `docs/screenshots/adobe-export.png`

## What is implemented

- Password-protected single-owner application with signed HTTP-only sessions
- Collapsible, responsive shadcn-style application shell with light and dark themes
- Restrained tactile design system with grouped Research, Production, Delivery, and System navigation
- Explainable opportunity scoring that labels Adobe result counts as estimated supply, not demand
- AI-assisted topic research through deterministic mock, Gemini, and OpenAI web-research adapters; results are saved as scored opportunities
- Database-backed bulk brief creation that produces distinct buyer uses, scenes, compositions, and editable prompts
- Confirmed bulk image generation from selected briefs, one generated image per brief, with duplicate prevention, cost preview, and progress
- Structured commercial brief editor with a responsive detail dialog and practical presets
- Editable commercial prompt generation through deterministic mock and optional Gemini adapters
- Catalog-driven provider/model selection with Mock, Imported Image, SnapGenAI, Cloudflare Workers AI, optional Black Forest Labs, and optional Gemini adapters
- Economical, direct-4MP, and custom strategies with complete pipeline-cost and break-even comparisons
- Actual Sharp-based width, height, format, file-size, checksum, metadata, and perceptual-hash inspection
- Candidate grid, large preview, candidate comparison, technical warnings, review notes, and required human checklists
- Selective upscaling only after candidate approval, with Noop, Sharp interpolation, mock AI, optional local AI, and Stability adapters
- Before/after and 100% zoom comparison plus a separate post-upscale quality review
- Original and derived asset lineage in PostgreSQL and storage abstractions
- Adobe-oriented metadata validation, ordered keyword normalization, and prohibited-term checks
- Real server-generated demo ZIP with minimum-4MP JPEGs, UTF-8 CSV, manifest, and compliance report
- Persisted review and metadata workflow plus real multi-asset ZIP export from approved generated assets
- URL-backed modal filters with removable active-filter chips across research, production, review, logs, and exports
- Export-package history per image, including latest package date and total export count without implying Adobe submission
- Shared monthly generation/upscaling budget, 80% warning, 100% hard stop, and explicit override model
- Configurable model-capability records plus immutable pricing/capability snapshots on generation jobs
- Authenticated provider request log with redacted inputs, response summaries, timing, cost, and errors
- PostgreSQL-backed job records with status, progress, error, attempt, cost, and idempotency fields
- Drizzle migrations and clearly labeled seed data

## Architecture

Thoock is a modular monolith. Next.js owns the server-rendered UI, route handlers, authentication boundary, and orchestration. Domain functions stay independent from frameworks. PostgreSQL stores workflow state and a local filesystem adapter stores image bytes during development.

```text
Browser
  -> Next.js App Router and server routes
      -> domain services and validation
          -> provider interfaces
              -> mock providers (default)
              -> SnapGenAI, Cloudflare Workers AI, Black Forest Labs, Gemini, and import adapters
              -> model capability catalog and historical snapshots
              -> local or API-backed upscale adapters (optional)
              -> Stability upscale adapter (optional)
              -> Sharp inspection and preparation
              -> redacted provider request observability
          -> Drizzle ORM -> PostgreSQL
          -> StorageProvider -> local filesystem
```

Source organization:

```text
src/app                 routes, layouts, and protected server endpoints
src/components          repository-owned shadcn-style UI components
src/db                  normalized Drizzle schema and database access
src/lib/domain          scoring, image, metadata, cost, review, and CSV rules
src/modules/assets      final JPEG preparation
src/modules/exports     ZIP, CSV, manifest, and compliance reports
src/modules/providers   external service contracts and adapters
src/modules/workflow    testable workflow orchestration
drizzle                 generated PostgreSQL migrations
scripts                 owner setup and demonstration seed
```

Provider contracts include `StockResearchProvider`, `TopicResearchProvider`, `BriefGenerationProvider`, `PromptGenerationProvider`, `ImageGenerationProvider`, `ImageInspectionProvider`, `ImageUpscaleProvider`, `MetadataGenerationProvider`, and `StorageProvider`. Topic research has a free deterministic adapter plus optional Gemini and OpenAI adapters. The OpenAI adapter uses the Responses API, structured output, and optional web search before normalizing results through the same Zod contract. Provider-specific response envelopes are normalized before entering the workflow. Model capabilities and prices are data, not branches in business logic, so changing a model does not change the 4MP compliance gate.

## Focused MVP scope

The active product path is deliberately narrow:

```text
AI research -> save and score opportunities -> bulk-create distinct commercial briefs
  -> inspect/edit each brief, prompt, and Adobe metadata plan -> configured image generation
  -> inspect/review -> selective upscale if needed
  -> metadata -> prepared JPEG files + Adobe CSV ZIP
```

Submission tracking, royalties, downloads, and analytics are not part of the active interface. Their older database tables are retained only to avoid a destructive migration against existing installations; no route, navigation item, dashboard metric, or active workflow depends on them.

## Bulk research and brief CSV import

Commercial research can be done in any chat agent without connecting a research API. The import flow has two deliberate stages:

1. Open **Opportunities → Import research CSV**, download the research template, and import the researched topic rows.
2. Open **Commercial briefs → Import CSV** and import briefs whose `opportunity_keyword` exactly matches a saved topic.

Both screens accept file upload or pasted CSV, preview every row, and report field-level errors before enabling import. Each final import is all-or-nothing and supports at most 200 rows or 1MB per batch. Existing topic-and-region pairs are rejected to prevent accidental duplicate research imports.

The research CSV headers are:

```text
keyword,target_region,type,target_event_date,competition_estimate,trend_growth,commercial_intent,seasonality,portfolio_performance,research_notes,buyer_use_cases,research_sources
```

Use `evergreen`, `seasonal`, or `trending` for type and `YYYY-MM-DD` for an optional event date. `competition_estimate` is numeric available supply, not proven demand. Each signal must be numeric from 0–100; unavailable or “Manual check required” values are rejected instead of silently inventing evidence. Separate buyer uses and source links with `|`. Thoock calculates the score, stores the topic as shortlisted, and preserves the research notes, use cases, and sources in its signal record.

The commercial brief CSV headers are:

```text
name,target_buyer,intended_usage,target_market,main_subject,supporting_subjects,environment,visual_style,orientation,composition,copy_space_location,lighting,mood,representation_notes,prohibited_elements,candidate_count,generation_prompt,negative_prompt,metadata_title,adobe_category,metadata_keywords,metadata_language,fictional_people_property,metadata_notes,opportunity_keyword
```

Only `name` and `main_subject` are required; useful commercial defaults fill blank direction fields. Use `horizontal`, `square`, or `vertical` for orientation. Separate supporting subjects, prohibited elements, and metadata keywords with `|`, because commas may be meaningful CSV text. `candidate_count` defaults to `1`. Prompts are optional and receive the same deterministic fallback used by the manual form. Adobe category accepts the code, exact label, or portal key and is normalized to the export code. A metadata plan is considered complete when it has a 5–70 character title, valid category, and 5–50 ordered keywords. `fictional_people_property` accepts `true`/`false`, `yes`/`no`, or `1`/`0`. `opportunity_keyword` is optional; when present it must match a saved opportunity case-insensitively, otherwise leave it blank to create an independent manual brief.

A useful chat-agent instruction is: “Return two UTF-8 CSV blocks using the attached Thoock headers: researched topics first, then one commercially distinct image brief per requested row. Match every brief opportunity_keyword exactly to its research keyword, use `|` inside list fields, avoid brands and copyrighted properties, set candidate_count to 1, and include an accurate Adobe metadata title, category, 10–35 relevance-ordered content keywords, language, and fictional-people/property decision.” Treat agent output as a draft and review every topic, score, brief, prompt, and metadata plan before generation.

## Local setup

Requirements:

- Node.js 22+
- npm
- Docker with Docker Compose

Copy the environment template and set a strong session secret:

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
```

Create the single owner. Set `INITIAL_USER_EMAIL` and `INITIAL_USER_PASSWORD` in the shell or `.env`, run the command, then remove the plaintext password from the environment:

```bash
npm run user:create
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The dashboard opens after login. Seeded records use `DEMO:` prefixes or explicit demonstration notes and are not real Adobe performance data.

For interface-only review without PostgreSQL, set `AUTH_BYPASS=true` in development. Forms and visual interactions work in demo mode, but persisted workflow operations require PostgreSQL. Never enable this bypass in production.

## Environment variables

| Variable                                                             | Required            | Purpose                                                                  |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                                                       | Yes for persistence | PostgreSQL connection                                                    |
| `POSTGRES_PASSWORD`                                                  | Production Docker   | Password used by the private PostgreSQL Compose service                  |
| `THOOCK_APP_PORT`                                                    | Production Docker   | Loopback host port for Nginx; defaults to `3000`                          |
| `SESSION_SECRET`                                                     | Yes                 | HMAC signing secret, use at least 32 random characters                   |
| `INITIAL_USER_EMAIL`                                                 | Setup only          | Owner created by `npm run user:create`                                   |
| `INITIAL_USER_PASSWORD`                                              | Setup only          | Plaintext setup input, remove immediately after hashing                  |
| `APP_USER_EMAIL` / `APP_PASSWORD_HASH`                               | Optional            | Database-free login fallback                                             |
| `AUTH_BYPASS`                                                        | Development only    | Skips login locally when set to `true`                                   |
| `APP_TIME_ZONE_OFFSET_MINUTES`                                      | No                  | Calendar-filter UTC offset; defaults to 420 for Asia/Jakarta              |
| `MOCK_MODE`                                                          | No                  | Defaults provider selection to free deterministic adapters               |
| `GENERATION_MODEL_CATALOG_JSON`                                      | Optional            | Server-only model capability and price overrides                         |
| `MODEL_CATALOG_SOURCE`                                               | Optional            | Set to `database` to load capability records from PostgreSQL             |
| `SNAPGEN_API_BASE_URL` / `SNAPGEN_API_KEY` | Optional            | SnapGenAI image-generation adapter                                  |
| `CLOUDFLARE_WORKER_AI_URL` / `CLOUDFLARE_WORKER_AI_API_KEY`         | Optional            | Owner-controlled Workers AI endpoint and bearer credential               |
| `CLOUDFLARE_WORKER_AI_ESTIMATED_COST_USD_PER_IMAGE`                 | Optional            | Owner-supplied estimate required before Cloudflare models are enabled     |
| `BFL_API_BASE_URL` / `BFL_API_KEY`                                   | Optional            | Black Forest Labs generation adapter                                     |
| `GEMINI_API_KEY`                                                     | Optional            | Gemini commercial prompts, metadata, and image generation                |
| `OPENAI_API_KEY`                                                     | Optional            | OpenAI research, briefs, prompts, and metadata; remains server-side       |
| `OPENAI_TEXT_MODEL`                                                  | Optional            | OpenAI brief, prompt, and metadata model; defaults to `gpt-5.6-luna`      |
| `OPENAI_TEXT_TIMEOUT_MS`                                             | Optional            | Timeout for OpenAI structured text operations; defaults to 120000 ms      |
| `OPENAI_RESEARCH_MODEL`                                              | Optional            | OpenAI research model; defaults to `gpt-5.6-luna`                         |
| `OPENAI_RESEARCH_WEB_SEARCH`                                         | Optional            | Enables current web research unless set to `false`                        |
| `APP_LOG_LEVEL`                                                      | Optional            | JSON console log threshold: `debug`, `info`, `warn`, or `error`           |
| `STABILITY_API_KEY`                                                  | Optional            | Stability Fast, Conservative, and optionally Creative upscale            |
| `STABILITY_*_UPSCALE_COST_USD`                                       | Optional            | Manually verified paid-upscale prices                                    |
| `ENABLE_CREATIVE_UPSCALE`                                            | Optional            | Disabled unless exactly `true`                                           |
| `LOCAL_UPSCALE_ENABLED`                                              | Optional            | Enables the local adapter only when a worker target is also configured   |
| `LOCAL_UPSCALE_URL`                                                  | Optional            | Controlled Real-ESRGAN-compatible HTTP worker                            |
| `LOCAL_UPSCALE_EXECUTABLE`                                           | Optional            | Fixed local executable invoked without a shell or user command arguments |
| `ADOBE_STOCK_API_URL` / `ADOBE_STOCK_API_KEY`                        | Optional            | Configured Adobe research endpoint                                       |
| `LOCAL_STORAGE_PATH`                                                 | No                  | Defaults to `./storage`                                                  |

No provider key is included in client code or browser responses.

## Database and jobs

Generate and apply migrations with:

```bash
npm run db:generate
npm run db:migrate
```

The active schema records opportunities, signals, briefs, generation model capabilities, generation jobs, provider request logs, generated assets, derived assets, reviews, checks, metadata, upscale jobs, export batches, prohibited terms, settings, and the single user. Legacy submission and royalty tables remain dormant to preserve existing data. Generation jobs snapshot strategy, provider, model, resolution, quality, aspect ratio, requested dimensions, seed, pricing, commercial terms, and capability configuration. Generated assets retain provider-reported dimensions separately from locally inspected dimensions.

`generation_jobs` and `upscale_jobs` form a PostgreSQL-backed job ledger. Each stores an idempotency key, provider request IDs, cost estimate, actual cost, progress/status, attempts, and errors. When a brief is selected, generation history defaults to that brief and can be switched to all history. The screen includes error guidance, direct links to the matching provider log, and a manually confirmed retry action. A retry receives a fresh idempotency key and `retry_of_job_id`, preserving every attempt instead of overwriting its source. Failed jobs return their brief to `ready`; running jobs with no update for 15 minutes can be explicitly marked interrupted and then retried. Paid retries are never automatic, and an interrupted paid request is treated as having unknown charge status until its provider log is reviewed.

Generation provider execution still occurs inside the server request in this MVP; retry history, regeneration lineage, and stale recovery are durable, but this is not yet a detached worker. A failed retry links through `retry_of_job_id`; a reviewed image regenerated with the same settings links separately through `regenerate_of_job_id`. Paid retries and regenerations always require confirmation. A future small VPS worker can claim queued rows with `FOR UPDATE SKIP LOCKED` so work survives an application-process restart. Redis and provider webhooks are not required for that design.

Opportunities and Commercial Briefs use server-backed pagination. Opportunity queries support topic/region search, type and status filters, inclusive creation-date ranges, score/date/supply sorting, and configurable page size. Brief queries support text search, status, orientation and source filters, inclusive updated-date ranges, updated/name sorting, and configurable page size. Filter dialogs write their applied state to URL query parameters so a filtered view survives refresh, participates in browser history, and can be shared. Generation history and provider logs also support inclusive date ranges; the end date covers the complete calendar day using `APP_TIME_ZONE_OFFSET_MINUTES` (Asia/Jakarta UTC+7 by default).

## Mock provider workflow

Mock mode is on by default. It offers deterministic multi-topic research, bulk creation of distinct commercial briefs, commercial prompt construction, clearly labeled mock JPEG candidates, real Sharp inspection, and free mock AI-upscale derivatives. For the no-key workflow, Adobe metadata is supplied at the brief stage and inherited by approved assets; Thoock creates only the unique filename locally. The persisted export endpoint prepares approved assets and builds real JPEG and ZIP bytes on the server.

The research assistant does not have privileged Adobe sales data. Its competition counts and 0–100 signals are provisional estimates, clearly stored as estimates. Verify Adobe search-result supply manually before spending money, and prefer your own later acceptance/download evidence over AI scores.

### Connected production walkthrough

1. Open **Opportunities** and choose **Research with AI**. The deterministic adapter works without credentials; select Gemini after setting `GEMINI_API_KEY`, or OpenAI after setting `OPENAI_API_KEY`.
2. Open a saved opportunity and choose **Create briefs**. Select how many distinct concepts the brief writer should create.
3. You can also choose **Add manually** for one brief or **Import CSV** for a reviewed batch from an external chat agent. Both can optionally connect to saved opportunities, blank prompts receive a free deterministic starter, and Adobe metadata can be entered before generation.
4. Open a brief card to edit its commercial direction, generation prompt, and reusable Adobe metadata plan. Changes persist in PostgreSQL.
5. Choose **Use in generation**. Thoock navigates to a durable `/generation?brief=<id>` URL and reloads the selected brief from PostgreSQL, so refreshing the page does not lose it. Configure provider/model/resolution/quality/candidate count, review the cost, and confirm.
   Alternatively, select several cards on **Commercial briefs** and choose **Generate selected**. The bulk dialog uses one provider/model/resolution selection and creates exactly one image per eligible brief. Successful briefs are skipped by default, requests run sequentially, and failures are not retried automatically.
6. Generated files are inspected locally and saved to **Review**. Complete every human check before approval; approval copies the brief metadata plan into an asset-specific, editable metadata record without calling an AI API. **Regenerate** creates a confirmed, linked generation attempt with the original settings instead of only applying a label.
7. For one approved asset, use **Download JPEG** in its review modal. For a batch, use **Adobe exports** to download the ZIP and CSV. Both paths share the same server-side review, metadata, JPEG, and minimum-4MP gates.
   The export page records package history from existing export batches and shows whether each image has never been exported, its latest package date, and how many packages included it. This is packaging history only, not Adobe submission or acceptance data.

Mock assets are never presented as real Adobe results or evidence of customer demand.

## Provider catalog and generation setup

Paid provider seed entries are deliberately disabled and have `null` prices. This prevents stale or invented prices from entering a budget decision. Configure records in `generation_model_capabilities` and set `MODEL_CATALOG_SOURCE=database`, or provide a server-only `GENERATION_MODEL_CATALOG_JSON` array using the shape in `src/lib/domain/model-catalog.ts`. JSON overrides take precedence. Verify and record:

- provider/model identifiers and enabled status;
- supported resolutions, aspect ratios, quality levels, and expected dimensions;
- format, negative-prompt, seed, and reference-image support;
- per-image price or other pricing unit, credit cost, and verification date;
- commercial-use status and terms reference.

If a complete price is unavailable, the UI displays **Cost unavailable**. Paid execution is blocked until a per-image price can be included in the shared monthly budget.

### Provider request logs

Open **Provider logs** in the sidebar to inspect image generation, AI research, commercial-brief writing, prompt writing, metadata, recovery, and logo-removal provider operations. One row is created immediately before the external operation runs, then updated with success or failure, duration, provider request IDs, estimated/actual cost, and a sanitized response summary. Providers may expose their normalized external request shape; credentials and binary image data are never stored.

### Server and API logs

Thoock writes one structured JSON object per console line. Every API route emits `api.request.started` and `api.request.completed` (or `api.request.failed`) with method, path, response status, duration, and a request ID. The same request ID is included in related `provider.request.*` events and returned to the client as the `x-request-id` response header. Unhandled Next.js server errors are captured through `src/instrumentation.ts`.

Set `APP_LOG_LEVEL` to `debug`, `info`, `warn`, or `error`; production defaults to `info`. Request bodies, cookies, authorization headers, configured credentials, and binary image bytes are not printed. Query parameters with sensitive names are redacted. With Docker Compose, follow the application console using `docker compose -f docker-compose.prod.yml logs -f app`.

The log keeps the validated API body and normalized provider input so prompts, dimensions, model settings, candidate count, and seed can be diagnosed. It never stores request headers, authorization values, cookies, provider credentials, or image bytes. Known sensitive object keys are redacted, binary values are replaced with a byte count, and provider error messages are scrubbed for bearer tokens and configured API secrets. Because prompts remain private creative data, the page and API are protected by the same single-owner session as the rest of Thoock.

Apply migration `0005_curious_firedrake.sql` before using this page. Logging begins with requests made after the migration; earlier provider calls are not backfilled.

### SnapGenAI

Set `SNAPGEN_API_BASE_URL` (normally `https://api.snapgen.ai`) and `SNAPGEN_API_KEY`, then restart the application. The adapter follows SnapGen's multipart contracts with the `x-api-key` header. Nano Banana requests use `/uapi/v1/generate_image`, [Grok Image](https://docs.snapgen.ai/resources/1.grok_image) uses `/uapi/v1/imagen/grok`, and [GPT Image 2](https://docs.snapgen.ai/resources/3.gpt-image-2) uses `/uapi/v1/imagen/gpt-image-2`. Grok exposes provider-controlled landscape, portrait, and square output with Speed or Quality mode; Thoock always inspects the returned file instead of treating its planning dimensions as authoritative. Each candidate is a separate request, and asynchronous jobs are polled through the [history endpoint](https://docs.snapgen.ai/resources/history-apis) before the resulting image is downloaded.

Thoock saves each SnapGen history UUID immediately after the provider accepts a generation, before it begins polling. If a later history lookup times out even though SnapGen completed the image, use **Generation history → Check provider result**. The checker performs a history-only lookup and imports a completed result without creating another generation. When the initial generation request itself times out before returning a UUID, Thoock searches the latest provider history for an exact prompt/model match within the request-time window. A UUID can still be pasted as an advanced fallback if multiple matches are found. Repeated checks are idempotent, and searches/lookups appear in Provider Logs as `history_search` and `history_lookup` operations.

Nano outputs also pass through SnapGen's [logo-removal endpoint](https://docs.snapgen.ai/resources/logo-removal) after generation. Thoock automatically uses only the free `fast` mode, polls the asynchronous cleanup job, inspects the returned bytes locally, and stores the result as a `logo_removed` derived asset. The original provider output is never overwritten. Review, single-image download, and Adobe export prefer the cleaned derivative; export is blocked for a Nano image until cleanup succeeds. A failed cleanup remains visible in the review modal and can be retried without regenerating the image. Paid `pro` removal is not run automatically.

With the default catalog source, Thoock activates Nano Banana Pro, Nano Banana 2, Nano Banana 2 Lite, and GPT Image 2 Low/Medium/High. The UI exposes 1K, 2K, and 4K requests and model-specific aspect ratios; GPT Image 2 maps the selected variant to its `mode` field. Price remains **Cost unavailable** rather than being invented, and every paid request still needs owner confirmation. Requested resolution is never treated as proof of compliance: actual files are inspected locally after download. The built-in MVP catalog intentionally stops at 4K; use `GENERATION_MODEL_CATALOG_JSON` if you decide to verify and enable more capabilities later.

### Cloudflare Workers AI

The Cloudflare adapter targets an owner-controlled Worker that accepts a bearer token and returns one raw image response per POST. Configure:

```bash
CLOUDFLARE_WORKER_AI_URL=https://your-worker.your-subdomain.workers.dev/
CLOUDFLARE_WORKER_AI_API_KEY=the-same-value-as-your-worker-API_KEY-secret
CLOUDFLARE_WORKER_AI_ESTIMATED_COST_USD_PER_IMAGE=0.0042
```

The cost above is an example shape, not a current Cloudflare price. Replace it with your own conservative estimate for the account and models you use. When all three values are present with a non-negative cost, the default catalog enables these text-to-image entries:

- `@cf/black-forest-labs/flux-1-schnell`
- `@cf/bytedance/stable-diffusion-xl-lightning`
- `@cf/lykon/dreamshaper-8-lcm`
- `@cf/stabilityai/stable-diffusion-xl-base-1.0`

Choose **Custom** on Image generation, then select **Cloudflare Workers AI**, model, requested long edge, aspect ratio, and candidate count. The current adapter intentionally sends only `prompt`, `model`, `width`, and `height` to this Worker and records those exact JSON bodies in **Provider logs** without the authorization header. Negative prompt, steps, guidance, and seed are not advertised or sent for this provider. The Worker produces one raw JPEG response per request, so Thoock sends one confirmed request per candidate. It never retries a paid failure automatically. Provider-reported dimensions remain unknown; Sharp inspects the returned bytes and the normal review, selective-upscale, 4MP, metadata, and export gates apply.

The image-to-image and inpainting models in the example Worker allowlist are not enabled by Thoock’s text-to-image form because that Worker contract does not accept source image or mask bytes. They can be added after both the Worker contract and generation form support those inputs.

Set the Worker `API_KEY` as a Cloudflare secret and make the Worker fail closed when it is absent. Thoock does not rely on browser CORS because it calls the Worker only from the server. Keep commercial-use status unverified until you manually confirm the selected model and Cloudflare terms.

### Black Forest Labs

Set `BFL_API_KEY` and `BFL_API_BASE_URL`, then configure an enabled model record whose `providerModelId` maps to the intended endpoint. The adapter submits an asynchronous job and polls the returned provider URL. Review current model endpoints, prices, and terms in the [official Black Forest Labs documentation](https://docs.bfl.ai/).

### Gemini / Imagen

1. Obtain a Gemini API key from Google AI Studio.
2. Set `GEMINI_API_KEY` only in the server environment.
3. Add or override a Gemini capability record with a currently supported model, resolution, expected dimensions, and verified price.
4. Enable that record only after recording current commercial terms and verification dates.
5. Keep mock mode available for testing.

The adapter sends the capability-selected aspect ratio and image-size option. A 1K/2K/4K label is never treated as proof of compliance. Thoock inspects every returned file and bases the 4MP decision on actual pixel dimensions.

Google model names, pricing, output capabilities, and terms can change. Recheck the [official Gemini image-generation documentation](https://ai.google.dev/gemini-api/docs/image-generation) before paid use.

### OpenAI research and production text

1. Create an OpenAI API key and set `OPENAI_API_KEY` only in the server environment.
2. Optionally override `OPENAI_RESEARCH_MODEL` for research and `OPENAI_TEXT_MODEL` for briefs, prompts, and metadata; both default to `gpt-5.6-luna`.
3. Keep `OPENAI_RESEARCH_WEB_SEARCH=true` for current regional and trend evidence, or set it to `false` for model-only research.
4. Open **Opportunities → Add opportunity → Research with AI**, then select **OpenAI with web research**.
5. Open **Commercial briefs → Add brief → Create with AI** to select OpenAI for bulk brief creation. When mock mode is disabled and OpenAI is configured, OpenAI is also the default prompt and metadata-draft provider.

The adapters call the server-side Responses API with strict structured output and `store: false`. Returned topics still contain directional supply estimates and provisional 0–100 scores—not Adobe demand or sales data. Briefs, prompts, and metadata remain editable drafts that require human review. Model availability, web-search support, and API pricing can change; recheck the [official OpenAI structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs) before production use.

## Stability upscale setup

1. Set `STABILITY_API_KEY` on the server.
2. Keep `ENABLE_CREATIVE_UPSCALE=false` unless heavy reinterpretation is intentionally required.
3. Review the estimate and confirm every paid request.
4. Complete the post-upscale checklist before preparation.

Fast and Conservative use the current Stability v2beta endpoints. Creative is asynchronous and disabled by default. Stability methods can add generated detail even when described as conservative. Recheck the [official Stability API reference](https://platform.stability.ai/docs/api-reference) and pricing before paid use.

## Local upscale setup

Local upscaling is optional and disabled unless explicitly configured. The application does not download model weights during installation.

HTTP worker mode:

```bash
LOCAL_UPSCALE_ENABLED=true
LOCAL_UPSCALE_URL=http://127.0.0.1:8787/upscale
```

Executable mode:

```bash
LOCAL_UPSCALE_ENABLED=true
LOCAL_UPSCALE_EXECUTABLE=/opt/realesrgan/realesrgan-ncnn-vulkan
```

Executable mode uses Node `execFile` without a shell and supplies only fixed `-i`, `-o`, and `-s` arguments. It never executes a user-supplied command string. Install compatible weights and the executable separately, keep the worker bound to localhost, and test its output before production. Results are derived assets, inspected locally, and require post-upscale human review.

## Upscaling workflow

```text
Choose strategy and compare full cost -> generate candidates -> inspect actual files -> human selection
  -> at least 4MP: Noop, prepare after review
  -> below 4MP: choose method and confirm cost
      -> create derived asset -> compare at 100% -> post-upscale review
          -> prepare final JPEG
```

- Economical candidates are the default; direct-compliant generation is recommended when the complete selective-upscale pipeline is dearer, upscaling is unavailable, or the configured method may substantially reinterpret detail.
- Sharp resizing uses Lanczos interpolation. It is not AI upscaling and does not restore missing detail.
- AI upscaling may invent or reinterpret detail.
- Only selected, approved candidates can be upscaled.
- Rejected, unreviewed, and already-4MP assets are ineligible by default.
- The original generated asset is always preserved.
- Below-4MP processing targets at least 4.2MP as a small safety margin; export still enforces the configurable 4MP minimum against the final inspected JPEG.

## Adobe export workflow

The export service enforces JPEG, at least 4MP, 30-character filenames, 70-character titles, 5-50 unique ordered single-word keywords, a valid Adobe Stock category code from 1-21, 5,000 CSV rows, and a 1MB CSV limit. Keyword phrases are split while preserving first-occurrence relevance order, so `happy house, man, travel` exports as `happy,house,man,travel`; migration `0007_normalize_adobe_keywords.sql` applies the same rule to existing metadata. The metadata editor displays the current 21 Contributor Portal labels but stores and exports the numeric category code required by Adobe CSV. Captured portal keys such as `10162` are not exported as category values. Migration `0006_normalize_adobe_categories.sql` converts known legacy labels and portal keys while deliberately leaving unknown values invalid for manual correction. It creates:

```text
prepared-image.jpg
adobe-stock.csv
manifest.json
compliance-report.json
```

The CSV uses exact prepared filenames. Upload, AI labeling, fictional people/property labeling, and final submission remain manual in Adobe Contributor Portal. Adobe acceptance is not guaranteed.

Adobe Stock rules and CSV conventions can change. Recheck current Contributor guidance before every production batch. The user remains responsible for intellectual-property, factual, and visual-quality review.

## Cost controls

The initial monthly limit is Rp500,000 with a configurable USD/IDR rate. Generation and upscaling share the same ledger. Projected spending triggers a warning at 80% and a hard stop at 100%. A manual override must be enabled and confirmed for the individual request. Paid failures do not retry automatically.

The economical estimate includes the expected selected upscale rather than comparing generation prices alone:

```text
economical = candidateCount × economicalPrice + expectedSelectedCount × upscalePrice
direct     = candidateCount × directCompliantPrice
break-even upscale = candidateCount × (directPrice - economicalPrice)
```

`expectedSelectedCount` defaults to one. Unknown inputs produce “Cost unavailable”; they are never replaced with invented values.

## Testing and verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Unit tests cover opportunity scoring, commercial prompt construction, metadata constraints, filenames, ordered keywords, prohibited terms, cost and budget rules, full-pipeline recommendation and break-even math, provider response normalization, perceptual similarity, megapixels, upscale decisions, the 4.2MP preparation target, CSV generation, and JPEG validation. Integration tests exercise opportunity creation, brief conversion, mock generation and inspection, candidate review, mock upscaling, final review, metadata, and ZIP export.

The full happy path is covered at the service boundary. A browser-level Playwright suite is intentionally deferred because the current critical behavior is server/domain-heavy and the project keeps its dependency and VPS footprint small.

## Docker and VPS deployment

For a local database only:

```bash
docker compose up -d postgres
```

For production, clone this repository to `/opt/thoock/app` (or another dedicated absolute path), create `.env.production`, and set `POSTGRES_PASSWORD`, `SESSION_SECRET`, and any provider credentials. Use a URL-safe database password such as the output of `openssl rand -hex 32`, because Compose places it in the PostgreSQL connection URL. Keep the environment file only on the VPS with mode `600`.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres
docker compose --env-file .env.production -f docker-compose.prod.yml build app
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm app node scripts/migrate.mjs
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app
docker compose --env-file .env.production -f docker-compose.prod.yml exec app node scripts/create-user.mjs
```

Run the final `create-user` command only for initial setup or an intentional password reset. Remove `INITIAL_USER_PASSWORD` from `.env.production` afterward, then run `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate app` so the plaintext password is no longer present in the container environment.

### Capacity planning

Thoock does not need a GPU when generation and upscaling use external providers. CPU and memory are mainly consumed by Next.js, PostgreSQL, Sharp image inspection/preparation, thumbnail generation, and ZIP creation. Sharp works with decoded pixel buffers, so a 16.9MP source can temporarily require far more memory than its compressed JPEG or PNG size. Large export batches are the main reason not to deploy the combined app and database on a 2GB VPS.

| Profile | Suitable workload | vCPU | RAM | Local SSD/NVMe | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| Functional floor | Evaluation or up to about 1,000 assets with small export batches | 2 | 4GB | 80GB | Add 2-4GB swap; avoid concurrent large exports. |
| Recommended single-user deployment | Current workflow, provider API calls, and routine image preparation | 4 | 8GB | 100GB | Best starting point for this project. Keep backups off the VPS. |
| Growing portfolio | About 1,000-5,000 optimized assets or larger export batches | 4-8 | 8-16GB | 200GB, or 80-100GB plus object storage | Move asset blobs to S3-compatible storage before the local disk becomes an operational constraint. |
| Large archive | More than about 5,000-10,000 assets | 8 | 16GB | 300-500GB, preferably object storage | A separate PostgreSQL service is optional, not an MVP requirement. |

The storage estimates are based on the October 2026 reference dataset: approximately 429 generated originals occupied about 11GiB after including original files, logo-removed derivatives, prepared JPEGs, thumbnails, and retained export ZIPs. That is roughly 26MiB per generated item in the current layout. Preserving originals while storing future logo-removed derivatives as high-quality JPEGs and expiring reproducible ZIPs should reduce the active target to roughly 12-14MiB per item. At that target, 1,000 assets need about 12-14GiB for image data and 5,000 need about 60-70GiB, before database data, Docker images, temporary export space, logs, and backups.

These numbers are planning estimates, not quotas. Re-measure after each additional 500 assets or after changing providers because dimensions and PNG compressibility vary substantially. Keep normal disk use below 70%, investigate at 80%, and pause generation/export work at 85% until capacity is added or reproducible data is safely cleared.

### Safe storage-improvement rollout

The storage improvements are safe for existing data only when introduced incrementally. None of the following should overwrite an original generated asset.

| Change | Safety | Required guardrail |
| --- | --- | --- |
| Generate smaller thumbnails and clear a reproducible thumbnail cache | Low risk | Confirm a missing thumbnail is regenerated correctly before clearing the cache. |
| Store **new** logo-removed results as high-quality JPEGs | Low-to-medium risk | Write a new derived file, inspect it with Sharp, verify dimensions/checksum, then save its database reference. Preserve the source file. |
| Expire downloaded export ZIPs | Medium risk | Keep export-batch metadata and first implement a clear missing-file state or package regeneration action. Do not delete ZIPs while the UI assumes every historical download remains available. |
| Convert existing large derived PNGs | Medium-to-high risk | Copy-convert-inspect-switch the database reference, quarantine the old file, and delete it only after a backup and a verification period. Never convert in place. |
| Delete unreferenced files | High risk without tooling | Use a dry-run report that compares storage keys with every database reference, apply a grace period, move candidates to quarantine, and delete only after a second verification. |
| Delete generated originals | Not recommended | Archive rejected originals manually only when their lineage and audit value are no longer required. Approved or derived assets must retain their source. |

The first implementation should affect new writes only and run behind a configuration flag or a small canary. Validate at least ten representative images, including fine textures and gradients, before making it the default. Existing files should remain untouched until there is a tested migration command with `--dry-run`, resumability, checksums, a quarantine period, and a database backup. This sequence avoids broken asset references and permits rollback.

Thoock now stores new successful SnapGen logo-removal results as inspected, high-quality JPEG derivatives. Each generated asset has an explicit canonical-derived pointer: a failed cleanup leaves that pointer and the visible image unchanged, while a successful automatic or manually retried cleanup switches the pointer atomically and invalidates any previously prepared JPEG. Review thumbnails, downloads, dashboard previews, preparation, and exports then resolve through the same canonical image. The provider original remains preserved for lineage and rollback; no existing original is deleted by this change.

### Deployment plan

1. **Choose the initial host.** Use Ubuntu 24.04 LTS with the recommended 4-vCPU, 8GB RAM, and 100GB SSD/NVMe profile. Point the domain to it, but do not expose PostgreSQL or the application container directly to the internet.
2. **Back up the current installation.** During a short no-write maintenance window, create a PostgreSQL dump and copy the complete local storage directory. The database and files are one logical snapshot because database rows contain storage keys. Verify that both backups can be read before deployment.
3. **Provision the VPS once.** Run `scripts/setup-vm.sh` as root, review the firewall, add the restricted deploy user's SSH key, and keep the repository checkout under `/opt/thoock/app`. The script installs Docker, Nginx, Certbot, and the deployment prerequisites.
4. **Configure secrets on the VPS.** Edit `.env.production` there, keep it mode `600`, set the owner credentials and provider keys, and leave `AUTH_BYPASS` disabled. Never place production credentials in GitHub variables, the repository, an image, or a database seed.
5. **Restore existing data together.** Start PostgreSQL, restore the database snapshot, copy the asset tree into the `stocklab_assets` volume while the app is stopped, and then run migrations. For a new empty installation, use the standard Compose commands above instead.
6. **Validate before opening traffic.** Compare database row counts, storage size, and a sample of original/derived checksums with the source installation. Test login, one existing image preview/download, a mock generation, review, metadata preparation, and a small ZIP export.
7. **Enable Nginx and TLS.** Run `scripts/setup-nginx.sh` after DNS resolves. Keep the Docker port bound to loopback and confirm HTTPS redirects and the configured upload limit.
8. **Enable CI/CD.** Add the protected GitHub `production` environment only after the manual deployment works. A production deployment should start only when no generation, upscale, logo-removal, or export request is running, because the current modular-monolith request execution is durable in the database but not a detached worker.
9. **Operate and back up.** Send daily PostgreSQL dumps and asset backups to a different machine or object-storage account. A practical starting policy is seven daily and four weekly restore points. Test a restore periodically; a backup that has never been restored is not yet verified.

The current deployment script performs a checked, fast-forward deployment and a health check, but it is not zero-downtime and does not automatically roll back database migrations. Before schema-changing releases, take a database backup, retain the prior Git revision/image, and schedule a brief maintenance window. Deploying application-only changes can still replace the container, so do not deploy during a paid provider request.

### GitHub Actions deployment

`.github/workflows/ci-cd.yml` runs linting, type checking, tests, a Next.js production build, and a Docker build. A push to `main` deploys only after all checks pass. Application and provider secrets are never copied through GitHub Actions; `.env.production` remains on the VPS.

Create a protected GitHub environment named `production` and configure these environment secrets:

- `VPS_HOST`: the VPS hostname or IP address;
- `VPS_USER`: a restricted deployment user with Docker access;
- `VPS_SSH_PRIVATE_KEY`: the private key for that user;
- `VPS_SSH_KNOWN_HOSTS`: the pinned `known_hosts` entry for the VPS, collected through a trusted channel.

Optional GitHub environment variables:

- `VPS_DEPLOY_DIR`: defaults to `/opt/thoock/app`;
- `VPS_SSH_PORT`: defaults to `22`;
- `VPS_APP_PORT`: loopback-only host port used by Docker and Nginx, defaults to `3000`.

Prepare the VPS once:

```bash
sudo install -d -o "$USER" -g "$USER" /opt/thoock/app
git clone https://github.com/raka-yuda/thoock.git /opt/thoock/app
cd /opt/thoock/app
cp .env.example .env.production
chmod 600 .env.production
```

Edit `.env.production` directly on the VPS before enabling the workflow. The deployment script performs a fast-forward-only update, verifies that the checked-out commit matches the revision that passed CI, builds the image, starts PostgreSQL, applies migrations, replaces the app container, and checks the login page on `VPS_APP_PORT`. It does not seed demo data or reset the owner password. For a private repository, configure a read-only GitHub deploy key on the VPS checkout.

Place Nginx in front of `127.0.0.1:<VPS_APP_PORT>`, terminate TLS with Certbot, set a suitable upload-body limit, and proxy standard forwarding headers. The Nginx upstream port and the GitHub `VPS_APP_PORT` variable must match. Back up both the PostgreSQL volume and `stocklab_assets`. Restrict SSH, enable a firewall, and avoid exposing PostgreSQL publicly.

The production image uses Next.js standalone output and runs as an unprivileged user. Local GPU infrastructure is not required. Use the capacity table above instead of assuming compressed image size represents Sharp's peak memory requirement.

## Engineering decisions

- **Modular monolith:** The workflows share transactions and domain rules, so one deployable is simpler and cheaper than microservices.
- **Provider interfaces and capability records:** External response shapes stay inside adapters; mutable model options, prices, and terms stay in data. Jobs snapshot that data for historical cost accuracy.
- **Selective upscaling:** Upscaling every candidate spends money before human value is known. Thoock selects first, then upscales only if required.
- **Mandatory human review:** Automated inspection can measure files and flag text or similarity, but it cannot reliably clear anatomy, trademarks, people, events, or licensing risk.
- **Separate source and derived assets:** Preserving originals makes comparisons, audit reports, retries, and alternate preparation methods safe.
- **Monthly budget enforcement:** Estimated generation and upscaling costs are checked together before work is queued. A hard stop is cheaper and more reliable than a reporting-only dashboard.

## Compliance limitations

Thoock is an advisory production tool. It does not guarantee Adobe acceptance, legal clearance, model-release sufficiency, factual accuracy, or that AI-upscaled details are faithful. Perceptual similarity flags are inexpensive local heuristics. They never delete files or make licensing decisions.

External provider terms, model availability, prices, Adobe policies, and contributor requirements can change. Manually recheck them before production use.

## Future improvements

- S3-compatible storage adapter
- PostgreSQL worker with row claiming and cancellation
- PostgreSQL settings editor for capability records (the MVP currently supports seed records and server JSON overrides)
- Calibrated duplicate thresholds from a larger private portfolio
- A small Playwright smoke test against a seeded Docker stack
- Automated backup health and storage-capacity warnings
