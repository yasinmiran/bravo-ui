# Triage

A platform for drafting maintenance tickets from inspection findings on an offshore
installation. A client gets a workspace, adds the handover notes that describe how their
engineers triage, keeps the equipment registry as a table they can edit, and submits each
batch of findings as a process. The platform turns the notes into a rules file an engineer
can read and approve, then runs one model call per finding, derives urgency in code, and
puts every draft in front of a human before it becomes a ticket.

This platform was built after the take-home in `../flkr-triage` was submitted, and is not
part of that submission. It generalises that single-command pipeline. The scoring steps are
the same code, hook for hook. What changed is around them: the rules file is extracted per
workspace instead of written by hand, the registry became rows instead of a file, every
fatal exit became a check the screen shows before anything runs, and the pipeline reports
each stage while it runs so the person waiting can see what the model was asked, what it
answered, and which invariant sent it back.

## Run it

```
make install        # backend venv, frontend deps, copies .env.example to .env
make dev            # backend on :8000 with reload, Vite on :5173
```

Open http://127.0.0.1:5173 and sign in with `XYZ123321!`, or with whatever
`TRIAGE_PASSPHRASE` says in the environment or in `backend/.env`. It is one shared secret in
front of the API. There are no users behind it, so give it a value of your own before the app
is reachable from anywhere but your own machine.

Put `ANTHROPIC_API_KEY` in `backend/.env` before extracting rules or submitting a process.
Without a key, set `TRIAGE_FAKE_MODEL=1` and the whole platform runs against the fake model:
a local stand-in for the API, written because the build machine had no key, and deterministic
so the live view and the tests are reproducible. It sleeps `TRIAGE_FAKE_DELAY` seconds per
assessment call, 1.2 unless you change it, and five times that for an extraction call, so each
stage stays on screen long enough to follow. The tests run it with no delay. The PNGs in
`design/` are screenshots of the static HTML mockups next to them, drawn in an earlier palette.

Every setting is an environment variable. One already set in the environment wins over
`backend/.env`, and the file itself is optional.

| Variable | Default | What it sets |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | needed unless the fake model is on |
| `TRIAGE_PASSPHRASE` | `XYZ123321!` | the shared passphrase |
| `TRIAGE_FAKE_MODEL` | `0` | `1` swaps in the fake model |
| `TRIAGE_FAKE_DELAY` | `1.2` | seconds per fake assessment call |
| `TRIAGE_ASSESS_MODEL` | `claude-sonnet-5-5` | the model that scores each finding |
| `TRIAGE_EXTRACT_MODEL` | `claude-opus-5-5` | the model that writes the rules file |
| `TRIAGE_WORKERS` | `4` | findings assessed in parallel |
| `TRIAGE_DB` | `triage.db` | the SQLite file, relative to `backend/` |

Press "Load Bravo example" in the sidebar. The workspace it creates already holds the
handover document and the 18 assets, so steps 1 and 2 are done. In step 3, press "Extract
rules", open the draft when it lands and press "Approve v1". In step 4, "Use the Bravo
example findings" loads the 21 findings; look over the preview, then press "Submit process".

The frontend is shadcn/ui on its stock neutral theme: a collapsible sidebar on the left
holds the workspace list and the new-workspace form, the selected workspace fills the
right. Cmd+B (Ctrl+B) toggles the sidebar.

`make serve` builds the frontend and lets the backend serve it on :8000 alone. `make test`
runs the backend suite and the TypeScript check.

## The four steps

**Knowledge.** One markdown document per workspace, the engineer's handover notes.
Replaceable.

**Assets.** The equipment registry, edited in place. Import a CSV to start, then add rows,
fix a score, or rewrite an engineer comment without touching a file. The Type and Redundancy
filters over the table list every distinct value with its count, because the next step closes
over those values. A type or redundancy string added after the rules were approved puts those
rules out of date; the filter marks the value in red and the Rules step names what is missing.

**Rules.** One model call reads the notes and every engineer comment and writes the rules
file against a JSON schema that names the registry's own equipment types and redundancy
strings. The schema travels in the prompt rather than as a decoding grammar, because the
API rejects a grammar this size; the reply is validated against it, and the coverage check
sends the draft back if the model invented or skipped a value. The call runs live on the
page: intake, the
schema it was given, the attempt and its tokens, validation, the coverage check, the saved
draft. The draft opens as a reading view where every bullet carries its source (a section
of the notes, an equipment id, or "inferred"), with a YAML tab that saves edits as a new
version. A version can only be approved while the coverage check passes, and approved
versions never change.

**Process.** Findings are not stored on the workspace; each file you submit becomes a
process, the unit the original command line called a run. Drop a CSV, see it checked against
the assets, pick an approved rules version, submit. The process then runs in place as a plan
of ten stages, with a spinner wherever work is in flight, and when it is done a Review tickets
button opens the result.

## The live process

