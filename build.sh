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
body() {
  echo "<script>window.CLEFWORK_BASE = '$BASE';</script>"
  echo "<style>"; cat src/styles.css; echo "</style>"
  cat src/shell.html
  echo "<script>"; cat src/theory.js src/progressions.js src/chords.js src/figured.js src/codec.js src/staff.js src/audio.js src/app.js; echo "</script>"
}
# Student version: same app with practice + take-a-quiz only (no quiz codes, no grading tab).
SHEAD=$(printf '%s' "$HEAD" | sed 's#<title>Clefwork Music Quizzes</title>#<title>Clefwork Practice</title>#; s#Build music theory quizzes, have students write notes on the staff, and grade them from report codes#Practise music theory on the staff, and take quizzes from your teacher#')
FLAG='<script>window.CLEFWORK_STUDENT = true;</script>'
DOC='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
{ echo "$HEAD"; body; } > dist/clefwork.html
{ echo "$DOC"; echo "$HEAD"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-standalone.html
{ echo "$SHEAD"; echo "$FLAG"; body; } > dist/clefwork-student.html
{ echo "$DOC"; echo "$SHEAD"; echo "$FLAG"; echo '</head><body>'; body; echo '</body></html>'; } > dist/clefwork-student-standalone.html
# Copies for GitHub Pages: the teacher app at index.html, the student app at student.html.
mkdir -p dist/site
cp dist/clefwork-standalone.html dist/site/index.html
cp dist/clefwork-student-standalone.html dist/site/student.html
wc -c dist/*.html
