#!/bin/sh
# Bundles src/ into one self-contained page.
#   dist/clefwork.html            — body-only page (for publishing as a Claude artifact)
#   dist/clefwork-standalone.html — full HTML document to host anywhere or open from disk
set -e
cd "$(dirname "$0")"
BASE="${CLEFWORK_BASE:-https://larsenjazz-ctrl.github.io/clefwork/}"
HEAD='<title>Clefwork Music Quizzes</title>
<meta name="description" content="Build music theory quizzes, have students write notes on the staff, and grade them from report codes — no server needed.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=JetBrains+Mono:wght@500;700&family=Noto+Music&display=swap">'
# The Clefwork logo (assets/), embedded so every page stays a single file. The dark-mode copies
# have light lettering. logo_css NAME FILE → a CSS variable holding that image, light and dark.
b64() { base64 < "$1" | tr -d '\n'; }
logo_css() {
  printf ':root{--%s:url(data:image/png;base64,%s)}' "$1" "$(b64 "assets/$2.png")"
  printf '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--%s:url(data:image/png;base64,%s)}}' "$1" "$(b64 "assets/$2-dark.png")"
  printf ':root[data-theme="dark"]{--%s:url(data:image/png;base64,%s)}\n' "$1" "$(b64 "assets/$2-dark.png")"
}
MARK_CSS=$(logo_css logo-mark mark)
HEAD="$HEAD
<link rel=\"icon\" type=\"image/png\" href=\"data:image/png;base64,$(b64 assets/favicon.png)\">
<link rel=\"apple-touch-icon\" href=\"data:image/png;base64,$(b64 assets/apple-touch-icon.png)\">"
body() {
  echo "<script>window.CLEFWORK_BASE = '$BASE';</script>"
  echo "<style>"; cat src/styles.css; echo "$MARK_CSS"; echo "</style>"
  cat src/shell.html
  echo "<script>"; cat src/theory.js src/progressions.js src/chords.js src/figured.js src/voicings.js src/keys.js src/analysis.js src/rhythm.js src/rhythmgen.js src/qr.js src/pdf.js src/print.js src/docx.js src/codec.js src/staff.js src/rhythmstaff.js src/piano.js src/audio.js src/app.js; echo "</script>"
}
# Student version: same app with practice + take-a-quiz only (no quiz codes, no grading tab).
SHEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork Practice</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes#Practise music theory on the staff, and take quizzes from your teacher#')
FLAG='<script>window.CLEFWORK_STUDENT = true;</script>'
DOC='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
{ echo "$HEAD"; body; } > dist/clefwork.html
{ echo "$DOC"; echo "$HEAD"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-standalone.html
{ echo "$SHEAD"; echo "$FLAG"; body; } > dist/clefwork-student.html
{ echo "$DOC"; echo "$SHEAD"; echo "$FLAG"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-student-standalone.html
# The Canvas edition: take.html only takes a quiz and ends with a results link to submit;
# results.html shows one student's results from that link (it opens in SpeedGrader).
THEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork Quiz</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes#Take a music theory quiz on the staff and hand in your results link#')
RHEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork Results</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes#One student’s quiz results#')
TFLAG='<script>window.CLEFWORK_STUDENT = true; window.CLEFWORK_MODE = "canvas";</script>'
RFLAG='<script>window.CLEFWORK_MODE = "results";</script>'
{ echo "$DOC"; echo "$THEAD"; echo "$TFLAG"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-take-standalone.html
{ echo "$DOC"; echo "$RHEAD"; echo "$RFLAG"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-results-standalone.html
# Clefwork Keys: the piano and note-name app, built from the same engine.
KHEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork Keys</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes#Quizzes on reading notes: the grand staff, note names with octaves, and the piano keyboard#')
KFLAG='<script>window.CLEFWORK_MODE = "keys";</script>'
{ echo "$KHEAD"; echo "$KFLAG"; body; } > dist/clefwork-keys.html
{ echo "$DOC"; echo "$KHEAD"; echo "$KFLAG"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-keys-standalone.html
# Clefwork Analysis: questions on a picture of the score, from the same engine.
AHEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork Analysis</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes#Harmonic analysis quizzes on real music: box the chords on a score and students write Roman numerals or chord symbols#')
AFLAG='<script>window.CLEFWORK_MODE = "analysis";</script>'
{ echo "$AHEAD"; echo "$AFLAG"; body; } > dist/clefwork-analysis.html
{ echo "$DOC"; echo "$AHEAD"; echo "$AFLAG"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-analysis-standalone.html
# Clefwork Rhythm: rhythmic dictation on a one-line staff, from the same engine.
YHEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork Rhythm</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes#Rhythmic dictation: students hear a rhythm in one or two parts and write it on a one-line staff#')
YFLAG='<script>window.CLEFWORK_MODE = "rhythm";</script>'
{ echo "$YHEAD"; echo "$YFLAG"; body; } > dist/clefwork-rhythm.html
{ echo "$DOC"; echo "$YHEAD"; echo "$YFLAG"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-rhythm-standalone.html
# The landing page: pick a tool, or paste report codes to grade.
HHEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes — no server needed#Music theory quiz tools for teachers: build quizzes, share links, and grade the reports students send back#')
{ echo "$DOC"; echo "$HHEAD"; echo "<style>"; cat src/styles.css; echo "$MARK_CSS"; logo_css logo-full logo; echo "</style>"; echo '</head><body>'; cat src/home.html; echo '</body></html>'; } > dist/clefwork-home.html
# Copies for GitHub Pages: the landing page at index.html, the quiz builder at clefwork.html,
# the student app at student.html, the Canvas pages at take.html and results.html, and the other
# tools at keys.html, analysis.html and rhythm.html.
mkdir -p dist/site
cp dist/clefwork-home.html dist/site/index.html
cp dist/clefwork-standalone.html dist/site/clefwork.html
cp dist/clefwork-student-standalone.html dist/site/student.html
cp dist/clefwork-take-standalone.html dist/site/take.html
cp dist/clefwork-results-standalone.html dist/site/results.html
cp dist/clefwork-keys-standalone.html dist/site/keys.html
cp dist/clefwork-analysis-standalone.html dist/site/analysis.html
cp dist/clefwork-rhythm-standalone.html dist/site/rhythm.html
wc -c dist/*.html
