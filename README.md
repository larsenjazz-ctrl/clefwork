# Clefwork

Music theory quizzes that run entirely in the browser — no server, no accounts, nothing stored online.

- **Landing page:** [index.html](https://larsenjazz-ctrl.github.io/clefwork/) — choose a tool, or paste report codes and results links to open them in the grade checker. Each teacher tool has an **← All tools** link back here. Old `index.html#grade=…` and `#take=…` links are passed on to the quiz builder.
- **Teacher app:** [clefwork.html](https://larsenjazz-ctrl.github.io/clefwork/clefwork.html) — build a quiz, share its code or link, and grade the report codes or results links students send back.
- **Student app:** [student.html](https://larsenjazz-ctrl.github.io/clefwork/student.html) — practise with instant feedback, or take a teacher's quiz and send back a report code.
- **Clefwork Keys:** [keys.html](https://larsenjazz-ctrl.github.io/clefwork/keys.html) — a separate app for reading notes: the grand staff, note names with octaves, and the piano keyboard.
- **Clefwork Analysis:** [analysis.html](https://larsenjazz-ctrl.github.io/clefwork/analysis.html) — harmonic analysis on real music: upload a picture of a score, box the chords, and students write Roman numerals or chord symbols beside the music.
- **Clefwork Rhythm:** [rhythm.html](https://larsenjazz-ctrl.github.io/clefwork/rhythm.html) — rhythmic dictation: students hear a rhythm in one or two parts and write it on a one-line staff.
- **Clefwork Melody:** [melody.html](https://larsenjazz-ctrl.github.io/clefwork/melody.html) — melodic dictation: students hear a melody of up to eight measures and write its pitches and rhythm on the staff.
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

### Clefwork Rhythm

A separate app, built on the same engine, for rhythmic dictation. The teacher writes each example on a one-line staff, or lets Clefwork make them; the computer plays each one and students write what they hear.

- **Made automatically.** The teacher chooses how many examples (up to 20), how many measures in each, the tempo (as a quarter note; other meters keep the same speed of eighth notes), and a level:
  1. *Very easy* — 4/4, quarter notes and longer, every note on a beat; rests in up to a fifth of the measures.
  2. *Easy* — 2/4 to 4/4, eighth notes and longer, no note starting off the beat; rests in up to 30% of the measures.
  3. *Medium easy* — 2/4 to 4/4, eighth notes and longer, one or two notes off the beat; rests in 10–40% of the measures.
  4. *Medium* — 2/4 to 6/4, and 3/8, 6/8, 9/8 and 12/8, eighth notes and longer, one or two notes off the beat; rests in 20–50%.
  5. *Advanced* — any time signature, sixteenth notes and longer, notes off the beat; rests in 30–70%, including ones that make the rhythm harder.
  6. *Very hard* — any time signature and any rhythm, triplets included; rests in 40–80%.
  7. *Custom rules* — a range of time signatures from 2/4 to 6/4, plus compound meters, cut time (and 3/2) or uneven meters; the shortest note; dotted notes; triplets; none, one or two, or more notes off the beat; and no rests, a few, some or many.

  Each measure is built beat by beat from short rhythmic cells chosen for the level, in a phrase that repeats measures (A A B A, A B A B …), and the clearest of many tries is kept: about four to eight notes in a 4/4 measure, long notes with short ones, no more than one syncopation a measure (one or two in the whole example at the easier levels), and a long note to end. Rests go in the share of measures the level calls for, and never fill more than half of a measure. Easy levels use quarter and half rests on the beat and an eighth rest after an eighth; harder levels add the rests that make a rhythm harder — a rest on the beat before an entry, sixteenth rests, a rest inside a triplet — and may start an example on a rest. The quiz's seed picks everything, so the quiz code carries only the settings and every student gets the same examples; "Make new examples" picks a new set. The generator is versioned in the code, so a quiz shared earlier keeps the examples it was made with.
- **Examples.** A quiz holds up to 12 examples, each one to four measures long, in 2/4 to 6/4, 3/8 to 12/8, or 2/2 and 3/2, with its own tempo. Irregular eighth-note meters (5/8, 7/8, 8/8, 10/8, 11/8) choose how their eighths group into beats (7/8 as 2+2+3, 3+2+2 or 2+3+2), which sets the beaming and the metronome.
- **Writing a rhythm.** Note values from sixteenths to whole notes, with rests. To write a dotted note or a triplet, turn on Dot or Triplet, then choose the value; both stay on until turned off. A caret shows where the next note goes, a clicked note is selected and replaced by the next value chosen, and a full measure moves the caret on. Keys: W H Q E S for the values, period (or D) for Dot, T for Triplet, R for Rest, arrows to move, Backspace to delete.
- **Full measures.** Every measure is checked against the time signature as it's written — a note that doesn't fit is refused, with how much room is left — and a quiz can't be shared until every measure is full (rests count).
- **Triplets** start on a beat: a quarter-note triplet on any beat, an eighth-note triplet on a beat. A triplet group shorter than the beat — sixteenth-note triplets in quarter-note time — may also start halfway through a beat. Mixed triplets (a quarter-note and an eighth-note triplet) are fine; a triplet that breaks these rules is refused as it's written.
- **Two parts.** A second part, with stems down, can have its own rhythm. The part with stems up plays on the piano, the part with stems down on the oboe.
- **Listening.** Students choose which measures to play (tap one, drag across several, or All), a count-off of none, one or two bars, and whether the metronome clicks under the music. Each instrument and the click has its own volume slider. They can also hear what they've written, on the same instruments. The teacher sets how many times students may play each example, and their own answer, before submitting (unlimited, or once to 10 times); every play counts, whatever it covers. Once an answer has been checked, plays are unlimited.
- **Scoring.** Graded note by note, by what sounds. Each note of the answer is right when the student has a note that starts at the same moment, in the same part, and lasts as long; a missing note, a note of the wrong length, and every extra note the student writes are each a wrong note. Rests only fill time, so a quarter rest and two eighth rests are the same answer. The teacher chooses how the quiz is scored: a point for every note (a quiz with 48 notes is out of 48, less one for each wrong note), or a percent of a total they set (the share of notes right, scaled to, say, 20 points). A question never scores below nothing.
- **Results.** Report codes (version 11 and later) carry every note the student wrote, how often they played the example and their answer, and each example's notes and wrong notes. The grade checker and results pages show the score, the wrong notes, the student's rhythm with each note marked right or wrong, and the right rhythm beneath it with the missed notes marked — both playable — and the play counts.
- **Printing.** The Print tab prints each example's tempo and a blank one-line staff with its time signature, two measures to a line, for dictation on paper.

### Clefwork Melody

Melodic dictation, built on Clefwork Rhythm: the same levels, meters, listening controls, play limits and scoring, with pitches on a five-line staff.

- **Made automatically.** The teacher chooses how many melodies (up to 20), one to eight measures in each, major keys, minor keys or both, key signatures up to 0–7 sharps or flats, treble clef, bass clef or both, the tempo, whether to allow chromatic notes, and a level. Each level uses the rhythms of the Clefwork Rhythm level with the same number, and adds the pitch rules below; *Custom rules* adds a range and a largest leap to the rhythm rules.
  1. *Very easy* — do to sol: steps and repeated notes, the odd skip within do-mi-sol.
  2. *Easy* — within a sixth: steps, and skips within the tonic chord.
  3. *Medium easy* — within an octave: leaps in the tonic and dominant chords, and phrases that end on the dominant, then the tonic.
  4. *Medium* — within a ninth: 4ths, 5ths and the odd 6th between chord tones, IV and V7 as well, and a sequence now and then.
  5. *Advanced* — up to a tenth: leaps up to a 6th, and octaves upward.
  6. *Very hard* — up to an eleventh: any leap up to an octave, 7ths in the dominant seventh.
- **How the melodies are made.** The generator follows what studies of folk songs, hymns and sight-singing books find about real melodies (Huron 1996; Vos & Troost 1989; von Hippel & Huron 2000; Krumhansl & Kessler 1982; Temperley 2007; the AP Music Theory course description, Ottman & Rogers and Karpinski for the levels). A melody is built in phrases of two or four measures — the second phrase often repeats the first one's rhythm — and each phrase takes a contour in the proportions the corpora show: arch most often, then descending, ascending and U-shaped. Steps and repeated notes make up about 90% of the moves at level 1 and about 70% at level 6, a little over half of all moves fall; small intervals tend to fall and large ones rise; a leap is followed by a step back toward the middle; and there are never more than two leaps in a row. Pitches are weighted by the key's tonal profile, with chord tones on strong beats and long notes, fa and ti off the beat, openings on do, mi or sol, half cadences on re, ti or sol, and an ending on do, most often stepping down from re. Rests come mostly between phrases, as breaths — none inside a phrase at levels 1 and 2, a few at the higher levels — and phrase-final notes are longer. In minor, the raised seventh leads to the tonic and the raised sixth only rises to it; the natural forms fall — and there are never augmented seconds or other awkward intervals. The quiz's seed picks everything, so the quiz code carries only the settings; the generator is versioned, so a shared quiz keeps its melodies.
- **Chromatic notes.** Off, every note belongs to the key (with the raised sixth and seventh in minor). On, the levels add chromatic notes as music uses them, a half step from the note they lead to and off the beat: lower neighbours (G F♯ G) from level 1, chromatic approach notes from level 3 (♯4 to 5 most often, then ♯1 to 2 and ♯5 to 6), and from level 5, in major keys, lowered notes that fall by step (♭7 to 6 most often, and ♭6 to 5, ♭3 to 2).
- **Written by the teacher.** Up to 12 melodies, each with its own key (major or minor, up to seven sharps or flats), clef, time signature (as Clefwork Rhythm), one to eight measures and tempo.
- **Writing a melody.** Click the staff where the next note goes — the height sets its pitch — then choose its value, or type the letter name (A–G) for the nearest note with that name. Notes take the key signature. A note can be dragged up or down, or moved with ↑ ↓ (Shift for an octave), and ♯ ♭ ♮ change the note just written or clicked; accidentals carry through the measure as in print. Keys: 1 2 4 8 6 for whole to sixteenth, period for Dot, T for Triplet, R for Rest, + − = for sharp, flat and natural. Every note sounds as it's written. The staff shows up to four measures a line, fewer on a narrow screen.
- **Listening.** As Clefwork Rhythm, on the piano, plus **Hear the key** — the tonic arpeggio and chord, which doesn't use up a play. The teacher can tell students the first note: it's shown with the key and tempo, and the staff's cursor starts on it.
- **Scoring.** Note by note, by what sounds: a note is right when the student has a note that starts at the same moment, lasts as long and has the same pitch — enharmonic spellings count as the same note. The teacher chooses whether a note needs both pitch and rhythm right for its point or earns half a point for each, and scores the quiz by notes or as a percent of a total, as in Clefwork Rhythm.
- **Results.** Report codes (version 12) carry every note the student wrote and each melody's wrong pitches and rhythms. The grade checker and results pages show the student's melody with each note marked, the right melody beneath with the missed notes marked, both playable, and "1 wrong of 13 (1 pitch, 0 rhythm)".
- **Printing.** The Print tab prints each melody's key, meter, tempo and first note (when given) and blank staves with the clef and key signature, two measures to a line.

### Retakes

Every Clefwork page ends a quiz with a **Retake quiz** button: the same quiz code, so the same questions, and a fresh start. Retakes are unlimited unless the teacher sets a limit under **Quiz rules** (none, or 1–10 retakes). The limit travels in the quiz code; quizzes without one keep exactly the codes they had.

A student's device counts their attempts and stops offering retakes once the limit is used. Because there's no server, a student could start again on another device — so every report code also records its attempt number, and the grade checker and results pages show it ("Attempt 2"), with a warning when an attempt goes past the quiz's limit. Report codes became version 9 with this (version 10 added rhythm answers, 11 their note scores, 12 melodies).

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
dist/clefwork-rhythm*.html            Clefwork Rhythm
dist/clefwork-melody*.html            Clefwork Melody
dist/clefwork-take-standalone.html    Canvas: take one quiz
dist/clefwork-results-standalone.html Canvas: one student's results
dist/site/                            copies published to GitHub Pages
```

Set `CLEFWORK_BASE` before building to change the address used in shared links.
