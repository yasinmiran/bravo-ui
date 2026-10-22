# Triage design system

> **Superseded in part, 18 Oct 2026; revised 19 Oct 2026.** The shipped frontend uses the
> stock shadcn/ui neutral theme (its oklch palette, `--radius: 0.625rem`, Geist) and the
> shadcn sidebar shell: workspace list and new-workspace form on the left, the selected
> workspace on the right. The workspace page is capped at 70% of the content area, and the cap
> never drops below 52rem; the rules and process pages use the full width. Every token lives
> in `frontend/src/index.css`. The primary colour is near-black (near-white in dark), so
> interaction carries no hue at all. The RAL palette, Atkinson Hyperlegible and the custom
> radius scale below are the earlier direction and are not what ships.
>
> The five urgency bands still stand, ramp and rule: orange encodes urgency and is never
> decorative. They are no longer the only warm hue, though. The destructive red that shadcn
> ships is warm too, and it marks failures, blocks and rejections, always beside an icon and
> a word. The status language, the four gated steps, the process view and the motion table
> stand as revised in their own sections below.

Calibration files next to this one:

- `tokens.css` is the single source for colour, type, space, radius and motion in these mockups. *Revised 19 Oct 2026: the app no longer uses it or any copy of it; the shipped tokens are in `frontend/src/index.css`.*
- `mockup-tickets.html` and `mockup-rules.html` are static, self contained pages built from real Bravo content. Append `?theme=dark` or `?theme=light` to force a theme. On the tickets page, `?view=detail` shows the phone detail view below 960px. On the rules page, `?tab=yaml` opens the editor.
- The PNG files are screenshots of those pages at 1440x1000 and at 390px wide.

## Subject, audience, job

Duty integrity engineers and maintenance planners on an offshore production platform. They work long shifts, often at night, and read dense tables for a living. The primary job is to review drafted tickets fast and catch a wrong score on a Safety Critical Element. Everything else (uploading data, reviewing rules, watching a run) exists so that review is trustworthy.

## The idea

Control rooms on these platforms follow the high performance HMI philosophy: grey screens, and colour only when something is abnormal. An operator's eye goes to colour because colour means "act". Triage borrows that rule whole.

- The interface is neutral. Neutrals are taken from the paint the users see all day: RAL 7035 light grey (every instrument enclosure) for the page, RAL 7016 anthracite for ink.
- One warm hue exists in the product: survival orange, the colour of freefall lifeboats, survival suits and lifejackets. It is spent on exactly one thing, the urgency band.
- Interaction is signal blue (RAL 5005, the "mandatory action" sign colour). Cool, never warm, so a button can never be mistaken for urgency.

**The bold element is the band strip.** The tickets list is grouped by urgency band, and each group opens with a full width strip in its band colour. Scrolling the list, the page shades from rust through orange to sand. You can tell where you are in the queue without reading a number. The same band block heads the detail panel. Everything around it stays quiet.

## Colour tokens

### Base

| Name | Token | Light | Dark | Role |
|---|---|---|---|---|
| Enclosure grey | `--plane` | `#e9ece9` | `#1a2023` | Page background |
| Panel | `--surface` | `#f8f9f7` | `#1e2427` | Table body, panels, document |
| Sunk panel | `--surface-sunk` | `#eff1ee` | `#262e31` | Table header, badges, code |
| Anthracite | `--ink` | `#22292b` | `#e6e9e6` | Primary text |
| Signal blue | `--signal` | `#1f4f8f` | `#8fb6ee` | Links, primary buttons, focus, selection |
| Survival orange | `--band-*` | see bands | see bands | Urgency only |

Supporting neutrals: `--ink-2` `#4b5558` / `#b4bdbc` (secondary text), `--ink-3` `#5d676a` / `#929c9d` (muted, passes AA on every surface), `--rule` `#d5dad7` / `#333c3f` (decorative hairlines), `--rule-strong` `#7f8987` / `#6f797c` (input and control boundaries, 3:1). `--signal-wash` marks the selected row.

Semantic, never decorative, always with an icon and a word:

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ok` | `#1d6e45` | `#72c99d` | Approved, check passed |
| `--danger` | `#a3164f` | `#f28fb4` | Rejected, validation failed |

Danger is a crimson that leans blue on purpose. It sits 9.3 (light) and 15.3 (dark) OKLab units from the "today" band, and it only ever appears as text and icon, never as a fill, so it cannot be confused with a band.

There is no warning colour. A validation problem either blocks the run (unknown equipment, unrecognised redundancy string), which is danger, or it is information (a partner with no registry row), which is ink plus an info icon. Amber would collide with the band ramp.

All text and control pairs were checked from `tokens.css` itself: every text token is at least 4.5:1 on plane, surface, sunk surface and the selected row wash in both themes, and `--rule-strong` is at least 3:1. Never lower text contrast with opacity; use a lighter ink token instead.

### Urgency bands

One hue, safety orange, five steps ordered by distance from the surface. "Today" is always the step furthest from the page: dark rust on the light theme and bright peach on the dark theme. **The same band looks different across themes on purpose. It is not a bug.**

| Band | Urgency | Light fill / label | Dark fill / label |
|---|---|---|---|
| Today | 9 to 10 | `#9d2800` / white, 7.7:1 | `#ffac5a` / `#1a2023`, 8.9:1 |
| This week | 7 to 8 | `#be4500` / white, 5.2:1 | `#f68e40` / `#1a2023`, 7.0:1 |
| This month | 5 to 6 | `#d36c1b` / `#1a2023`, 4.7:1 | `#de7133` / `#1a2023`, 5.1:1 |
| Next planned shutdown | 3 to 4 | `#d58d52` / `#1a2023`, 6.1:1 | `#af5b39` / white, 4.8:1 |
| Backlog | 1 to 2 | `#d3ab85` / `#1a2023`, 7.8:1 | `#824c39` / white, 6.9:1 |

Both ramps pass the dataviz validator's ordinal checks against their own surface: lightness monotone, every adjacent step at least 0.06 apart in OKLCH lightness, hue spread under 40 degrees, and the lightest step at least 2:1 against the surface. Because the steps differ in lightness, not just hue, they stay ordered for protanopes and deuteranopes. Colour is never the only channel. A band always appears with its name or its urgency number, and the list is grouped under named strips.

