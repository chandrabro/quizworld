# Quiz Video Studio — क्विज भिडियो स्टुडियो

A 100% browser-based quiz video maker. No install, no backend, no build step.
Supports Nepali (Devanagari) text, browser text-to-speech, Excel/CSV/JSON import and video export.

## Deploy (GitHub + Vercel)

1. Create a new GitHub repository and upload these files to the root:
   `index.html`, `styles.css`, `app.js`, `vercel.json`, `README.md` and the `vendor/` folder (contains `mp4-muxer.js`)
2. Go to https://vercel.com/new, import the repository.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Click **Deploy**.
4. Open the URL Vercel gives you. Every `git push` redeploys automatically.

You can also just double-click `index.html` to try it locally (needs internet for fonts and the Excel library).

## Excel / CSV template

| S.N | Question | Option A | Option B | Option C | Option D | Correct Answer | Explanation (optional) | Timer (optional) |
|-----|----------|----------|----------|----------|----------|----------------|------------------------|------------------|

`Correct Answer` accepts `A`/`B`/`C`/`D`, `1`–`4`, `क`/`ख`/`ग`/`घ`, or the exact answer text.
Use the **⬇ Excel template** button in the app for a ready file (includes a Nepali example).

## JSON format

```json
[
  { "question": "What is the capital of Nepal?",
    "options": ["Pokhara", "Kathmandu", "Lalitpur", "Biratnagar"],
    "answer": "B", "explanation": "optional", "timer": 12 }
]
```
`a`/`b`/`c`/`d` keys instead of `options`, and `correct`/`correctAnswer` instead of `answer`, also work.

## How a question plays

1. Big **Question N** (or **प्रश्न नं. N**) card — read aloud if TTS is on
2. Question + options appear, countdown ring runs, ticks in the last seconds
3. **Correct answer** banner + the right option highlighted in green, reveal sound, optional explanation

## Measure all

Voice tab (or Questions tab) → **Measure all**. The app reads every question one by one, times the voice and sets
each question's timer to `reading time + extra thinking time`. You can still edit any timer by hand.

## Exporting video — important notes

* Works in Chrome / Edge (MP4 or WebM) and recent Safari. Keep the tab visible while recording — it records in real time.
* **Sound effects + music** are recorded directly.
* **Browser text-to-speech cannot be recorded by a web page.** To get the voice into the file, choose
  *“Capture everything”* in the Export tab; the browser asks what to share — pick **Entire screen** and tick
  **Share system audio** (Chrome/Edge on Windows or ChromeOS). Tab-only sharing usually does not include the voice.
* Nepali voice availability depends on the device. Microsoft Edge usually has natural Nepali voices; otherwise
  a Hindi/Marathi voice is used as a fallback for Devanagari.

## 9:16 vertical (Shorts / Reels / TikTok)

Style tab → Video shape → 9:16. The layout re-flows for portrait: larger text, taller option cards, and a
**safe zone** (on by default) that keeps content clear of the platform buttons at the top and bottom.
Use **Text size** to scale all text up or down.

## Intro / outro videos and title animations

Style tab → **Intro / outro video**. Your clip plays before the title slide (intro) and after the outro slide (outro);
its sound is included in the export. Turn off “Show title slide” to use the video alone. Title/outro slides can use
*Rise*, *Zoom*, *Slide* or *Typewriter* (letter-by-letter, safe for Devanagari).

## Last-seconds cue

Timing & Sound tab. In the last N seconds of every question a rising sweep (or your own audio file) plays, Audio 1
fades down, and the screen edge pulses red.

## Countdown styles and quiz summary slide

Style tab → **Countdown style**: Ring, Big number, Bar under header, or Top bar.
Style tab → **Quiz summary slide**: an end card before the outro that asks viewers to comment their score, with an
optional answer key and score bands (Genius / Great / Good / Keep practising; Nepali wording when the Nepali preset is used).

## Fast export (offline rendering)

Export tab → Export method → **Fast**. Frames are drawn one by one and audio is mixed offline using the browser's
WebCodecs, then saved as MP4 — typically several times faster than the video length, no screen-share prompt, and it
keeps working if you switch tabs. It includes effects, music, Audio 1, the last-seconds cue and intro/outro sound, but
**not the text-to-speech voice** (a web page cannot capture it). Choose **Live recording** when you need the voice.

## Privacy

Nothing is uploaded. Questions are autosaved in your browser's localStorage; use **Save project** for a portable file.