Each stage of the pipeline writes an event as it happens, and the process page follows
them over a server-sent stream. Its Pipeline tab puts the stage plan beside one row per
finding, and a row opens to that finding's ladder: batch notes (another finding on the same
equipment, a redundant partner with its own finding this period, a partner missing from the
registry, a voted group), the prompt with its sizes and the equipment section it used, the
model call with attempt number, elapsed time, tokens and whether it came from cache, schema
validation, the four invariant checks named one by one with pass or fail and the retry when
one fails, the urgency derivation with every gate marked applied or not and any override with
its evidence, the review triggers, the ticket. Findings run on four workers unless
`TRIAGE_WORKERS` says otherwise. All of it stays after the process finishes, and the ticket
panel keeps "Prompt as sent" and the "Raw reply" of every attempt that got one, so a ticket can
be checked later against the exact exchange with the model.

The Tickets tab is the review workbench: grouped by urgency band, a detail panel with the
registry prior under each score, the number line for urgency, the model's flags, the batch
notes and every attempt. Ticket ids are buttons, so Tab and Enter open one. In the panel `A`
approves and `R` rejects, though a rejection needs a note first; `J` and `K` or the arrow keys
move, `Esc` closes, and Reopen puts a decided ticket back to pending. The letter and arrow keys
do nothing while you are typing, or while focus sits on a control outside the list and the
panel.

The Export menu saves the tickets in the brief's exact shape, either all of them as
`tickets-process-<n>.json` or only the approved ones as `tickets-process-<n>-approved.json`.
That shape has no field for a decision, so the approved-only file is where the human review
shows up.

## The rules file

Two readers. The model gets `general`, `registry_scores` and the `by_equipment_type` section
for the finding's type, rendered as prose. Code reads `redundancy_vocabulary`,
`protection_layer_types`, `evacuation_types`, `urgency_bands`, `urgency` and `overrides`.
Review triggers stay in code because most of them reference pipeline facts rather than
domain knowledge.

What is fixed across clients: the CSV columns, the six flags the model returns
(`confirmed_failure`, `out_of_service`, `protection_layer_impaired`, `deviation_recorded`,
`evacuation_capacity_reduced`, `uncertainty`), the two override ids, the five band names.
Everything else comes from the extracted file, including which equipment types count as a
protection layer and how each redundancy string in the registry should be read.

Redundancy is the part most likely to need a human edit. The extractor classifies each
distinct string as `none`, `bypass`, `voted` or `partner`, and names the partner tag where
there is one. A string the approved rules do not cover puts them out of date: the coverage
check fails, and Submit stays blocked until a version that covers it is approved. A partner
tag with no row in the registry is softer. Coverage passes with a warning, and every ticket on
that equipment carries a note that the partner cannot be verified, then goes to review.

## Models and cost

Assessment uses `claude-sonnet-5-5`, as the original did. The original's 21-finding run cost
well under a dollar, at about 2,400 input and 1,400 output tokens per call; this platform's cost
has not been measured against the API. Extraction uses `claude-opus-5-5` because it happens
once per workspace and the quality of that one file shapes every ticket after it. Both are
defaults in `backend/app/config.py`, and `TRIAGE_ASSESS_MODEL` and `TRIAGE_EXTRACT_MODEL`
override them.

Replies from the real model are cached in SQLite on the model, the schema, the system prompt
and the messages; the fake model is never cached. Submitting the same findings against the
same approved rules costs nothing and produces the same tickets. Editing the per-type bullets
re-rolls only the findings of that type. Editing urgency weights re-rolls nothing, since the
model never sees them.

A refusal from the model is treated like any other failed call: the ticket is still written,
scored 10 across, marked for manual triage, and the process finishes. No server-side
fallback to another model is configured, deliberately: the cache is keyed on one model id,
and a rerun only comes back the same against that model.

## Layout

```
backend/app/
  main.py                         the FastAPI app, its routers, and the built frontend
  config.py, db.py, llm.py        settings, SQLite, model clients (Anthropic, cache, fake)
  models/                         inputs, rules schema, assessment, ticket
  pipeline/                       cases, notes, prompts, assess, urgency, review, tickets, run, events
  rules/                          extract, validate, yaml_io, template
  api/                            auth, workspaces, assets, rules, processes, jobs, store
  seed/bravo/                     the example data
backend/tests/                    pytest suite against the fake model, one temporary database per test
frontend/src/                     main.tsx (routes), api.ts, theme.ts, index.css (theme tokens),
                                  routes/, components/ (ui/ is shadcn), hooks/, lib/
design/                           the design record and its static HTML mockups; the PNGs show those
                                  mockups in an earlier palette (see the note at the top of DESIGN.md)
```

State lives in one SQLite file rather than in memory, so a restart keeps the workspaces and
a process can be reopened the next day. No ORM, no task queue. Jobs are daemon threads
that write rows; the screen polls the rows and follows the event stream.