## Type

**Atkinson Hyperlegible Next**, one family for everything, weights 400 to 800.

It was designed by the Braille Institute to keep confusable glyphs apart. This product is full of strings like `FG-0455`, `INST-2150`, `2oo3` and `PSV-1310`, where reading 0 as O or 1 as l is a safety error. Atkinson Next has a slashed zero, distinct I, l and 1, and tabular figures (`tnum`), so tags, scores and measurements align in columns without a monospace. Tags are set at weight 700 in the same family.

**Atkinson Hyperlegible Mono** appears in one place: the YAML editor and literal YAML keys and redundancy strings, where text is code.

| Token | Size / line height | Use |
|---|---|---|
| `--fs-xs` | 12 / 16 | Badges, table meta, axis labels |
| `--fs-sm` | 13 / 18 | Table cells, secondary text, rationale in score columns |
| `--fs-base` | 15 / 22.4 | Body, rationale, recommended action |
| `--fs-md` | 17 / 24 | Ticket summary in detail, band strip names |
| `--fs-lg` | 20 / 26 | Screen titles, tag in detail header |
| `--fs-xl` | 24 / 30 | Likelihood and impact numerals |
| `--fs-num` | 48 / 48 | Urgency numeral in the detail band block |

Weights: 400 body, 560 medium labels, 700 headings and tags, 780 numerals and band names. Prose is capped at 68 characters (`--measure`). Line height tightens as size grows. Labels are sentence case. There are no all caps labels anywhere.

## Space, radius, elevation, motion

- Space, 4px base: 2, 4, 8, 12, 16, 24, 32, 48, 64 (`--sp-1` to `--sp-9`). Table rows use 12px vertical padding. Panel sections use 16px by 24px.
- Radius by role: 0 for strips and table rows, 3px for chips, badges and score cells, 6px for buttons and inputs, 10px for panels and dialogs. Never one radius on everything.
- Elevation: none in the page. Boundaries are hairlines. `--shadow-overlay` is only for things that float: menus, the phone sheet, toasts.
- Touch targets: 44px minimum (`--hit`) for buttons and filter chips on phone.
- Motion: 120ms and 200ms with one easing curve, used only for state answers (row selected, panel opened, decision recorded). No entrance animations. `prefers-reduced-motion` collapses all of it.
- Focus: a 2px signal blue ring with a 2px surface gap, on every focusable element.

## What was rejected as generic

- **Warm cream page with a serif display and a clay accent.** It is the most common generated look. The light theme's mid band steps sit in a similar hue range, which is the risk. The answer is discipline: orange here is a semantic scale with five ordered steps and zero decorative use, on cool grey neutrals, in a sans.
- **Near black page with one bright accent.** The dark theme is anthracite (`#1a2023`), not `#111`, and orange appears as a five step ramp tied to data, not as a brand accent.
- **The SaaS card kit.** The detail panel is one surface divided by hairlines and spacing, not a stack of rounded cards with shadows. Only the override rules and the approve box get a panel boundary, because they are standalone objects.
- **A coloured left border on every row.** It encodes nothing a reader can name. Urgency lives in a filled score cell and in the group strip. The only left inset line is the selection marker.
- **Monospace for small data labels.** Atkinson Next with tabular figures carries tags and numbers. Mono is reserved for code.
- **Middle dot meta strings and arrow suffixes on buttons.** Meta lines are written as sentences ("TKT-1003 from F-1003, weekly test start on 3 Jun 2026 by S. Whitfield"). Buttons say the verb: "Approve", "Submit process".
- **Hazard stripes for "today".** The yellow and black chevron is the obvious offshore reference. It is visually loud at every size and would fight the text.
- **A second display face for the band labels.** A condensed or stencil face was tried mentally and dropped. Stencil hurts small size legibility, which is the one thing this audience cannot spare.

## Layout

Left aligned throughout. Desktop is a workbench: list on the left, a fixed detail or aside on the right, each scrolling on its own. Phone collapses to one column, and the detail becomes its own view with a back link.

*Revised 19 Oct 2026: on a phone the ticket detail opens as a sheet from the bottom, not as a view with a back link. The numbered readiness strip in the top bar is gone, which is also why sections 1 and 2 below are trimmed to notes. The workspace page stacks its four steps instead, and the number marks (filled when done, ringed when current, dashed when locked) carried over to them.*

### 1. Workspaces

*Revised 19 Oct 2026: there is no workspaces page, so the table wireframe is gone. The sidebar lists the workspaces, each with one line saying what it waits for ("Extract and approve rules", "Drafting tickets", "3 tickets to decide"), above the new-workspace form and "Load Bravo example". `/` opens the most recently updated workspace, or a first-run card with "Load Bravo example" and "Create a workspace" when there is none.*

### 2. Workspace overview

*Revised 19 Oct 2026: replaced by steps 1, 2 and 4 of the restructure below, so the wireframe with three file slots is gone. Its voice survived: a failing check still names the row and the fix, as in "XV-9001 is not in the assets. Add it in step 2 or correct the file."*

### 3. Rules

```
+--------------------------------------------------------------------------+
| top bar with readiness, Rules is current                                 |
+-------------+------------------------------------------+-----------------+
| Registry    | Rules                [Document | YAML]   | Approve v3      |
| General     | Version 3, draft. Extracted from ...     | [Approve v3]    |
| Equipment   | Every rule names its source: [notes:]    |                 |
|  types 13/13| [registry: K-3401] [brief:] [inferred]   | Coverage        |
|  [ok] Comp. |------------------------------------------| [ok] 13 of 13   |
|  [ok] Pump  | Registry scores                          | [ok] 8 of 8     |
|  ...        | General                                  | [ok] 6 of 6     |
| Redundancy  |  Likelihood                              | [i] LB-4101     |
| Layers      |   Moves it up [notes]  | Moves it down   |                 |
| Urgency     |   - bullet             | - bullet        | Versions        |
| Overrides   |  Impact                                  | v3 Draft        |
|             |   [Edited in v3] Scope. ... [inferred]   | v2 Approved     |
|             | Equipment types (one section each)       | v1 Extracted    |
|             | Redundancy vocabulary (table)            |                 |
|             | Protection layers and evacuation         |                 |
|             | Urgency (bands table, weights, gates)    |                 |
|             | Overrides (two rule objects)             |                 |
+-------------+------------------------------------------+-----------------+
```

