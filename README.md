# Sanjivani Setu — संजीवनी सेतु

**A store of measurement agents that turn an ordinary laptop camera into a clinical instrument.**

Pulse from the colour of your skin. Fatigue from your eyelids. Tremor frequency from your fingertips. The information is already in the video — this is the software that reads it.

Every agent reports a confidence score and **refuses to display a number it cannot stand behind**. That restraint is the design, not a limitation: a contactless measurement that hides its own uncertainty is worse than no measurement at all.

> **Not a medical device.** This produces wellness and research estimates. It does not diagnose, treat or rule out any condition.

---

## Agents

| Agent | What it measures | Cloud keys needed |
|---|---|---|
| **Contactless Vitals** | Heart rate, HRV (SDNN, RMSSD), breathing rate, stress index, calibrated blood pressure | None |
| **Alertness & Gaze** | PERCLOS, blink rate and duration, yawns, head nodding, gaze direction, fatigue score | None |
| **Tremor & Finger Tapping** | Tremor frequency and amplitude by FFT, tap rate, amplitude decrement, rhythm variability | None |
| **FAST Stroke Check** | Face asymmetry, arm drift, speech clarity | None |
| **Live Wellness Companion** | Everything the vitals agent measures, plus voice acoustics — pitch, jitter, shimmer, harmonics-to-noise, speech rate, pausing — during a spoken conversation | Claude to talk back; Polly to be heard. Measurement works without either. |

All measurement runs in the browser. **No video frame or audio sample ever leaves your device** — only derived numbers are sent, and only when a cloud feature is switched on.

---

## Languages and stack

| Layer | Language | Why |
|---|---|---|
| Signal processing | **TypeScript** | Pure, synchronous, dependency-free. Runs identically in the browser, a worker, or Node, which is what makes it testable without a camera. |
| UI | **TypeScript + React 19 + Next.js 15** | App Router, server components for pages, client components for anything touching the camera. |
| Styling | **Tailwind CSS v4** | |
| Computer vision | **MediaPipe Tasks Vision (WASM)** | Face mesh with iris, hands, pose. GPU-delegated, runs locally. |
| Audio capture | **Web Audio API + AudioWorklet** | Capture runs on the audio thread, where the deadline is a few milliseconds, so it cannot be blocked by the face landmarker on the main thread. |
| API routes | **TypeScript on Node** | Next route handlers. The only place secrets exist. |
| Tests | **Vitest** | Synthetic signals with known ground truth. |

There is no Python and no separate backend service. The physiology is arithmetic on a time series, and putting it in the browser means the video never has to be uploaded — which is both a privacy property and the reason it works offline.

---

## Quick start

```bash
npm install
npm run fetch-models   # ~50 MB, one time; enables fully offline operation
npm run dev
```

Open <http://localhost:3000>. Camera access requires `localhost` or HTTPS.

```bash
npm test              # 93 tests against synthetic signals with known ground truth
npm run typecheck
npm run lint
npm run build
npm run verify:browser  # 25 checks in a real Chrome; needs the dev server running
```

`verify:browser` covers what the unit tests structurally cannot. It serves the
camera from a canvas and the microphone from a 130 Hz sawtooth oscillator, then
checks that the WASM runtime and task models come from our own origin, that the
face landmarker initialises and its detection loop runs, that the audio worklet
captures and the analyser reports **130 Hz** back, and that with a faceless
video the app reports nothing rather than inventing a plausible number.

`fetch-models` copies the MediaPipe WASM runtime out of `node_modules` and downloads the three `.task` models into `public/mediapipe`. If you skip it the app falls back to the Google CDN, but running it means a venue's wifi failing cannot take your demo down.

---

## How the pulse is actually extracted

Each stage exists because the one before it leaves a specific problem unsolved.

1. **Region selection.** MediaPipe face landmarks define a forehead box (inset from the hairline, stopping above the brows) and two cheek boxes. Pixels are screened by channel *ratios* rather than absolute brightness — absolute-value skin detectors are badly biased against darker skin, whereas the red-above-green-above-blue relationship holds across tones.

2. **Uniform resampling.** Webcam frames do not arrive at a constant rate; dropped frames and browser throttling are normal. Every spectral method downstream assumes uniform sampling, so timestamps are interpolated onto a fixed grid first. Skipping this is the single most common cause of a wrong heart rate.

