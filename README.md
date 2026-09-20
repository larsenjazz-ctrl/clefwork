# Clefwork

Music theory quizzes that run entirely in the browser — no server, no accounts, nothing stored online.

- **Teacher app:** [index.html](https://larsenjazz-ctrl.github.io/clefwork/) — build a quiz, share its code or link, and grade the report codes students send back.
- **Student app:** [student.html](https://larsenjazz-ctrl.github.io/clefwork/student.html) — practise with instant feedback, or take a teacher's quiz and send back a report code.

## How it works

A quiz's settings and a random seed are packed into a **quiz code**, so everyone who opens the same code gets the same questions. When a student finishes, their name, score, timings and answers are packed into a **report code** that the teacher pastes into the Grade reports tab, where the answers can be viewed on the staff. Both codes carry a checksum, and report codes also carry a seal tied to the quiz.

Question types: place a note, name a note, intervals (simple and compound), chords (triads through 13ths, inversions, typed chord symbols), scales (including pentatonics and modes), key signatures, chord progressions, figured bass (single chords and progressions), and voicings — single voiced chords and voiced progressions.

### Voicings

Two tabs build chords from the teacher's complexity settings (sizes, qualities, altered notes, chords from a key or chromatic, slash chords) and voice them with a named technique: stacked thirds, chorale, block voicing, drop 2, drop 2 & 4, 5 plane / 9 plane, pop horn voicings, inner sevenths, or a voicing the teacher writes out. Each technique has its own counter and its own choices — staff, open or closed, three or four notes, inner 2nds. Students either write the notes for a printed chord symbol, or write the chord symbol for a printed voicing.

### Printing

The **Print** tab makes a paper copy of the current quiz: a header with the quiz title, teacher, course and date (mm/dd/yyyy, today's by default) and a blank for the student's name, then every question with a blank line beside its number for the point value, the printed example, and room to answer. Staves print at an inch or more, question text at 12pt, margins at 0.75 in (19 mm on A4), on Letter, Legal or A4. Every page carries a footer with the quiz ID and a QR code that opens the quiz. "Print or save as PDF" hands the page to the browser's print dialog; "Export Word" writes a .docx with the staves as pictures.

## Building

Everything is plain HTML, CSS and JavaScript with no build dependencies — including the QR encoder, the PNG writer and the Word (.docx) writer. `./build.sh` concatenates `src/` into the four files in `dist/`:

```
dist/clefwork.html                    teacher app, body only (for embedding)
dist/clefwork-standalone.html         teacher app, complete page
dist/clefwork-student.html            student app, body only
dist/clefwork-student-standalone.html student app, complete page
dist/site/                            copies published to GitHub Pages
```

Set `CLEFWORK_BASE` before building to change the address used in shared links.