The document is the reading view of `rules.yml`, rendered for a person: sentence case bullets, sections in the order the pipeline reads them. A source shared by most bullets in a list moves up to the list heading, so each bullet only carries a badge when its source differs. The YAML tab is the same file in an editor with line numbers. Coverage rechecks live as you edit, and Approve is disabled while any check fails.

*Revised 19 Oct 2026: coverage is checked for each saved version, not live while typing, so a YAML edit shows its check once it is saved as a new version, and while the YAML has unsaved changes the approval card says it approves the version as saved. The brief badge and the "Edited in v3" chip in the wireframe did not ship (see Source badges). Below 60rem of page width the approval card, coverage and versions move above the document.*

### 4. Run and tickets

*Revised 19 Oct 2026: the running view became the Pipeline tab of the process page (see Process view below), so its wireframe is gone, and there is no Cancel anywhere. In the tickets view below, Export is one menu beside the tabs, with "All tickets" and "Approved only" and a count for each. The detail panel sits beside the list when the page is at least 1216px wide. Narrower, it opens as a sheet: from the right down to 960px, from the bottom below that. Ticket ids are buttons, so Tab and Enter open a ticket. Band strips do not stick, and on a phone the table keeps its columns and scrolls sideways; the three line row was not built.*

```
After the run:
+--------------------------------------------------+-----------------------+
| Tickets                      [Export tickets.json]| FW-8102 [SCE]     [x] |
| 21 drafts from run of 16 Oct, 13:24              | Firewater Pump, ...   |
| [=========|======|=|====|=]  band distribution   | TKT-1003 from F-1003  |
| [Today 9][This week 6][This month 1][...]        |+---------------------+|
| [Needs review 15][SCE only 12][All v][Find tag]  ||10  Today            ||
|--------------------------------------------------|+---------------------+|
| U  Ticket   Equipment   Summary      L  I  Rev  D | Needs review: 4      |
|##################################################|  reasons              |
|# Today  urgency 9 to 10                9 tickets #| Summary (17px)        |
|##################################################| Likelihood | Impact   |
|[10] TKT-1003 FW-8102 SCE  Diesel fire... 9 10 .. | 9 of 10    | 10 of 10 |
|[10] TKT-1010 HVAC-7201 SCE ...                    | [#########.]          |
| ...                                              | registry start marker |
|##################################################| Recommended action    |
|# This week  urgency 7 to 8             6 tickets #| How urgency derived   |
|##################################################| Batch notes           |
| ...                                              | Model flags, attempts |
|                                                  |[Note        ]         |
|                                                  |[Reject] [Approve]     |
+--------------------------------------------------+-----------------------+
```

Sorted by urgency, then ticket id. Band strips stick under the column header while their group scrolls. On phone each row becomes a three line item: score cell, then tag with SCE and type, then two lines of summary, then L, I, review and decision.

## Component rules

**Band treatment.** A band appears in four forms, all filled with `--band-*` and labelled in `--band-*-ink`: the group strip (full width, name at 17px weight 780, range and count in 13px), the score cell (32px square, urgency numeral), the detail band block (48px numeral, band name, one line of context), and the filter chip swatch (12px square beside the band name and count). Nothing else in the product may use orange.

**Score display.** Likelihood and impact are numerals at 24px weight 780 with "of 10" in muted text. Below each is a ten cell track filled in ink, never in band colour, with a small triangle under the registry starting point. Likelihood starts at 11 minus reliability; impact starts at criticality. A caption says where it started and how far the score moved: "Registry start 5, from reliability 6 inverted. Scored 4 above the registry start." This is the fastest way to catch a confidently wrong score: a large move on an SCE is where the eye should go first. It also guards the inverted reliability pitfall, because the inversion is written out. In the table, L and I are bare tabular numerals at 15px bold, right aligned.

**Urgency derivation trace.** A number line from 1 to 10, shaded by band, with a hollow dot at the weighted base, a solid dot at the final value, and ink ticks at each floor that applies. Below it, the code's steps as a numbered list, because they are a real sequence: weighted base, near-certain gate, inconsequential cap, round, SCE floor, each override. Each step shows its value and one of three states: "Changed the value" (bold), "Checked, no change", or "Not applicable" (muted). An override that fires shows its evidence in the step text.

**SCE badge.** The only filled neutral badge: ink background, surface text, "SCE" at 12px bold, with the full name in the title. It appears beside the tag in every row, on phone too, and in the detail header. SCE is the primary review trigger, so it gets the strongest neutral treatment.

**Review flag.** In the table, a flag icon and the word "Review" in secondary ink. It applies to 15 of 21 Bravo tickets, so it is deliberately quiet; its absence is what stands out. In the detail panel, the reasons sit directly under the band block on a sunk background, as a list with the reason name in bold: "Safety Critical Element.", "Override fired.", "Partner has a finding.", "Today band.". Reasons come from the fixed set in the pipeline, never free text.

**Decision state.** Pending is a dashed circle icon with "Pending" in muted ink. Approved is a check with "Approved" in `--ok`. Rejected is a cross with "Rejected" in `--danger`, and the note shows in the detail panel. Always icon plus word. The decision form sticks to the bottom of the detail panel: a note field (required to reject), Reject as a quiet outlined button, Approve as the primary blue button, and keyboard hints on desktop (A approve, R reject, J and K next and previous). Approving advances to the next pending ticket.

**Source badges.** Small 3px radius chips at 12px. The kind is carried by shape and prefix, not by colour, because colour is spent:

- `notes: What moves likelihood`: sunk fill, hairline border. Handover notes, section named.
- `registry: K-3401`: sunk fill, tag in bold. Registry engineer comment.
- `brief: section 3`: outline only. The assignment brief.
- `inferred`: dashed border, bold italic. Not stated in any source. This is the badge a reviewer must check, so it is the most distinct.

An edited line in a draft version gets a signal wash and an "Edited in v3" chip.

