# CareerMatch AI

A Next.js workspace for Canadian job seekers to compare resumes with job descriptions, edit a job-tailored resume, and export PDF/DOCX files. It includes server-side document extraction, deterministic matching, optional consent-based Gemini analysis, and optional account-backed saved work through Supabase Auth and PostgreSQL. Supabase is not provisioned by this repository; account features require your own project configuration.

## Requirements

- Node.js 22.13 or later (required by the current PDF.js release)
- npm, included with Node.js
- Git

## Run locally

From the project directory:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To create a production build and run it locally:

```bash
npm run build
npm start
```

Check TypeScript separately with `npm run typecheck`.

Run automated tests with `npm test`. Gemini tests use mocked provider responses and do not require an API key or make billable calls. Resume export tests generate real PDF and DOCX files in memory, validate PDF text with PDF.js, and reopen DOCX content with Mammoth.

On **Analyze resume**, paste a job description up to 30,000 characters and choose **Analyze job description**. The local rule-based parser identifies likely title, qualifications, skills, responsibilities, and credentials; review and edit its findings. Analyzing does not overwrite your resume upload or any edited findings unless you explicitly analyze the description again. **Clear** starts a fresh job description analysis without removing the resume.

Once resume text and job requirements are available, choose **Analyze Resume Match**. Matching is deterministic and local. It uses explicit phrase/synonym evidence, shows excerpts from the extracted resume, and allows separate manual status corrections. The indicative score uses configurable category weights, redistributes missing category weights proportionally, and excludes needs-review items. A score is withheld when fewer than two classifiable requirements are available. Results remain in page state only and become marked stale if either source changes.

## Resume upload

On **Analyze resume**, choose or drop a PDF/DOCX file up to 5 MB, then select **Extract resume text**. The server validates the upload and extracts plain text in memory; it does not save uploaded files, and resume content is not sent to an AI service. The browser displays the returned text so you can review it. Scanned PDFs with no selectable text are not OCR-processed.

Choosing **Save resume** in the editor stores the extracted text and structured resume content in your private Supabase account. The original PDF/DOCX binary is discarded after parsing.

The default maximum upload size is 5 MiB. To change it, copy `.env.example` to `.env.local` and set `CAREERMATCH_RESUME_MAX_BYTES` to a positive number of bytes, then restart the server. The same configured cap is applied in the browser and server route.

Server request controls also include a PDF page cap (default 80), extracted text cap (200,000 characters), parser deadline (10 seconds), 10-second request-body deadlines, and per-process parse/export concurrency caps (4 each by default). Set `CAREERMATCH_PDF_MAX_PAGES`, `CAREERMATCH_PDF_MAX_TEXT_CHARS`, `CAREERMATCH_PDF_TIMEOUT_MS`, `CAREERMATCH_PARSE_MAX_CONCURRENCY`, and `CAREERMATCH_EXPORT_MAX_CONCURRENCY` to tune them. Hosted deployments should additionally configure their own function concurrency and request-duration limits; in-process parse/export slots do not coordinate across instances.

## Optional Gemini analysis

