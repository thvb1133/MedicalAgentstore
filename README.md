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

All measurement runs in the browser. **No video frame ever leaves your device.**

---

## Languages and stack

| Layer | Language | Why |
|---|---|---|
| Signal processing | **TypeScript** | Pure, synchronous, dependency-free. Runs identically in the browser, a worker, or Node, which is what makes it testable without a camera. |
| UI | **TypeScript + React 19 + Next.js 15** | App Router, server components for pages, client components for anything touching the camera. |
| Styling | **Tailwind CSS v4** | |
| Computer vision | **MediaPipe Tasks Vision (WASM)** | Face mesh with iris, hands, pose. GPU-delegated, runs locally. |
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
npm test          # 48 tests against synthetic signals
npm run typecheck
npm run lint
npm run build
```

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
| `ANTHROPIC_API_KEY` | Plain-language interpretation | Claude, streamed |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | Polly text-to-speech | Neural voices |
| `SANJIVANI_SESSION_BUCKET` | Measurement history and trend | S3, plus the AWS credentials above |

Copy `.env.example` to `.env.local` and fill in what you have.

**Claude's system prompt is a safety layer, not a personality.** It forbids diagnosis, requires respecting the confidence score, forbids inventing values the engine deliberately withheld, requires flagging uncalibrated blood pressure as untrustworthy, and defines an escalation rule for possible stroke signs or an out-of-range heart rate at good signal quality.

**What reaches the cloud.** Only derived numbers — the same values shown on screen. Never a video frame, never audio. S3 records are filed under a pseudonymous profile id the browser generates locally, never linked to a name or account.

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
  lib/vision/       mediapipe loading, face regions
  lib/agents/       the agent catalogue
  lib/server/       config; the only place secrets are read
  hooks/            camera, face/hand/pose tracking, vitals, speech
  components/       UI, one component per agent
  app/api/          interpret (Claude), speak (Polly), sessions (S3), services
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