*Revised 19 Oct 2026: the edited-line marker was not built; an edited version says "Edited from v2" in its origin line instead. The brief badge went with the brief as a source: the extraction prompt cites notes, registry or inferred, nothing else.*

**Batch notes.** Typed, with the kind as a bold label ("Partner has a finding", "Other finding on this equipment", "Partner not in registry", "Voted group") and the note text below. A partner or sibling finding is quoted under a rule with a link to its ticket.

**Model flags.** A two column definition list from the pipeline's `Assessment` model. "Yes" is bold, "No" is muted, "Unknown" is dotted underlined with its handling beside it ("Treated as not recorded").

**Model attempts.** One line per attempt with a check or cross, and the validation error in mono under a failed attempt. A fine print line gives the model id, rules version and whether the result came from cache.

*Revised 19 Oct 2026: the detail panel as shipped moves a few of these. The review reasons sit under the summary and the recommended action, not under the band block. Approve is the near-black primary button, and Approve and Reject both move to the next pending ticket; a decided ticket shows its note and a Reopen button, and Esc closes the panel. Batch notes carry no link to the other ticket, though a sibling note quotes the first sentences of the other finding. The attempts list marks a cached attempt "from cache" and opens each reply under "Raw reply"; its fine print is the model id alone.*

## States

- **Empty.** Every empty screen says what to do next in one sentence and offers the action. Tickets with no run: "No tickets yet. Approve the rules, then start a run." A filter with no matches: "No tickets match these filters." plus a "Clear filters" button.
- **Loading.** Skeleton rows at real row height in `--surface-sunk`, no shimmer. The run screen shows real per finding progress instead of a spinner.
- **Error.** Errors name the thing and the fix, in the interface's voice: "F-1022 references XV-9001, which is not in the registry. Add it to the registry or correct the finding." A ticket the pipeline could not draft still appears, scored 10, 10, 10 with "Triage failed" in the summary, review required, and an attempts list showing all three failures.
- **Too much content.** Summaries clamp to two lines in the table and are complete in the detail. Long equipment lists in the redundancy table wrap. Over 200 tickets, band groups collapse to their strip, with today and this week open by default.

*Revised 19 Oct 2026: the empty Tickets tab says "No tickets yet. Approve the rules, then submit findings." Unknown equipment reads "XV-9001 is not in the assets. Add it in step 2 or correct the file." Error notices carry an icon, and toasts appear at the top centre. A failed ticket is scored 10 across and its band block says "Triage failed". Its attempts list holds the attempts actually made: a failed model call ends them there, and three failed validations make three. Band groups never collapse; that rule was not built. Two pages are new. An unknown URL shows "That page does not exist" with a link home, and a process that cannot be loaded shows "This process is not available".*

## Notes for the React implementation

- Theme: follow the OS by default, and let the toggle stamp `data-theme` on `html`. The token file handles both directions. *Revised 19 Oct 2026: that file is `frontend/src/index.css`, and the toggle has three settings: light, system, dark.*
- `tickets.json` does not carry model flags, batch notes or model attempts today. The mockup shows them using the field names from `flkr-triage/models.py` (`Assessment` flags, `NoteKind` values), filled from TKT-1003's rationale and the pipeline's documented 300 character retry. The UI needs them in the API response. *Revised 19 Oct 2026: solved without touching the file. The export keeps the brief's shape, and the panel reads the flags, batch notes and attempts from the ticket's stored trace, `GET /api/tickets/{id}`.*
- The urgency trace should be built from structured steps returned by the pipeline, not parsed from the rationale string.
- Phone: tickets reading must work at 390px. The list and the detail pass that in the screenshots. Rules editing and data upload may stay desktop first; below 1200px the rules nav hides and the aside stays.

---

# Restructure: four steps, processes, login

Added on 17 Oct 2026. Everything above still holds unless a section below says it replaces something.

New calibration files:

- `mockup-workspace.html` is route `/w/:id`. `?step=1` to `?step=4` picks the step. Step states: `?step=1&state=empty`, `?step=3` (live extraction, the default), `?step=3&state=stale`, `?step=3&state=versions` (steady, approved), `?step=3&state=empty` (ready to extract), `?step=4` (filled preview), `?step=4&state=invalid`, `?step=4&state=empty`. `?dialog=import` and `?dialog=paste` open the dialogs. The trash button on an asset row shows the undo toast.
- `mockup-process.html` is route `/p/:id`. Default is mid run. `?state=done` and `?state=failed` (F-1018 fails triage) show finished runs. `?tab=tickets` shows the Tickets tab. `?open=F-1003,F-1012` picks which lanes are expanded.
- `mockup-login.html` is route `/login`. `?state=error` shows a wrong passphrase.
- Add `?still` to freeze the clocks for screenshots. `?theme=dark` and `?theme=light` work on every page.
- `mockup-tickets.html` gained `?embed=1`, which hides its top bar so the process page can show it as the Tickets tab.
- Screenshots: `mockup-workspace-*`, `mockup-process-*`, `mockup-login-*`, at 1440x1000 and 390 wide.

Routes as shipped (revised 19 Oct 2026):

- `/login`: the passphrase.
- `/`: the most recently updated workspace, or the first-run card when there is none.
- `/w/:workspaceId`: the workspace and its four steps.
- `/w/:workspaceId/rules` redirects to the newest rules version; `/w/:workspaceId/rules/:rulesId` is one version, with `?tab=yaml` for the editor.
- `/p/:processId`: the process, with `?tab=pipeline` or `?tab=tickets`, and `&ticket=<id>` while a ticket is open.
- Anything else: "That page does not exist", with a link home.

Corrections to the text above:

- The Bravo domain document has 7 sections, not 9. Its 89 lines and 4,326 characters are right. The app counts every heading line, the title included, so it shows 8.
- The numbered readiness strip (1 Data, 2 Rules, 3 Run) is replaced by the four step navigation below. The workspace overview wireframe with three file slots is replaced by steps 1, 2 and 4.
- Rules versions now have three statuses: draft, approved, failed. The rules page's "Extracted, superseded" for v1 maps to approved. The workspace mockup shows v1 as failed so that status has a render. *Revised 19 Oct 2026: four, with extracting while the model call runs. An older approved version stays approved, and the process step's Select labels it superseded.*
- `tokens.css` gains `--dur-3: 320ms` for layout moves on the lane grid and the progress bar. `frontend/src/styles/tokens.css` needs the same line. *Revised 19 Oct 2026: never landed. There is no `--dur-3`, no `styles/tokens.css` and no lane grid; the progress bar's 320 ms transition is written where it is used.*