The deterministic matcher remains local and available without Gemini. To enable the separate AI contextual analysis, create an API key in [Google AI Studio](https://aistudio.google.com/apikey), copy `.env.example` to `.env.local`, and set:

```dotenv
GEMINI_API_KEY=your_server_side_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

`GEMINI_API_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix. Restart `npm run dev` after changing environment settings. The model has a safe default and can be changed with `GEMINI_MODEL`. `.env*` files are ignored by Git except the placeholder-only `.env.example`; never commit a real key.

AI analysis is optional and requires an unchecked-by-default consent checkbox each time the resume, job description, or reviewed requirements change. The consent disclosure explains that extracted resume text and the job description are submitted to Google's Gemini API. Provider data handling and retention depend on Google's current terms and billing tier, which CareerMatch AI cannot guarantee. Avoid unnecessary sensitive personal information. The app does not persist these texts or log them, and AI output never changes the deterministic score. Provider calls are server-side, inputs and responses are size/schema checked, and excerpts are shown only when verified against the resume text.

## Resume editor and export

After extracting a resume, choose **Edit and export resume**, or open **Resume editor** from the sidebar to start a blank draft. The editor lives in in-memory workspace state so it survives navigation between Analyze resume and Resume editor, but refreshing or closing the tab clears it. Imported text is organized conservatively by common section headings; uncertain work and education details remain editable as raw section text for you to organize. The untouched source is preserved separately, and reset requires confirmation.

The live preview uses a single-column, print-friendly layout. Download PDF and Download DOCX generate real documents from the current editor content through local Next.js route handlers; content is not sent to a third-party conversion service and generated files are not saved on the server. Empty resumes are rejected, empty sections are omitted, filenames are sanitized, and long resumes can flow across pages. Review missing-section and long-resume warnings and inspect the final file before applying. Exported documents are designed to be readable and ATS-friendly, but different ATS software can interpret documents differently.

AI edit suggestions are optional and are generated only after the user requests them and checks an unchecked-by-default disclosure. The selected text, original resume text, and relevant job context are sent to the existing server-side Gemini integration. Suggestions are specific to a text field, include the original and proposed wording, explanation, evidence, and related requirement when applicable. They remain pending until accepted, rejected, or edited and accepted; unsupported excerpts are omitted and unsupported new numerical claims become clarification requests. Changing the resume or target job marks previous suggestions as potentially outdated. Suggestions are never silently applied. Automated suggestion tests use mocked output and do not make provider calls.

Automated tests call the analysis service with mocked provider functions, use fictional fixtures, and do not call Google. Manual end-to-end testing requires a configured key, explicit consent in the Analyze resume page, an extracted resume, and reviewed job requirements. The shared Gemini limiter is backed by the Phase 8A.1 Supabase RPC and fails closed if that infrastructure is unavailable. This phase does not provide OCR or provider-side privacy guarantees. All AI output needs human review.

## Supabase Setup (Phase 7)

1. Create a Supabase project in the Supabase dashboard. CareerMatch AI does not create or assume a project, and no service-role key is needed for normal app use.
2. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` to the project's API URL and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its publishable key. Older projects may use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. These are public client keys; database access is restricted by RLS. Never put a service-role or secret key in a `NEXT_PUBLIC_` variable.
3. Install/use the Supabase CLI and initialize/link this folder if it is not linked: `npx supabase init`, `npx supabase login`, then `npx supabase link --project-ref YOUR_PROJECT_REF`. Apply the checked-in migration with `npx supabase db push`. Alternatively, review and run `supabase/migrations/202610090001_phase7_user_data.sql` in the project's SQL Editor. Do not run the migration twice manually after it has been applied.
4. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/update-password` to allowed redirect URLs. Add the equivalent URLs for your own production host only when you configure one.
5. In **Authentication → Providers → Email**, enable email/password and email confirmations as appropriate. Configure SMTP before relying on production confirmation and password-recovery emails. Confirmation and recovery require the allowed redirect URLs above.
6. Restart `npm run dev`, open `/auth`, create an account, and confirm the email if enabled. Account data pages are server-guarded; missing or expired sessions return to sign-in.

The migration creates `profiles`, `resumes`, `job_descriptions`, `match_analyses`, and `job_applications`. Each table has RLS enabled. Profiles and records can be read/updated only by their owner; user-owned records also have owner-checked insert and delete policies. Related resume/job records use composite `(id, user_id)` foreign keys so a guessed UUID cannot link another account's data. Deleting a resume or job description nulls its association on saved analyses/applications and marks affected analyses stale; it does not delete those unrelated records. Deleting an account cascades through that user's records. `delete_my_account()` is a restricted authenticated-only function that can delete only the caller identified by `auth.uid()`.

Saving a resume or job description is explicit and has a separate unchecked-by-default save-consent control. Resume binaries are not stored. Optional Gemini analysis still has a separate per-request consent; saving data does not authorize Gemini submission. The current app does not use a service-role credential or an admin client.

### Verify RLS

Automated tests in `tests/phase7.test.ts` statically check that each private table enables RLS, has owner CRUD policies, uses same-owner related-record constraints, and that browser code has no service-role key. These tests do **not** execute against your Supabase project. For a live check, use fictional accounts A and B after applying the migration:

1. Sign in as A, save a fictional resume and a job description, and note their UUIDs from the rows in the Supabase Table Editor. Sign out, then sign in as B.
2. In the Supabase SQL Editor, which runs as the project administrator, start a transaction and assume B's database role/claims. Replace UUIDs with the test users and verify that A's rows are absent. Roll back when done:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_B_UUID', true);
select set_config('request.jwt.claims', '{"sub":"USER_B_UUID","role":"authenticated"}', true);
select id, name from public.resumes; -- must not include A's resume
select id, job_title from public.job_descriptions; -- must not include A's job
rollback;
```

3. Repeat as A and confirm A sees A's rows. Under B's claims, try `UPDATE` and `DELETE` against A's UUIDs: they must affect zero rows. Try inserting an analysis owned by B but referencing A's resume with a B-owned job description: the composite foreign key must reject it. Check `pg_class.relrowsecurity` for all five tables with:

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'resumes', 'job_descriptions', 'match_analyses', 'job_applications')
order by c.relname;
```

Every row must report `relrowsecurity = true`. Record the outcomes before treating RLS as live-verified. Never disable RLS to get the app working.

### Account deletion

Deletion is available in **Settings → Delete my account**, after a browser confirmation and an authenticated `delete_my_account()` RPC. The function removes only the current auth user; foreign-key cascades delete that user's profile and saved records. Do not grant this function to `anon` or `public`, and do not replace the `auth.uid()` check with a caller-provided ID. A failed RPC is reported as a failure; the app does not claim data deletion succeeded.

## Security Remediation (Phase 8A.1)

The parse and export APIs require a valid server-verified Supabase session. They return `503` when Supabase is not configured and `401` for a missing/invalid session, before reading file/export bodies. Their byte caps, body timeouts, and local concurrency slots are additional controls, not a substitute for host-level function concurrency limits.

Gemini analysis and suggestions require the Supabase shared rate-limit migration below. Per-user, per-feature request counts are stored in the existing Supabase PostgreSQL project, with a fixed one-minute bucket and a database-enforced maximum of five requests per scope. `CAREERMATCH_GEMINI_ANALYZE_LIMIT` and `CAREERMATCH_GEMINI_SUGGEST_LIMIT` can lower the application limits (1-5); the database limit cannot be raised from the client. If the migration/RPC is unavailable, the endpoints fail closed with `503` and do not call Gemini. This adds no external rate-limit service or paid resource, but it does depend on the existing Supabase project being reachable.

Apply the checked-in migrations only after reviewing them and verifying the Supabase project/ref:

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

This applies pending migrations, including `202610100001_gemini_rate_limits.sql` and `202610100002_private_data_limits.sql`; do not run SQL snippets twice manually after applying them. No migration is applied by the app.

The data-limits migration adds `NOT VALID` byte-size checks (512 KiB per structured resume version, 256 KiB reviewed requirements, 512 KiB deterministic analysis result, 256 KiB AI context), plus an account quota of 200 saved records and 50 MiB of serialized saved rows across resumes, jobs, analyses, and applications. The checks do not scan or delete existing rows during migration. Existing rows remain readable; a future update to a row that violates a new check will be rejected until that row is reduced. The account quota trigger also checks the user's total after each insert/update; if existing records already exceed the quota, further writes/updates for that account may be rejected until the user deletes or reduces saved data. Review existing record sizes/counts before applying, then audit and validate the `NOT VALID` constraints in a separately reviewed follow-up migration when data is within bounds. Deletions remain available. These initial limits are operational defaults, not a claim about all future product needs.

`proxy.ts` applies a fresh nonce-based CSP, frame restrictions, `nosniff`, Referrer Policy, and a restrictive Permissions Policy to matched requests. The CSP permits browser connections only to the app and configured Supabase origin (plus its WebSocket origin); Gemini calls are server-side. Production HSTS is emitted by the app only when `NODE_ENV=production`; deploy behind HTTPS, ensure TLS is active before relying on HSTS, and add `includeSubDomains` only after every subdomain is HTTPS-ready. Review CSP reports in the actual hosting/auth setup before deployment. Inline styles remain permitted for the current Next/Tailwind interface; script execution is nonce-based.

## Pages

- Dashboard with clearly marked illustrative activity
- Resume analysis form with server-side PDF/DOCX text extraction, local rule-based findings, deterministic matching, and optional Gemini contextual analysis
- Resume editor with separate original and tailored versions, optional reviewed suggestions, live preview, PDF export, and DOCX export
- My resumes with explicit save, open, rename, and confirmed delete controls
- Saved job descriptions and deterministic analysis history
- Job applications with status, notes, URL, date, and optional saved-record associations
- Interview preparation flow preview
- Settings with temporary market and resume preferences

The remaining preferences and interview preparation preview are not persisted/generated. Resume files are uploaded only to the parsing route, processed in memory, and discarded after the request. Job description analysis and deterministic matching run locally in the browser. Once explicitly saved, text, structured resume content, job descriptions, deterministic results, and optional AI context are stored in Supabase PostgreSQL under the authenticated account's RLS. Optional Gemini analysis and resume editing suggestions still require separate consent. The importer and matching engine use heuristics, so review extracted sections, evidence, and every AI proposal. OCR and interview question generation are not included.

The project has no configured Supabase URL/key, so authentication, password email delivery, SQL migration application, live RLS behavior, and account deletion cannot be exercised until you configure a Supabase project. Mock/static tests do not replace the live RLS procedure above. Local npm tooling must be available to install dependencies and run checks. The SSR adapter is still published as a pre-1.0 package; pin and review upgrades when updating dependencies.

PDFKit's built-in Helvetica font covers common Western punctuation and Canadian French accents; very uncommon scripts or emoji may not be representable in PDF output. Word documents use Arial as a widely available font, with viewer-specific font substitution possible.

## Initialize from an empty directory

Install Node.js from [nodejs.org](https://nodejs.org/), then run the following from the parent directory of the new project:

```bash
npx create-next-app@latest careermatch-ai --use-npm --yes --typescript --tailwind --no-linter --app --src-dir --import-alias '@/*' --no-react-compiler --webpack
cd careermatch-ai
npm run dev
```

The scaffolder initializes a Git repository. If you are setting up manually, run `git init` from the project directory.

## Project layout

```text
src/app/(workspace)/   Auth-protected dashboard and workspace routes
src/app/api/            Temporary parsing, Gemini, and document-export routes
src/components/         Shared navigation, analysis, and resume editor UI
src/lib/                Parsing, matching, editor state, validation, and export logic
tests/                  Parser, editor, mocked Gemini, and real generated-export tests
supabase/migrations/    PostgreSQL schema, ownership policies, triggers, and deletion function
```

Configuration files, dependency versions, and npm scripts live at the project root.
