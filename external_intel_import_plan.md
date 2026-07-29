# External Document Intelligence Import — Build Plan

Status: **planning only, not started**. Written 29 Jul 2026 for review — nothing in
this doc has been built yet. Treat this as a proposal to revise, not a spec to
follow blindly.

## The idea, in one paragraph

An officer uploads a document (photo or scan of a printed page — ID card,
intel report, criminal history printout, etc.). The app OCRs it, splits it
into the document's own titled sections (most of these documents are already
laid out as "Name: ... / Vehicle: ... / Address: ... / Background: ..."),
extracts entities from the structured sections using the extraction logic
already used for running sheet rows, and matches them against the existing
Intelligence picture. Matches attach new information to the existing profile;
non-matches become new entities. Everything from the document — new or
attached-to-existing — is tagged **external source**, kept distinguishable
from running-sheet-derived intelligence, and can be viewed separately or
merged into the normal profile view. Narrative "Background" text is kept
**verbatim**, never summarized or rewritten.

No runtime AI/LLM call anywhere in this — OCR is a local deterministic
library, section-splitting is pattern matching on known headings, and entity
extraction/dedup reuses the existing rule-based pipeline. Consistent with the
Golden Rule in `CLAUDE.md`.

## Confirmed requirements (from conversation)

- Source documents are typed/printed text, not handwriting — OCR accuracy
  should be high.
- Documents are already broken into titled sections — extraction should be
  section-header-driven, not free-form NLP.
- On entity match: **don't create a duplicate**, but **do** attach any new
  information from the document to the existing profile (new address,
  vehicle, associate, etc.), tagged external.
- Narrative/background prose is preserved **word-for-word**, not
  paraphrased or summarized — stored as a labeled "Background" note on the
  profile.
- External-sourced data must be visually/structurally distinguishable from
  running-sheet-derived data at all times — never silently blended in a way
  that loses provenance.
- Must be possible to view a document's contribution in isolation (all-external
  view) or merged into the normal per-entity profile view.
- Matches require a confirm step before merging into an existing profile —
  no silent auto-attach, same principle as the existing dedup pipeline.

## Open questions to settle before/at kickoff

1. **Section headings**: are they consistent enough across document types to
   hardcode a known list (Name, DOB, Address, Vehicle, Associates,
   Background, Employment, etc.), or do we need a looser "any line that looks
   like a heading" heuristic? Bring 2–3 real (redacted if needed) sample
   documents next session so the parser is tuned to real formatting, not
   guessed formatting.
2. **Where does upload live?** A new "External Intel" upload entry point in
   the Intelligence folder, or reuse the existing Images-folder-style manual
   upload flow with a new document category?
3. **Scope of "entity"**: same four types as today (person/vehicle/address/
   business), or does a document also carry things like phone numbers,
   employers, DOB — do those need their own handling or fold into
   "background" as free text?
4. **Multi-page documents**: one image per page, uploaded together as one
   logical document?

## Data model (draft)

New tables, additive only — nothing about existing running-sheet-derived
Intelligence changes.

- **`external_documents`** — one row per uploaded document. `attachmentId`
  (reuses `rowAttachments` storage/upload plumbing), `ocrText` (full raw OCR
  output, kept for audit/re-processing), `uploadedByCIN`, `createdAt`,
  soft-delete columns (matches the existing pattern elsewhere).
- **`external_document_sections`** — one row per parsed section within a
  document. `documentId`, `heading` (e.g. "Background"), `bodyText` (verbatim),
  `sortOrder`.
- **`external_entity_mentions`** — one row per entity extracted from a
  document's structured sections. `documentId`, `type` (person/vehicle/
  address/business), `entityKey` (same normalized-key scheme
  `getAllIntelligenceEntities` already uses), `label`, `matchedExistingKey`
  (nullable — set once an officer confirms a match), `status`
  (pending_review / matched / new_entity), `reviewedByCIN`, `reviewedAt`.
- **`external_background_notes`** — one row per background note attached to
  a resolved entity. `entityKey`, `documentId`, `sectionId` (the verbatim
  section text lives here, referenced not copied), `attachedByCIN`,
  `attachedAt`.

`getAllIntelligenceEntities()` (`server/db.ts`) gets extended to also fold in
occurrences from `external_entity_mentions` (status = matched or new_entity)
the same way it already folds in row-derived occurrences and target aliases —
each occurrence carries a `source: "running_sheet" | "external"` tag that
the client can filter or display on.

## Server pipeline (draft stages)

1. **Upload** — reuse `rowAttachments`-style upload (`storage.ts`), category
   "external_document", not tied to a running sheet row.
2. **OCR** — local library (Tesseract.js is the obvious default: pure JS,
   no native/network dependency, decent accuracy on clean printed text).
   Runs server-side at upload time, result stored in `external_documents.ocrText`.
3. **Section split** — pattern-match known heading formats against the OCR
   text, produce ordered sections into `external_document_sections`.
4. **Structured extraction** — run `extractEntitiesFromText` (or a variant
   tuned to document-section phrasing rather than running-sheet-observation
   phrasing) against each non-Background section, produce candidate
   `external_entity_mentions` rows with `status: "pending_review"`.
5. **Match against existing** — reuse the existing fuzzy-match logic
   (`searchIntelligenceEntities` / the dedup-candidate machinery already
   backing the row-save confirm dialog and manual Merge Entities tool) to
   propose a match or "this looks new" per mention.
6. **Officer review/confirm** — new UI step (see below) — for each mention,
   confirm "yes this is <existing profile>" (attaches) or "no, new entity"
   (creates). Background section(s) get attached to whichever entity the
   officer resolves for that document, or left as document-level notes if
   the document is about no single existing entity.

## Client UI (draft)

- New upload flow (Intelligence folder, or a new "External Docs" section)
  — upload → shows OCR/section-split progress → review screen.
- Review screen: one row per extracted entity mention, each showing the
  extraction + a suggested match (if any) with confirm/reject, mirroring the
  existing possible-match popup pattern from face-recognition and the
  Merge Entities dedup flow — familiar interaction, not a new pattern to learn.
- Background section(s) shown verbatim in a read-only quote block, with a
  picker for "attach to which resolved entity" if the document covers
  several.
- Entity profile view (wherever Intelligence entities are currently
  displayed) gains an "External" badge/tag on any occurrence or background
  note sourced from a document, plus a way to filter to external-only or
  running-sheet-only, and a link back to the source document.

## Suggested build stages

Mirrors how CTO Roster and face-recognition were staged in this project —
small, independently testable increments rather than one big PR.

1. Schema: the four new tables above.
2. OCR + section-split pipeline (server), no entity extraction yet — get
   raw OCR text and parsed sections stored and visible, verify accuracy on
   real sample documents first.
3. Structured extraction + match-candidate generation (server), reusing
   existing extraction/dedup logic.
4. Client upload + review/confirm UI.
5. Wire `external` occurrences + background notes into the existing
   Intelligence entity views (badges, filter, source link).
6. Polish: multi-page documents, re-processing a document if OCR was
   corrected, audit trail entries for import actions.

## Not in scope (flag if this turns out to be wrong)

- No automatic corroboration/conflict detection between external and RS
  data (e.g. document says one address, RS says another) — surfacing that
  as a "these disagree" flag would be a natural follow-on, not part of the
  first build.
- No handwriting OCR — printed/typed text only, per the confirmed scope.
- No attempt to summarize, rephrase, or infer beyond what the document
  literally states — background text is verbatim only.