## Status language

The client asked for the cues a ticketing system has. They arrive as one component, the status badge, plus counts on tabs and filter chips. The HMI rule does not move: orange is urgency only, blue is interaction only, and green and crimson always come with an icon and a word.

The badge is an outline chip: 3px radius, `--rule-strong` border, icon then word at 12px bold. It never has a fill, so nothing on a page competes with a band.

| State | Icon | Ink | Used for |
|---|---|---|---|
| Queued, Not added | dashed circle | `--ink-3`, dashed border | Waiting for a worker, empty steps |
| Running, Extracting | turning arc | `--ink` | Process, extraction, a finding in a stage |
| Drafted, Done, Added | check | `--ink` | The machine finished |
| Approved, check passed | check | `--ok` | A human approved it, or a check passed |
| Draft | pencil | `--ink-3`, dashed border | A rules version nobody has approved |
| Failed, Failed triage, Out of date | cross | `--danger` | It failed, or it blocks the next step |
| Information | i in a circle | `--ink-2` | Type differs, partner unverified |
| Locked | padlock | `--ink-3`, dashed border | A step whose prerequisites were never met |

The rule behind the colours: green means a person approved it or a check passed, ink means the machine finished, crimson means it failed or blocks. A drafted ticket is ink, not green, so it can never be mistaken for an approved one in the Tickets tab.

Under HMI rules, normal is quiet. A valid findings row shows nothing in its check column. Only the summary line above the table says all rows passed.

*Revised 19 Oct 2026: the tokens in the table map to shadcn classes. `--ink` is `text-foreground`, `--ink-2` and `--ink-3` are `text-muted-foreground`, `--ok` is `text-ok`, `--danger` is `text-destructive`, and the badge border is `border-input` at `rounded-sm`. "Not extracted" was never a state, so it left the table. A finding in a stage on the Pipeline tab shows a pulsing dot rather than the turning arc, and throughout, crimson reads as red and blue as near-black, since the primary has no hue now.*

## Workspace: four gated steps

*Revised 19 Oct 2026: shipped as four numbered sections stacked on one page, not as a step navigation in the top bar. The wireframe and the paragraphs on step marks and layout below describe what ships; the gating paragraph keeps its own note.*

```
+------------------------------------------------------------------------------+
| Bravo platform (example)                                                     |
|                                                                              |
| (1) Knowledge                                                     [Change]   |
|  |  domain_knowledge.md, 8 sections, added 19 Oct 2026, 10:02.               |
|  |                                                                           |
| (2) Assets                                                        [Change]   |
|  |  18 assets, 10 safety critical.                                           |
|  |                                                                           |
| (3) Rules                                                         [Change]   |
|  |  v1 approved, covers the current assets.                                  |
|  |                                                                           |
| (4) Process                                                                  |
|     Findings are not stored on the workspace. Each file you submit becomes   |
|     a process that drafts one ticket per finding.                            |
|     +--------------------------------------------------------------------+   |
|     | drop zone, then preview and submit, or the live process card       |   |
|     +--------------------------------------------------------------------+   |
|     Processes                                                  3 processes   |
+------------------------------------------------------------------------------+
```

**Step marks.** The numbers keep the readiness strip's marks: filled when done, ringed when current, dashed when locked, red and ringed with "Out of date" when stale. A rail joins each number to the next, dashed when the next step is locked. Steps have no URLs and no tooltips. A locked step shows a padlock and one line naming what unlocks it, such as "Approve a rules version in step 3 to unlock."

**Gating.** A step locks only until its prerequisites are met for the first time: Assets needs the document, Rules needs the document and one asset, Process needs an approved version. After that, a regression blocks the action, not the navigation. When the rules go stale, step 4 stays open so past processes remain readable, but Submit is disabled with the reason beside it.

*Revised 19 Oct 2026: gating follows the current state, not the first time. Delete every asset and Rules and Process lock again. Stale rules are the one regression that leaves a step open: step 4 stays readable, a red notice sits above the drop zone, and Submit is blocked with the reason beside it.*

**Step layout.** Each step is a header and a body. The header holds the number, the title and one line: what the step is for while it is current, a summary while it is done and closed, the unlock line while it is locked. Done steps start closed and open with "Change"; current and stale steps are always open, and the body slides open with its height. There is no aside and no footer bar, and on a phone the rail hides so the body takes the full width. Assets offers "Continue to rules" (or "Continue to process") at its foot once it is done, which closes it.

### Step 1, Knowledge

*Revised 19 Oct 2026: the reading view and its aside are gone.* The step is one row: the file name, "8 sections, 89 lines, added ...", then "Replace" and "Open". Open shows the rendered markdown in a sheet from the right. Replace swaps the row for a drop zone with "Paste text instead"; pasting is an inline form with "Save document", not a dialog, and its copy, like the drop zone's, says approved rules keep working until you extract again.

Empty state: the same dashed drop zone, "Drop the domain knowledge document here", with "Choose file" and "Paste text instead". There is no footer button; step 2 shows its padlock line until the document is in.

### Step 2, Assets

*Revised 19 Oct 2026: still a table, not a file, but the aside is gone and most of the plan changed, so this section is trimmed to what ships.*

One row per asset with two-line cells: equipment id over service (pinned when the table scrolls sideways), type over redundancy, then SCE, Crit. and Rel. with the scales in header tooltips, the engineer comment on one truncated line, and a delete button. The toolbar holds a search box ("Find an asset"), Type and Redundancy dropdown filters, an SCE toggle, "Import CSV" and "Add asset". Each filter lists its values with counts and marks any value the approved rules do not cover: a red alert icon on the button, with text for screen readers, and a cross in the menu.

