# Quiz Video Studio — क्विज भिडियो स्टुडियो

A 100% browser-based quiz video maker. No install, no backend, no build step.
Supports Nepali (Devanagari) text, browser text-to-speech, Excel/CSV/JSON import and video export.

## Deploy (GitHub + Vercel)

1. Create a new GitHub repository and upload these files to the root:
   `index.html`, `styles.css`, `app.js`, `vercel.json`, `README.md`
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

## Privacy

Nothing is uploaded. Questions are autosaved in your browser's localStorage; use **Save project** for a portable file.
