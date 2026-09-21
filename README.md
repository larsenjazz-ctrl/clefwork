# Clefwork

Music theory quizzes that run entirely in the browser — no server, no accounts, nothing stored online.

- **Teacher app:** [index.html](https://larsenjazz-ctrl.github.io/clefwork/) — build a quiz, share its code or link, and grade the report codes students send back.
- **Student app:** [student.html](https://larsenjazz-ctrl.github.io/clefwork/student.html) — practise with instant feedback, or take a teacher's quiz and send back a report code.
- **Clefwork Keys:** [keys.html](https://larsenjazz-ctrl.github.io/clefwork/keys.html) — a separate app for reading notes: the grand staff, note names with octaves, and the piano keyboard.
- **Canvas pages:** [take.html](https://larsenjazz-ctrl.github.io/clefwork/take.html) takes one quiz and ends with a results link to hand in; [results.html](https://larsenjazz-ctrl.github.io/clefwork/results.html) shows one student's results from that link.

## How it works

A quiz's settings and a random seed are packed into a **quiz code**, so everyone who opens the same code gets the same questions. When a student finishes, their name, score, timings and answers are packed into a **report code** that the teacher pastes into the Grade reports tab, where the answers can be viewed on the staff. Both codes carry a checksum, and report codes also carry a seal tied to the quiz.

Question types: place a note, name a note, intervals (simple and compound), chords (triads through 13ths, inversions, typed chord symbols), scales (including pentatonics and modes), key signatures, chord progressions, figured bass (single chords and progressions), and voicings — single voiced chords and voiced progressions.

### Voicings

Two tabs build chords from the teacher's complexity settings (sizes, qualities, altered notes, chords from a key or chromatic, slash chords) and voice them with a named technique: stacked thirds, chorale, block voicing, drop 2, drop 2 & 4, 5 plane / 9 plane, pop horn voicings, inner sevenths, or a voicing the teacher writes out. Each technique has its own counter and its own choices — staff, open or closed, three or four notes, inner 2nds. Students either write the notes for a printed chord symbol, or write the chord symbol for a printed voicing.

### Clefwork Keys

A separate app, built on the same engine, for one skill: knowing a note in three forms. Each question shows a note one way — **on the grand staff**, **as a name with its octave** (F♯4; middle C is C4), or **as a highlighted piano key** — and asks for it another way: **write it on the grand staff**, **type the name**, or **play it on the piano**. The teacher picks which ways to show and which ways to answer, and the quiz mixes every pairing that isn't simply copying. The piano plays each note as a key is pressed, a name is typed, or a note is written.

Octaves always count. A piano key has no spelling, so when a key is shown either name for it is right (C♯4 or D♭4); a note on the staff has one spelling unless the quiz accepts enharmonic spellings. Keys quizzes use the same quiz codes, report codes, grade checker, Canvas pages and printing as the main app.

### Canvas

"Set up in Canvas" on the teacher's share card gives everything needed to run a quiz through a Canvas assignment: the quiz link, a ready-made assignment description to paste into the HTML editor, an embed for a Canvas page, and an optional number of points the quiz is worth there. Students take the quiz on `take.html`, then submit their results link as a **Website URL**. SpeedGrader shows a snapshot of each student's results page — name, score, the score scaled to the Canvas points, and every answer — with a link to the live page.

Canvas can't receive the grade by itself: that needs an LTI tool running on a server, which this app deliberately doesn't have. The teacher types the score from SpeedGrader. Correct answers stay off shared results pages unless the quiz lets students check answers; on the computer the quiz was built on, the results page marks everything against the saved quiz.

### Printing

The **Print** tab makes a paper copy of the current quiz: a header with the quiz title, teacher, course and date (mm/dd/yyyy, today's by default) and a blank for the student's name, then every question with a blank line beside its number for the point value, the printed example, and room to answer. Staves print at an inch or more — a grand staff 65% taller again, so there is room to write in both clefs — question text at 12pt, margins at 0.75 in (19 mm on A4), on Letter, Legal or A4. Every page carries a footer with the quiz ID and a QR code that opens the quiz. The preview zooms to fit a whole page, with a slider for a closer look. "Save as PDF" writes the PDF itself — the staves are drawn as line work, so they stay sharp at any size — and "Export Word" writes a .docx with the staves as pictures.

## Building

Everything is plain HTML, CSS and JavaScript with no build dependencies — including the QR encoder, the PDF writer, the PNG writer and the Word (.docx) writer. `./build.sh` concatenates `src/` into the four files in `dist/`:

```
dist/clefwork.html                    teacher app, body only (for embedding)
dist/clefwork-standalone.html         teacher app, complete page
dist/clefwork-student.html            student app, body only
dist/clefwork-student-standalone.html student app, complete page
dist/site/                            copies published to GitHub Pages
```

Set `CLEFWORK_BASE` before building to change the address used in shared links.