- **Editing.** Click a value to edit that one value in place. Enter saves (Shift Enter adds a line in a comment), Esc cancels, and leaving the field saves too. Scores take a whole number from 1 to 10, and the SCE switch saves as soon as it flips. A saved value flashes briefly.
- **Add asset** opens a dialog in four sections (equipment, registry scores, protection and redundancy, engineer comment) with ten-button score pickers. The new row scrolls into view and stays highlighted for about a second.
- **Delete** asks first, in a dialog, and there is no undo.
- **Import CSV** replaces everything. It confirms only when assets already exist: "Replace all 18 assets?", with the button "Replace 18 assets".

### Step 3, Rules

*Revised 19 Oct 2026: one in-use card plus a versions list, with no "Done when" aside and no Cancel; the bullets below are what ships.*

- **Ready.** "Extract the first version": two checks (knowledge in, assets in), one sentence naming the extraction model, and "Extract rules".
- **Live extraction.** A panel titled "Extracting v4" with an Extracting badge and the start time, and no Cancel. The body is a track of the six stages (Intake, Schema, Model call, Validate, Coverage, Draft) over a mono log with one row per event: time, status, stage, what happened, and the numbers that matter, separated by commas. A row opens for the rest, and failures open by default. The running model call shows a spinner and a ticking elapsed time; a finished start row keeps a small dot.
- **In use.** One card: the approved version with its badge and "in use for new processes", the coverage line ("Covers 13 equipment types and 8 redundancy strings"), any warnings, then "Log", "Extract again" and "Open rules". A newer draft gets a row of its own with "Review v4".
- **Versions.** A list, hidden while the approved version is the only one. Each row has the version, its status badge, "Out of date" on a stale approved one, the origin and date, which processes used it, then "Log" and "Open".
- **Stale.** When assets gain a type or a redundancy string the approved version does not cover, a panel with a red border leads the step: "v3 is out of date, so new processes are blocked", then each gap with a cross and the assets that carry it. The actions are "Extract again" and "Edit v3 by hand" (on the rules page), or "Review v4" and "Extract again" when a newer draft exists.

### Step 4, Process

Findings are not stored on the workspace; each file becomes a process.

*Revised 19 Oct 2026: submitting no longer leaves the page, and most of the step moved with that; the bullets below are what ships.*

- **Empty.** A dashed drop zone, "Drop an inspection findings CSV", that names the nine fixed columns, with "Choose file" and an outline button, "Use the Bravo example findings". When the approved rules no longer cover the assets, a red notice sits above it before any file is chosen.
- **Preview.** One panel holds the whole submit. First a file bar with name, rows and size, plus "Replace file" and "Remove". Then a summary line of checks. Then the preview table, capped at about 27rem so the submit row stays on screen. Last, the submit row: a Select for the rules version, one line, and the Submit button.
- **Row checks.** Rows with a problem come first: blocking, then information, then the rest in file order. Unknown equipment is blocking: a red cross with "XV-9001 is not in the assets. Add it in step 2 or correct the file." and an inset red marker on the row. A type that differs from the registry is information: an info icon and "The file says Pressure Transmitter, the assets say Level Transmitter. The asset type is used." The row still submits. There is no filter chip for problem rows.
- **Rules version.** Only approved versions are listed. With more than one, the newest is marked "latest" and the older ones "superseded".
- **Submit.** "Submit process" is primary. Beside it is one line, either the plan ("21 findings become 21 tickets, drafted by claude-sonnet-5-5 on 4 workers.", or "drafted by the fake model") or the blocking reason in red. Submitting keeps you on the page: the step swaps to the live process card.
- **Live process.** The card shows the process number, its badge and a clock, the facts line, and the ten-row plan with the spinner where work is in flight. While it runs, a progress bar counts drafted tickets beside "Watch the detail". When it is done, one line ("21 tickets drafted in 7.0 s.") and three buttons: "New process", "Open the timeline" and "Review tickets". A process found running when the page loads stays on screen until it is dismissed.
- **Processes.** A table: process, status badge (a failed one shows its error under the badge), drafted with any failures under it, findings, file, rules version, started. Clicking a row opens the process.

## Process view

*Revised 19 Oct 2026: the lane grid is gone. The plan says how far the batch has got, the finding rows say where each finding is, and a row opens to its ladder. The old wireframe, stage header, track, settling and batch lane are trimmed; the header, tabs, cells and ladder stay, edited where they changed.*

```
+------------------------------------------------------------------------------+
| Process 3 [Running] [Fake model]                                             |
| inspection_findings.csv  21 findings  rules v1  claude-sonnet-5-5 on 4 ...   |
| ==============================..................                             |
| 10 of 21 drafted, 4 in progress, 7 queued     0:05 elapsed, about 6 s left   |
| [Pipeline | Tickets 10]                                                      |
+------------------------------------------------------------------------------+
| Stages                   | [All 21] [In progress 4] [Queued 7] [Drafted 10]  |
| (v) Intake               |                          Expand all  Collapse all |
| (v) Batch notes          | > F-1001  K-3401        [v Drafted]  [8] TKT-1001 |
| (o) Making prompts       | v F-1003  FW-8102 SCE   [v Drafted] [10] TKT-1003 |
| (o) Calling the model    |     Events (ladder)       | Finding F-1003        |
|     10 of 21 replies     | > F-1012  LB-4102 SCE   [. Model call] attempt 2  |
| (o) Validating replies   | > F-1015  V-2450        [: Queued] waiting ...    |
| ( ) Checking invariants  |                                                   |
|     ...                  |                                                   |
| ( ) Done                 |                                                   |
+------------------------------------------------------------------------------+
```

**Header.** A back link to Processes, then "Process 3" with its status badge, a meta sentence (start time, rules version, model, workers, file), then the stats as label over numeral: Drafted with "of 21", Failed (crimson with a cross only when above zero, muted at zero), Remaining with its split, Retried, and Elapsed or Took. The stats use tabular figures, an exception to the dataviz rule for display numbers, because they change live and must not shift width. The progress meter is ink on `--rule`, never orange or blue, captioned "10 of 21 drafted" with a pace estimate. When the process finishes, the meter is replaced by the band distribution bar and legend from the tickets list. That is the first orange on the page, and it is about urgency. Actions: "Cancel process" (quiet) while running. When done, "Export tickets.json" (secondary) and "Review tickets" (primary, opens the Tickets tab).