3. **Pulse extraction, three ways.** [POS](https://doi.org/10.1109/TBME.2016.2609282) (Wang et al., 2017) and [CHROM](https://doi.org/10.1109/TBME.2013.2266196) (de Haan & Jeanne, 2013) project RGB onto a direction where the pulse survives and motion-induced intensity change cancels. Plain detrended green is kept as a third candidate, because POS and CHROM earn their artefact rejection by combining three channels — and therefore adding three lots of uncorrelated sensor noise. When the subject is still, green wins.

4. **Zero-phase bandpass.** A single biquad run forwards then backwards. Squaring the magnitude response cancels the phase response, so peak positions are preserved — which matters because HRV is defined by the spacing between those peaks.

5. **Harmonic correction.** A real pulse is not a sine wave; the dicrotic notch puts substantial energy at twice the heart rate. At low rates that harmonic can be taller than the fundamental, and reporting it doubles the heart rate. This is the classic rPPG failure and the most likely to be believed, since 96 BPM is perfectly plausible for someone whose pulse is 48.

6. **Method selection by prominence.** Prominence — the share of in-band power under the tallest peak — separates a pulse from noise, because a heartbeat concentrates power into one narrow line while noise spreads it. The best of the three candidates wins, chosen per measurement rather than fixed in advance.

7. **Beat detection.** An adaptive-threshold detector with a refractory period derived from the spectral estimate, so the two stages reinforce each other rather than failing independently. Intervals more than 25% from the running median are discarded as missed or doubled beats before HRV is computed.

---

## Why numbers disappear

Signal quality is the **product** of seven independent terms, not their average:

| Term | Fails when |
|---|---|
| Face visibility | Face out of frame or poorly detected |
| Motion | Head moving beyond what POS can cancel |
| Frame rate | Camera below ~15 fps |
| Timing jitter | Browser throttling the render loop |
| Spectral prominence | No tight spectral line — weak or absent pulse |
| Window fill | Not enough data collected yet |
| **Cross-method agreement** | POS, CHROM and green disagree about the rate |

A serious failure in any one drags the whole score down instead of being averaged away, and the engine reports **which** term is binding — so the interface says "too much movement" rather than "poor signal".

Cross-method agreement is the term that stops confident wrong answers. The three projections weight the colour channels very differently, so a noise peak that looks prominent in one rarely appears at the same frequency in the others. A test sweeps noise across five orders of magnitude and asserts the engine either reports the right rate or reports nothing.

---

## The companion agent, and what it replaces

The companion mirrors the shape of a hackathon project that assembled seven commercial services into a conversational wellness avatar. Same experience, different foundation:

| Their component | Here | Why |
|---|---|---|
| Shen.AI SDK — camera vitals | Our own rPPG engine | Already built, and open. Shen's own clinical report puts camera blood pressure at 10.18 mmHg mean error with a 0.38 correlation, so the cuff calibration is not optional there either. |
| Thymia — voice biomarkers | Our own acoustic engine | The underlying measures are standard phonetics, not a trade secret. What a vendor adds is a trained mapping onto clinical labels, which is exactly the part we decline to make. |
| Anam — photoreal video avatar | An abstract presence | Not only cost. A synthetic face on a tool that measures your body and discusses it invites being read as a clinician. An abstract presence cannot be mistaken for a person, which is the honest position for something that is not one. It pulses in time with your measured heart rate. |
| Agora ConvoAI — orchestration | An in-browser turn loop | Turn-taking is a silence timer and a state machine. Doing it locally removes a paid dependency and forces the two hard parts to be explicit: deciding when someone has finished speaking, and stopping the assistant from hearing itself. |
| OpenAI GPT | **Claude** | |
| ElevenLabs TTS | **Amazon Polly** | Neural voices |
| Deepgram ASR | **Web Speech API** | Free and built in. The trade-off is real: absent in Firefox, and it needs the network. Typing is a first-class alternative, not a fallback. |

Net effect: seven paid providers reduced to two, and the two that remain are ones you already hold keys for.

---

## Voice acoustics

The companion agent measures the voice with the standard clinical-phonetics set, the same quantities Praat computes:

| Measure | What it is | Typical conversational range |
|---|---|---|
| **F0** | Rate of vocal-fold vibration | 85–180 Hz male, 165–255 Hz female |
| **Jitter (local)** | Cycle-to-cycle variation in period | below 1.04% |
| **Shimmer (local)** | Cycle-to-cycle variation in amplitude | below 3.81% |
| **HNR** | Periodic versus turbulent energy | above 20 dB when quiet |
| **Pitch range** | Spread of F0 in semitones — flat versus animated | 2–4 |
| **Speech rate, pause ratio** | Tempo and how much of the time is silence | 4–6 syl/s, under 40% |

Jitter and shimmer are defined *cycle by cycle*, so measuring them means finding individual glottal pulses rather than working frame by frame. Two details make that work. Peaks are picked from a lightly smoothed copy of the waveform, because a glottal pulse has an almost flat top and additive noise otherwise moves the maximum a few samples each cycle — the analyser would be measuring its own noise and reporting it as vocal instability. And peak positions are parabolically interpolated, because at 16 kHz a whole-sample quantisation is a 0.8% error on a 130 Hz voice, the same order as the jitter being looked for.

Against a synthetic voice built one glottal cycle at a time, with jitter and shimmer imposed to a known value, the analyser lands **within 0.8 percentage points on jitter and 1.0 on shimmer across their whole range**, and within 3 dB on HNR.

**What this deliberately does not do.** There is a real research literature connecting these same measures to depression, Parkinson's disease and cognitive decline, and an industry built on it. Those findings are population-level; applied to one person in one conversation their error bars swallow the result. So the engine returns acoustics and stops, the UI shows each value against its published reference range with no aggregate "wellness score", and Claude's system prompt forbids reaching for that literature even to dismiss it. Collapsing these numbers into one score is the exact step where an honest measurement becomes an implied clinical claim.

---

## Blood pressure

**A camera cannot measure blood pressure.** It measures the shape and timing of the pulse wave, and pressure is *inferred* from that shape. The relationship varies enormously between people — arterial stiffness, height, age and vascular tone all move it — so a model fitted to a population produces a number that looks plausible for everyone and is right for almost nobody.

Every cleared product in this space handles it the same way, and so does this:

- **Uncalibrated** → returns nothing, with an explanation. Never a population-average guess.
- **One or two cuff readings** → offset-only model, solving for the intercept that reproduces the user's own anchor exactly. The camera then tracks *change* from that anchor.
- **Three or more** → ridge-regularised personal fit. The regularisation does real work: four features against three points is close to singular and would otherwise fit weights of several hundred mmHg per unit.
- **Uncertainty** widens with calibration age, thinness of calibration, and current signal quality, and is never reported as better than the reference cuff achieves.
- **Stale after 30 days**, because the personal anchor decays as vascular state changes.
- Morphology features must clear a **higher quality bar than heart rate**, since waveform shape is far more fragile than frequency.

---

## Cloud services

Measurement needs no keys at all. These add optional layers on top:

| Variable | Enables | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Plain-language interpretation, and the companion's replies | Claude, streamed |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | Polly text-to-speech | Neural voices |
| `SANJIVANI_SESSION_BUCKET` | Measurement history and trend | S3, plus the AWS credentials above |

Copy `.env.example` to `.env.local` and fill in what you have.

**Claude's system prompt is a safety layer, not a personality.** It forbids diagnosis, requires respecting the confidence score, forbids inventing values the engine deliberately withheld, requires flagging uncalibrated blood pressure as untrustworthy, and defines an escalation rule for possible stroke signs or an out-of-range heart rate at good signal quality. The companion's prompt adds the rules that matter for a live spoken agent: never interpret the voice acoustics, write for the ear rather than the screen, and hand off immediately on emergency symptoms or any expression of self-harm.

Sensor readings reach the model as prose inside a `<sensors>` block, fenced off from the person's own words so that text arriving from speech recognition cannot be read as instructions. That formatting lives in `src/lib/conversation.ts` and has its own test suite, because it is the entire interface between what was measured and what the model believes.

**What reaches the cloud.** Only derived numbers — the same values shown on screen — plus the conversation transcript when the companion is running. Never a video frame, never an audio sample. Speech recognition in Chrome is the one exception worth knowing about: it is the browser's own Web Speech API, which sends audio to Google, and it is why the companion works offline for measurement but not for listening. S3 records are filed under a pseudonymous profile id the browser generates locally, never linked to a name or account.

`/api/services` reports which integrations are configured so the interface hides unavailable features rather than offering buttons that fail.

---

## Deploying to AWS Amplify

`amplify.yml` is included. In the Amplify console, connect the repository and add the environment variables above under **App settings → Environment variables**. Amplify detects Next.js and provisions the SSR runtime for the API routes automatically.

The IAM user needs `AmazonPollyFullAccess` and, if you enable history, `AmazonS3FullAccess`. Anthropic is called directly rather than through Bedrock, which avoids Bedrock's model-region availability constraints.

---

## Project layout

```
src/
  lib/signal/       fft, filters, rppg, peaks      — pure, no DOM, no React
  lib/vitals/       engine, bloodPressure
  lib/alertness/    engine                          — PERCLOS, blinks, gaze
  lib/motor/        engine                          — tremor, tapping
  lib/fast/         engine                          — face, arms, speech
  lib/voice/        engine                          — F0, jitter, shimmer, HNR
  lib/vision/       mediapipe loading, face regions
  lib/conversation  shared types + the sensor-to-prose renderer
  lib/agents/       the agent catalogue
  lib/server/       config; the only place secrets are read
  hooks/            camera, face/hand/pose tracking, vitals, voice, conversation
  components/       UI, one component per agent
  app/api/          converse + interpret (Claude), speak (Polly), sessions (S3), services
public/audio/       the capture worklet, which runs on the audio thread
tests/              synthetic signal generators and the suite
```

The `lib/*/engine.ts` files import nothing from React or the DOM. That is deliberate: it is what lets the entire measurement chain be tested against synthetic signals with known ground truth, and it is why a regression shows up as a heart rate drifting from the number we asked for rather than as something a human has to eyeball.

---

## Where the camera stops

| Not possible | Needs |
|---|---|
| Retina, optic nerve | Fundus optics |
| Blood chemistry, glucose | A chemical assay |
| Deep tissue, tumours | X-ray, CT or ultrasound |
| Brain and cardiac electrics | EEG or ECG electrodes |

A camera sees colour, motion and geometry. That is enough for a pulse, for eyelids, for fingertips, and for reading something that already carries a result. It is not enough for anything requiring a different sensing modality, and no amount of software changes that.
