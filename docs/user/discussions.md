# Discussions

A discussion puts several agents at one table. Each seat pairs a persona, such as Architect or
Reviewer, with a model. Seats speak in turn, read everything said before them, and keep going round
after round until you stop or end the discussion. You can interject at any time, and when you end
it, one seat writes a summary of agreements, disagreements, and open decisions.

## Start a discussion

Open **Discussions** in the sidebar, or run **New discussion** from the command palette. Choose a
project, add seats from left to right in speaking order, and write the topic. The first line of the
topic becomes the discussion's title. **Start discussion** sends the topic to the first seat.

Seats can use Claude and Codex models; other providers show **Not supported yet**. Every seat
works in the project's own checkout, not a worktree, so seats see and build on each other's file
changes. Seats run with the project's default [permission mode](permission-modes.md).

Each statement is a full agent turn, and the discussion does not stop on its own. Watch the round
count and stop or end the discussion when you have what you need.

## During a discussion

Use the composer to interject. Interjecting does not interrupt the seat that is speaking; the next
seat to speak reads it, and the label under your interjection shows who has read it.

**Stop** interrupts the current statement. **Continue** has the same seat speak again from the
start. A discussion also stops when a seat fails, reaches its usage limit, or the desktop app
restarts; the notice above the composer says why, and **Continue** retries.

If a seat needs your approval or an answer, the notice above the composer says so and offers
**Open seat thread**. The discussion is still running while it waits.

Each time a seat speaks, it receives everything said since its last statement, in full rather than
summarized. When that material grows past 120,000 characters, it is sent as a file instead of a
message; a warning appears once it passes 60,000 characters.

## See what a statement changed

A statement that changed files lists them. Select a file to see that statement's diff in the side
panel. A statement's changes are everything that changed in the project since the previous
statement, so edits you make by hand between two statements appear in the later one.

## End a discussion

**End discussion** asks for a summarizer and a summary template. If a seat is speaking, it finishes
first. Then each seat gives one final statement, and the summarizer writes the summary. You cannot
interject while a discussion is closing.

An ended discussion keeps its record. To remove it, choose **More** > **Delete discussion**. This
deletes the record and archives the seat threads.

## Seat threads

Each seat speaks through its own thread. Seat threads stay out of the sidebar; open one with **View
process** on any statement. A banner links back to the discussion. Messages you send in a seat
thread are not added to the discussion record. T3 Code does not notify you when a seat finishes
speaking, but approvals and questions from a seat still notify you.

## Templates

Manage reusable pieces in **Settings > Discussions**:

- **Persona templates** define a seat's name, avatar, and instructions.
- **Summary templates** tell the summarizer how to structure the summary.
- **Discussion templates** save a seat lineup. Choose one when you start a discussion, or set up
  seats on the new discussion page and choose **Save as template**.

Built-in persona and summary templates can be edited; **Restore defaults** returns one to its
original content.

Template changes apply only to discussions started afterward. A discussion keeps the personas it
started with and the summary template chosen when it was ended.

Discussions are not available in the mobile app.