*Revised 19 Oct 2026: the header is now the title with its status badge and a "Fake model" badge whose tooltip says the replies are deterministic stand-ins with simulated latency and no API calls, one gap-separated facts line (file, findings, rules version, model on workers, the same markup as the live card on the workspace page), one outcome line ("21 tickets drafted in 7.0 s, 2 retried", or the meter with drafted, in progress, queued and "0:03 elapsed, about 6 s left" while running), then the tabs on the left and one Export menu (all tickets, approved only) on the right. The stat cells, the start sentence, the band bar and the Review tickets button are gone: the urgency row of the plan carries the band tally, the Tickets tab keeps its own bar, and started/finished moved to the page footer. There is no Cancel and no back link (the breadcrumb in the top bar leads back to the workspace), and the Export menu, with a count beside each choice, appears once the process has finished.*

**Tabs.** "Pipeline" and "Tickets" with a live count of drafted tickets. Tickets is the band strip workbench from `mockup-tickets.html` verbatim, filtered to this process. Nothing about it is redesigned.

*Revised 19 Oct 2026: the page opens on Pipeline while a process runs and on Tickets once it is done, and `?tab=` keeps the choice in the URL. Tickets is the same workbench, not the mockup verbatim; its changes are noted under Run and tickets.*

**Plan.** Ten rows on a rail, the same plan the live card on the workspace page shows inline: Intake, Batch notes, Making prompts, Calling the model, Validating replies, Checking invariants, Ranking urgency, Review triggers, Drafting tickets, Done. A row is a filled check once every finding has passed it, the turning arc while any finding is in it, a ringed dot when some have passed and none is in it now, and dashed before anything reaches it. Each row carries one clause of progress ("10 of 21 replies, 2 retried", "21 of 21 ranked: today 9, this week 6") and, on the right, the findings in flight or the moment a batch stage landed. Counts come from where each finding stands, so a retry never counts twice. On this page the plan sits in a sticky 22rem column with the clauses under the labels, and the rows with more to say open on click: intake facts, note kinds with counts, the model settings, the finish tally with its band chips.

**Filters.** Chips with counts, with "Expand all" and "Collapse all" beside them: All, In progress, Queued, Drafted, Retried, Failed. They filter finding rows; they never reorder them.

**Finding rows.** One row per finding, in finding order, keyed by `finding_id`, and a row whose finding failed opens itself. Rows never reorder, so nothing jumps under the pointer. Columns: expand chevron, finding id, equipment tag with SCE badge and type, state, ticket.

- **State cell.** A status badge plus one muted line: "Drafted, in 3.8 s, 1 retry", "Model call, attempt 2, 3.2 s" (ticking), "Queued, waiting for a worker", "Failed triage, after 3 attempts". *Revised 19 Oct 2026: the running badge carries a pulsing dot, and a drafted line also names the worker.*
- **Ticket cell.** Empty until the lane is drafted. Then it holds the band score cell and the ticket id. A failed triage shows a today cell with 10 and the ticket id in crimson with "failed", following the failed ticket convention above.

**Expanded row.** Expanding a row opens it below, on the card surface, with the row on the accent wash and an inset marker. Left: the event ladder. Right, 22rem: the finding being worked on (description as a quote, reported, inspection, asset, registry scores with the inverted start written out, redundancy). Finished rows keep their full ladder after the process ends. *Revised 19 Oct 2026: "View prompt" and its Sheet are gone; the prompt as sent lives in the ticket panel. Below 75rem of page width the finding sits under the ladder.*

**Event ladder.** One row per event, built straight from `{id, ts, finding_id, stage, status, title, detail}`.

- Columns: time since the process started (mono, tabular, "2.33 s"), a status icon on a vertical rail, then the stage name in muted ink followed by the title at normal weight, then the detail.
- Icons: `done` is an ink check. A passed check (validate, invariants, and coverage in the extraction log) is a check in `--ok`. `fail` is a crimson cross with a crimson title. `info` is the info icon, which a notes row that found notes also gets. An open `start` is a hollow circle, not the turning arc. Stages not reached are listed muted with dashed icons and "Not reached", or "Waiting for a worker" on the Prompt row of a queued finding.
- **A start and its done or fail fold into one row**, matched on stage and attempt. The row shows the hollow circle and a ticking elapsed time while it runs, then settles. "Calling claude-sonnet-5-5, attempt 1" and "Reply in 1.9 s" are one row: "Model call, attempt 1, reply in 1.9 s".
- The worker pick-up event (`stage: finding`) folds into the Prompt row: "Prompt rendered, picked up by worker 3".
- Detail is structured, never a string to parse. Per stage:
  - **Intake:** tag, type, SCE, criticality, reliability, redundancy chip. *Revised 19 Oct 2026: the row shows its title only ("Joined to K-3401, Centrifugal Compressor"), and the finding context beside the ladder carries the registry facts.*
  - **Batch notes:** the count, then each note as a bold kind ("Partner has a finding", "Other finding on this equipment", "Partner not in registry", "Voted group") over its text.
  - **Prompt:** system and user characters ("6.1k"), the rules section used, the note count.
  - **Model call:** model id, attempt, max tokens, elapsed, input and output tokens, and whether the reply came from the cache.
  - **Validate:** likelihood and impact on a pass. On a fail, the pydantic error in a mono block, for example `summary: String should have at most 300 characters (318)`.
  - **Invariants:** all four checks every time, each with a check, a cross, or a dash for not applicable, then its name, and the reason when it fails. On a fail, a line saying the retry carries the violations.
  - **Urgency:** the steps as a compact table (name, why, small state, value): weighted base, near-certain lift, inconsequential cap, round, SCE floor, each override with its evidence. Then the score cell and band.
  - **Review:** the triggers with a flag icon, from the fixed set.
  - **Ticket:** "TKT-1003 drafted" and a link that opens it in the Tickets tab.
- Per-finding Intake and Batch notes rows need events carrying that `finding_id`. Today the backend emits neither. Emit one `notes` event per finding with its kinds and texts, plus one process-level summary. *Revised 19 Oct 2026: done. The backend writes one process-level intake event, then an intake and a notes event for each finding.*

**Phone.** The stage header becomes a horizontally scrolling strip of stage cells. Each lane becomes three lines: tag with finding id and score cell; the nine ticks full width at a smaller size, no retry marks; then the state badge and its line. The ladder stacks above the finding context.

