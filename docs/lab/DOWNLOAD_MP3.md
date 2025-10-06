# Download MP3 helper (Lab)

This endpoint and UI provide a developer convenience to extract audio from a
YouTube URL and save it to `artifacts/<slug>/` as an audio file (default: MP3).

Important prerequisites

- yt-dlp must be installed and available on your PATH.

- ffmpeg must be installed and available on your PATH (needed for audio extraction).

Install on Windows (recommended):

- yt-dlp: [yt-dlp installation](https://github.com/yt-dlp/yt-dlp#installation)
  - e.g. using winget: `winget install --id=ytproject.yt-dlp`

- ffmpeg: [ffmpeg downloads](https://ffmpeg.org/download.html)
  - e.g. using winget: `winget install --id=Gyan.FFmpeg`

How to use (dev)

1. Start the API and client dev servers. The Lab UI auto-enters in DEV.

   - `npm run dev` (or use your existing dev launcher)

2. Open the Lab UI and paste a YouTube URL into the downloader.

3. Click Download and wait. The UI will return a link to the saved MP3 under `/artifacts/<slug>/`.

- API: POST `/api/lab/download-mp3`

- Body:

  ```json
  { "url": "https://youtube.com/watch?v=...", "slug": "optional-slug", "opts": { "audio_format":"mp3", "audio_quality":"192" } }
  ```

  - Response (success): `{ "url":"/artifacts/<slug>/audio.mp3", "slug":"<slug>" }`
- Errors:

  - `yt-dlp-not-found` → helpful `help` URL returned; install yt-dlp first.

  - `ffmpeg-not-found` → helpful `help` URL returned; install ffmpeg first.

Notes & safety

- This endpoint is guarded by Lab Mode; it is not enabled in production by default.

- Downloads are performed on the server and written to `artifacts/` — ensure you trust URLs you submit.

- Large downloads may take time; the response is delivered after yt-dlp finishes.

- If you want streaming/partial download support, we can add a job-based `/status` flow that writes progress.
