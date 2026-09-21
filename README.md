# Clefwork

Music theory quizzes that run entirely in the browser — no server, no accounts, nothing stored online.

- **Teacher app:** [index.html](https://larsenjazz-ctrl.github.io/clefwork/) — build a quiz, share its code or link, and grade the report codes students send back.
- **Student app:** [student.html](https://larsenjazz-ctrl.github.io/clefwork/student.html) — practise with instant feedback, or take a teacher's quiz and send back a report code.
- **Clefwork Keys:** [keys.html](https://larsenjazz-ctrl.github.io/clefwork/keys.html) — a separate app for reading notes: the grand staff, note names with octaves, and the piano keyboard.
- **Clefwork Analysis:** [analysis.html](https://larsenjazz-ctrl.github.io/clefwork/analysis.html) — harmonic analysis on real music: upload a picture of a score, box the chords, and students write Roman numerals or chord symbols beside the music.
- **Canvas pages:** [take.html](https://larsenjazz-ctrl.github.io/clefwork/take.html) takes one quiz and ends with a results link to hand in; [results.html](https://larsenjazz-ctrl.github.io/clefwork/results.html) shows one student's results from that link.

## How it works

A quiz's settings and a random seed are packed into a **quiz code**, so everyone who opens the same code gets the same questions. When a student finishes, their name, score, timings and answers are packed into a **report code** that the teacher pastes into the Grade reports tab, where the answers can be viewed on the staff. Both codes carry a checksum, and report codes also carry a seal tied to the quiz.

Question types: place a note, name a note, intervals (simple and compound), chords (triads through 13ths, inversions, typed chord symbols), scales (including pentatonics and modes), key signatures, chord progressions, figured bass (single chords and progressions), and voicings — single voiced chords and voiced progressions.

### Voicings

Two tabs build chords from the teacher's complexity settings (sizes, qualities, altered notes, chords from a key or chromatic, slash chords) and voice them with a named technique: stacked thirds, chorale, block voicing, drop 2, drop 2 & 4, 5 plane / 9 plane, pop horn voicings, inner sevenths, or a voicing the teacher writes out. Each technique has its own counter and its own choices — staff, open or closed, three or four notes, inner 2nds. Students either write the notes for a printed chord symbol, or write the chord symbol for a printed voicing.

### Clefwork Keys

A separate app, built on the same engine, for one skill: knowing a note in three forms. Each question shows a note one way — **on the grand staff**, **as a name with its octave** (F♯4; middle C is C4), or **as a highlighted piano key** — and asks for it another way: **write it on the grand staff**, **type the name**, or **play it on the piano**. The teacher picks which ways to show and which ways to answer, and the quiz mixes every pairing that isn't simply copying. The piano plays each note as a key is pressed, a name is typed, or a note is written.

Octaves always count. A piano key has no spelling, so when a key is shown either name for it is right (C♯4 or D♭4); a note on the staff has one spelling unless the quiz accepts enharmonic spellings. Keys quizzes use the same quiz codes, report codes, grade checker, Canvas pages and printing as the main app.

### Clefwork Analysis

A separate app, built on the same engine, for analysing real music. The teacher uploads a picture of a score — a scan, an export from notation software, or a screenshot — and drags a box around each chord or passage to ask about. For each box Clefwork asks whether students should write a **Roman numeral**, a **chord symbol**, or **both**; the teacher types the answer and saves the box before drawing the next one. A quiz-wide setting can switch every box to Roman numerals, chord symbols, or both, and lists any box that lacks an answer for it. A box can accept more than one answer (`I64, Cad64`).

Students see the whole score with each box lightly highlighted in its own colour. Their answer boxes sit outside the music — chord symbols above each system, Roman numerals below — centred under the part they refer to, numbered and tinted to match. A small key reminds them what the figures mean (6, 6/4; 7, 6/5, 4/3, 4/2) and how to type them: there is no figure dropdown, just `V65`, `ii6`, `vii°7` (or `viio7`), `viiø7` (or `vii/o7`), `V7/V`, `N6`, `Ger+6`. Roman numerals are marked by what they mean, so `V65` and `V6/5` are the same answer; chord symbols follow the same rules as the rest of Clefwork (mi, ma, °, ♭/♯, slash chords). With partial credit on, a box that asks for both earns half for each.

The picture travels inside the quiz link as a compressed black-and-white copy — about 8–15 KB for a passage, more for a dense full page — so nothing is hosted anywhere. Detail (Standard, High, Highest) and ink (Lighter, Normal, Darker) trade link length against sharpness. The quiz code on its own doesn't carry the picture, so students open the link; the code still works for grading on another computer. Report codes, the grade checker, results pages and Canvas work as they do everywhere else, and the grade checker shows each box cropped from the score with the student's answers marked. Analysis quizzes don't print.

### Retakes

Every Clefwork page ends a quiz with a **Retake quiz** button: the same quiz code, so the same questions, and a fresh start. Retakes are unlimited unless the teacher sets a limit under **Quiz rules** (none, or 1–10 retakes). The limit travels in the quiz code; quizzes without one keep exactly the codes they had.

A student's device counts their attempts and stops offering retakes once the limit is used. Because there's no server, a student could start again on another device — so every report code also records its attempt number, and the grade checker and results pages show it ("Attempt 2"), with a warning when an attempt goes past the quiz's limit. Report codes are now version 9.

### Canvas

"Set up in Canvas" on the teacher's share card gives everything needed to run a quiz through a Canvas assignment: the quiz link, a ready-made assignment description to paste into the HTML editor, an embed for a Canvas page, and an optional number of points the quiz is worth there. Students take the quiz on `take.html`, then submit their results link as a **Website URL**. SpeedGrader shows a snapshot of each student's results page — name, score, the score scaled to the Canvas points, and every answer — with a link to the live page.

Canvas can't receive the grade by itself: that needs an LTI tool running on a server, which this app deliberately doesn't have. The teacher types the score from SpeedGrader. Correct answers stay off shared results pages unless the quiz lets students check answers; on the computer the quiz was built on, the results page marks everything against the saved quiz.

### Printing

The **Print** tab makes a paper copy of the current quiz: a header with the quiz title, teacher, course and date (mm/dd/yyyy, today's by default) and a blank for the student's name, then every question with a blank line beside its number for the point value, the printed example, and room to answer. Staves print at an inch or more — a grand staff 65% taller again, so there is room to write in both clefs — question text at 12pt, margins at 0.75 in (19 mm on A4), on Letter, Legal or A4. Every page carries a footer with the quiz ID and a QR code that opens the quiz. The preview zooms to fit a whole page, with a slider for a closer look. "Save as PDF" writes the PDF itself — the staves are drawn as line work, so they stay sharp at any size — and "Export Word" writes a .docx with the staves as pictures.

## Building

Everything is plain HTML, CSS and JavaScript with no build dependencies — including the QR encoder, the PDF writer, the PNG writer and the Word (.docx) writer. `./build.sh` concatenates `src/` into the files in `dist/`:

```
dist/clefwork.html                    teacher app, body only (for embedding)
dist/clefwork-standalone.html         teacher app, complete page
dist/clefwork-student.html            student app, body only
dist/clefwork-student-standalone.html student app, complete page
dist/clefwork-keys*.html              Clefwork Keys
dist/clefwork-analysis*.html          Clefwork Analysis
dist/clefwork-take-standalone.html    Canvas: take one quiz
dist/clefwork-results-standalone.html Canvas: one student's results
dist/site/                            copies published to GitHub Pages
```

Set `CLEFWORK_BASE` before building to change the address used in shared links.