*Revised 19 Oct 2026: there is no stage strip. Below 64rem of page width the plan stacks above the rows, and the filter chips scroll sideways below 60rem. On a phone each row is two lines (chevron, finding id, tag and urgency cell, then the state badge and its line), and the ladder still stacks above the finding context.*

## Login

A quiet column on the plane, centred horizontally and sitting a third of the way down: "Triage" at 32px heavy, one sentence ("Drafts maintenance tickets from inspection findings, scored against your platform's own rules, for an engineer to approve."), then one surface panel holding the Passphrase field and a full width "Sign in" button. The field is a labelled password Input with `autocomplete="current-password"`, focused on load. A wrong passphrase marks the input `aria-invalid` with a crimson border. Under it, in a `role="alert"` line, a cross and "Wrong passphrase. Ask whoever set up this Triage for the current one." The text is selected so typing replaces it. No modal, no shake, no illustration, no second button. The theme toggle sits in the corner.

## Motion

The original rule (no entrance animations) stands for pages, routes and tab switches. The client asked for motion, so it is spent on state changes the pipeline produces and on answers to a person's action. Every case below says what changed.

*Revised 19 Oct 2026: there is no orchestrated first paint. Events already on screen when the page paints stay still, and only later ones animate in. The rows for lanes advancing and settling, the stream caret, the field error fade and the deleted asset row went with the designs they belonged to, and a decision no longer draws its check; the table below is what ships.*

Wrap the app in `<MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>`. With `reducedMotion="user"`, motion drops transform and layout animation and keeps opacity, which matches the fallbacks below. `useReducedMotion()` turns off the number roll, the washes, the pulses and the step slide outright, and a reduced-motion block in `index.css` stops the CSS spins and transitions. The easing is `cubic-bezier(0.2, 0, 0, 1)` everywhere, written where it is used; there is no token for it.

| Interaction | Trigger | Motion | Duration | Reduced motion |
|---|---|---|---|---|
| Event row arrives | New event in an open ladder or the extraction log | `AnimatePresence`, enters from opacity 0 and y -4px; in the extraction log, rows below move with `layout` | 200 ms | Ladder: opacity only. Extraction log: appears at once |
| Row settles | `done` or `fail` for an open start | Icon crossfades from the hollow circle to a check or cross; title swaps | 120 ms | Unchanged, it is opacity |
| Count ticks | Drafted count while running, Tickets tab count, filter and band legend counts | Old numeral exits up 40%, new enters from below, with opacity; tabular figures keep width | 120 ms | Instant swap |
| Running marker | Status badge and active plan row; a finding in a stage; the current extraction stage | Arc turns, linear, infinite; a dot pulses beside the stage name; the stage bar pulses | 1 s a turn; dot 1.2 s; bar 1.4 s | Static ring, still dot, still bar; the word beside each says Running or names the stage |
| Progress | Drafted count changes | Indicator slides with a transform transition | 320 ms | Instant |
| Step opens, closes | Change, Close, or a step becoming current | Height auto and opacity with `AnimatePresence` | 200 ms | Instant |
| Finding row expands, collapses | Person toggles a row | Opens at once; chevron rotates 90 degrees | Chevron 120 ms | Instant |
| Ticket row appears | Ticket done while the Tickets tab is open | Row fades in on an accent wash that fades out over 1.2 s; band bar segments resize with `layout` | 200 ms, wash 1200 ms, bar 320 ms | No fade, no wash, no resize motion |
| Decision recorded | Approve or Reject | The panel washes green or red and fades; a toast appears at the top centre; selection moves to the next pending ticket | 600 ms | No wash |
| Asset saved or added | Inline edit saved, Add asset | The cell or new row takes the accent wash, then fades; a new row scrolls into view | Held 1200 ms, fade 200 ms | Instant |
| Rules content swaps | Status change, or a switch between Document and YAML | Opacity fade | 120 ms | None |

**Budget.** SSE can deliver many events at once. Batch events per animation frame. When more than 8 lanes change in one frame, skip per-row enter and advance motion for that frame and render the end state. Never animate a finished process on first paint, never animate tab switches, and never move a lane vertically.

*Revised 19 Oct 2026: neither the per-frame batching nor the 8-lane cut-off was built. Events replay from the store and then follow the stream, deduped by id. Nothing on screen at first paint animates, finding rows never reorder, and the one animated tab switch is the rules page's 120 ms fade.*

## Notes for the React implementation (restructure)

- Primitives, revised 19 Oct 2026. The steps are plain sections with a motion body, so there is no step navigation and no Tooltip on a locked step. The status badge is a hand-made outline span in `components/marks.tsx` with an icon slot and no fill; `ui/` has no Badge. Tables are plain `<table>` elements sharing cell classes, not Table. The progress meter is Progress restyled to foreground on border. The process page uses a TabsList over two views it renders itself, while the rules page uses full Tabs. The prompt sits in a `<details>` in the ticket panel, and Sheet holds the knowledge reader and the ticket detail on narrower pages. Import and Delete confirm with Dialog, and paste is an inline form. Decisions and saves use sonner toasts at the top centre. Loading uses Skeleton at real row height, no shimmer. The ladder is a plain list with `motion.li`.
- Stage keys to display names. Pipeline: `intake` Intake, `notes` Batch notes, `prompt` Prompt, `model` Model call, `validate` Validate, `invariants` Invariants, `urgency` Urgency, `review` Review, `ticket` Ticket. `finding` (picked up) folds into the Prompt row. Extraction: `intake` Intake, `schema` Schema, `model` Model call, `validate` Validate, `coverage` Coverage, `draft` Draft. The plan names its ten rows for a reader instead: Intake, Batch notes, Making prompts, Calling the model, Validating replies, Checking invariants, Ranking urgency, Review triggers, Drafting tickets, Done.
- Lane position is the stage of the lane's latest event. A lane's head is running when that event is a `start`, or a `done` of a stage that is not Ticket.
- Plan counts are derived from lane positions, not counted from events, so retries do not double count.
- Any table inside a horizontal scroller needs `position: relative` on the scroller. Otherwise an absolutely positioned screen reader caption escapes it and widens the page on phone.
