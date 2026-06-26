@CLAUDE.md

## Internship Track

Active todo: see `/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/daily-logs/08_MeetingAgent.md`
(on branch `2026-TEEP-5-Samuel`). 7-phase cloud-first rework of Meetily — drop
local Whisper/Parakeet, route all STT through an OpenAI-compatible API. Study
notes companion:
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/study-notes/14_Meetily_Cloud_First_Transcription.md`.

## Active Plans

Per-phase action files live in this repo at `.opencode/plans/`. **One file
per phase**; each describes the work for that phase only, and is deleted from
this directory when the phase is complete.

Do **not** maintain a list of plan files in this document. The directory
itself is the source of truth — at the start of every session, list
`.opencode/plans/` to discover what's currently active, then read each file.
Files present in the directory = phases not yet done; absence = phase
complete (also reflected by the checkboxes in the source todo).

## Daily-Logs Sync Rule (mandatory)

The source todo in the extern repo is the single source of truth for phase
status. Whenever you complete work on this branch, you **must** update the
extern todo at
`/Users/kagchi/Documents/projects/bmw-ntust-internship/docs/daily-logs/08_MeetingAgent.md`
to check off the matching items (`- [ ]` → `- [x]`).

Sync both directions, in this order:

1. **Code complete → todo**: when an item in a phase plan file is done, edit
   the extern todo to flip the corresponding `[ ]` to `[x]`. Do this before
   removing the line from the phase plan file.
2. **Phase complete → plan**: when a whole phase is fully checked off in the
   todo, delete that phase's plan file from `.opencode/plans/` so the
   directory only describes remaining phases.
3. **Manual edits to the todo**: any time the todo itself is edited (renamed,
   re-scoped, items added/removed), mirror the change in the affected phase
   file.

When a fresh session lands on this branch, the first action is: read
`AGENTS.md`, scan `.opencode/plans/`, read the source todo, reconcile any
drift between them, then proceed.
