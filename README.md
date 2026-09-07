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
npm test              # 292 tests against synthetic signals with known ground truth
npm run typecheck
npm run lint
npm run build
npm run verify:browser  # 78 checks in a real Chrome; needs the dev server running
```

`verify:browser` covers what the unit tests structurally cannot. It serves the
camera from a canvas and the microphone from a 130 Hz sawtooth oscillator, then
checks that the WASM runtime and task models come from our own origin, that the
face landmarker initialises and its detection loop runs, that the audio worklet
captures and the analyser reports **130 Hz** back, and that with a faceless
video the app reports nothing rather than inventing a plausible number. It
also drives the avatar picker, books and cancels an appointment, seeds a
history to confirm that a low-quality reading is shown in the list but kept out
of the trend, reads the pixels of the signer and of every fingerspelled handshape to prove the
hand model actually draws rather than silently producing an empty canvas, and
flips the theme to confirm the page repaints and remembers.

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

## Choosing a companion

Six presences, each a distinct silhouette rather than a recolour, drawn live on a canvas. All of them pulse in time with the heart rate the camera is reading, using a pulse-wave shape rather than a sine, and fall back to a slow breathing rhythm — deliberately far below any plausible pulse — when there is no measurement to show.

| | Manner | Default voice |
|---|---|---|
| **Asha** | Warm and steady | Amy, British English |
| **Vikram** | Calm and precise; names the measurement before interpreting it | Arthur, British English |
| **Tara** | Gentle and unhurried, built for older users | Ruth, slow and clear |
| **Pip** | Simple and encouraging, built for children | Ivy, a child's voice |
| **Kiran** | Everyday Indian English | Kajal, Indian English |
| **Nova** | Brisk, minimal small talk | Stephen, American English |

Each has both an **illustrated portrait** and an **abstract presence**, and which one you see is a setting rather than a decision made for you. A face is easier to sit with for ten minutes and is what most people expect; a shape does not imply a person who never said any of this, which some people prefer from something handing them health information.

You can also **upload your own picture**. It is cropped, scaled and re-encoded in the browser and kept in `localStorage`. It never leaves the device — a face is biometric data and is frequently a photograph of someone other than the person uploading it — and the re-encode drops the EXIF block, which on a phone photograph carries the GPS coordinates where it was taken.

**The portraits do not lip-sync, and that is a decision rather than a gap.** Driving a mouth on a face from an audio envelope is the deepfake technique, differing only in intent. On a tool that says things like "your blood pressure looks raised", a face that appears to be speaking borrows the authority of a clinician who never said any of it — and someone who uploads a photograph of their own doctor would be making that face say things the person it belongs to never agreed to. The heartbeat ring, the voice-tracking rim and the thinking sweep carry the movement instead, which is the same information the abstract presence carried.

Speaking rate is adjustable from 60% to 125% through SSML prosody. The range is asymmetric on purpose: slowing down helps anyone hard of hearing, anyone reading captions alongside the audio, and anyone meeting an accent for the first time, while speeding past about 125% slurs the neural voices and helps almost nobody.

Choosing an avatar changes **how** the assistant speaks, never **what** it may say. The persona text is appended below the safety rules in the system prompt with an explicit statement that the rules win, and is capped at 1200 characters so it cannot dilute them by volume. `tests/converse.test.ts` asserts that property directly, including against a persona that tries to instruct the model to diagnose.

Everything is stored in `localStorage` and never sent anywhere. The profile carries a name and an age band, which are the two fields most likely to count as personal data, and neither has any reason to leave the device.

---

## Talking in your own language

Twenty-four languages, each previewable before it is chosen. A language only appears here when **all three** parts of the loop work in it: the browser recognises speech in it, Claude answers fluently in it, and Polly has a voice for it. Two out of three would be a language that half works, which is worse than not offering it — someone would choose it, be understood, and get an answer they could not read.

Someone describing chest pain or a panic attack reaches for the words they learned as a child, and asking them to do that in a second language costs both accuracy and dignity. So this is not a translation layer over an English product; the recognition language, the reply language and the voice all move together.

Three details are worth stating because they are the ones that are easy to get wrong:

- **Changing language changes the voice.** A voice reading text in a language it was not trained on does not sound accented, it sounds broken — it applies the wrong phonology letter by letter. Keeping the current voice would be the more conservative-looking choice and the worse one.
- **The reply follows the setting, not the input.** Medical vocabulary travels in English and people mix it in constantly; that is not a request to switch the whole conversation out from under them.
- **Measurements stay as digits and standard units in every language.** "72 bpm" is what is written on the machine in the clinic. A localised number is one the person cannot repeat to anyone.

Languages are listed by their endonym first — हिन्दी before Hindi — because someone looking for their own language is scanning for the word they call it, not the English name for it.

Polly's neural coverage varies by language and changes over time, so `/api/speak` falls back to the standard engine when a voice has no neural model. A flatter voice is a much smaller problem than a companion that cannot speak at all to the person who chose that language.

---

## Sign language

Two things, at [`/sign`](http://localhost:3000/sign), because signing and spelling do different jobs.

### Signing

A **signer**: a body, two arms, two hands and a face. Signs are written as keyframes against named places on that body — `FOREHEAD`, `CHIN`, `HEART`, `NEUTRAL` — because where a sign is made is part of what it means. SICK and FEEL are near enough the same handshape and differ by placement alone, so a floating hand cannot carry either of them.

The pieces that make that work:

- **Named anchors instead of coordinates.** A lexicon entry reads "flat hand, fingertips at the chin, moves forward and down", which is how a signer would describe it. Someone who knows ASL can check all 46 entries without reading a joint angle, and each carries that written description into the interface.
- **Two-bone arm IK.** Without arms the avatar is two hands floating in front of a torso, which reads as a glitch rather than as a person. Both elbow solutions are anatomically reachable, so the one that gets used is chosen by the rule real elbows follow: they hang, and they stay clear of the torso. Picking a fixed side instead folds the elbow in behind the chest whenever a hand goes above the shoulder.
- **Non-manual markers, as grammar.** Raised brows make a yes/no question, drawn-together brows make a wh-question, a head shake negates. These are held across the whole clause rather than pulsed on one sign, because that is their scope. A signed question with a blank face is not a neutral question — it is a statement.
- **Transitions timed by distance.** A hand crossing from the forehead to the opposite hip has four times as far to travel as one moving across the chest. Given the same fixed beat, the long one snaps, and a snap reads as a dropped frame rather than as movement. The hands also come back down at the end of a sequence rather than cutting to rest, which on a loop was the single most visible discontinuity in the whole animation.
- **Palm flips pass through edge-on.** Palm orientation is categorical in this model, so on its own it flips at the midpoint of a blend and the hand pops inside out in one frame. Narrowing the drawing as the flip approaches is the flat-model version of a wrist rotating, and it turns the one frame that reads as a glitch into a movement that reads as a wrist.
- **The signer breathes and blinks.** Held perfectly still between signs the figure stops reading as a person and starts reading as a frozen render — which is also the failure mode that makes people ask whether the page has crashed.
- **Depth faked by size.** Several signs are defined by moving toward the person being addressed — THANK-YOU, YOU, FINE. In a plane that is a hand that simply stops, so it is drawn larger as it comes forward.

**These are real signs. This is not fluent ASL, and the interface says so in every place it appears.** ASL is not English with the words swapped: it orders a sentence topic-first, moves verbs through space to show who did what to whom, uses classifiers that no English word triggers, and carries whole pieces of grammar on the face. Anything driven by English text must walk the sentence left to right, which produces something closer to Signed Exact English — laborious for a fluent signer to read.

So it runs as **key signs beside the full caption**, never instead of it, and function words are dropped rather than signed because padding the sequence would make the claim to be interpreting louder while making it less true. It was also built without a Deaf signer in the room, which is the largest caveat of the lot and is stated wherever the feature is offered.

### Fingerspelling

The manual alphabet and the digits, from a **parametric hand rig** rather than a set of pictures: a palm, five digits, three phalanges each, posed by curl and spread and then projected.

A rig rather than twenty-six drawings, for two reasons. Poses interpolate, so the hand travels between letters the way a hand does — and a fingerspelling reader follows that travel as much as the shapes, which is why cutting between stills is so much harder to read at the same rate. And a pose is a short list of numbers that can be inspected and corrected against a reference, which a bitmap cannot.

Fingerspelling is what carries names, medical terms and numbers — which signers spell in ordinary conversation rather than searching for a sign, and which is exactly what this application produces. So it does double duty: it is offered on its own, and it is what the signer falls back to for anything the lexicon does not cover.

Four letters are marked **approximate** wherever they appear: M, N, R and T each need one finger to cross behind or lie under another, which a hand flexed in a single plane cannot represent. They are flagged rather than quietly shipped as correct, because a reader who knows a shape is wrong can compensate and a reader who has been told it is right cannot. A handful of signs are marked the same way, for the same kind of reason — usually a palm orientation a flat drawing cannot show.

Some smaller decisions that turned out to matter:

- **Every digit is outlined.** Six letters — A, E, M, N, S and T — are the same closed fist distinguished only by the thumb. Without a line around it, the thumb is the same colour as the palm it lies against and all six become one picture.
- **The sleeves are a different shade from the torso.** Drawn in the same colour, a sleeve lying across the chest disappears into it, and the forearm below is left looking like a bar floating in front of the body with nothing holding it up.
- **The hands cast a shadow.** A hand signing over the chest is skin on skin, and an outline alone is not enough separation to read quickly.
- **Doubled letters dip.** Without a deliberate break, "LL" is a hand that does not move for two beats and the reader cannot tell one letter from two.
- **J and Z carry their paths.** Both are defined by movement; without it, J is indistinguishable from I.
- **Four skin tones.** A hand is a picture of a person's hand, and defaulting everybody to one shade is a choice rather than a neutral position.

---

## Access mode

For people who are Deaf, hard of hearing, or cannot speak:

- **Captions as a primary surface**, not a strip along the bottom — high contrast, generous line height, and a measure capped near 60 characters, because long lines are exactly what makes a wall of text hard to read.
- **Typing promoted over speaking**, with a larger input. This was already a first-class path rather than a fallback: Web Speech is absent in Firefox entirely, and speech recognition is least reliable for precisely the accents and speech differences a tool like this should serve worst-first.
- **Every audio-only cue given a visible equivalent**, including whether the assistant is thinking, so silence is never ambiguous between "working" and "broken".
- **Prompt changes**: the model is told its replies are being read rather than heard, so it never refers to its own tone of voice, and never asks someone to speak or remarks on their typing.

- **On-screen signing**, as an option rather than a default, at three levels: off, fingerspelling alone, or the full signer falling back to spelling. See the section above for what each is and what it is not. The caption stays on in every case.

---

## Morning and night

Both themes are real palettes rather than one inverted. Shadow does the separating work in a light interface where borders do it in a dark one, and the accents are darkened for the light theme because the saffron that reads as bright against near-black falls below 4.5:1 against white.

Night is the default because the camera preview and the pulse trace carry the visual weight and both read better against a dark field. Morning exists because a dark interface is genuinely harder for a good many people to read — particularly older eyes and anyone with astigmatism, for whom light text on dark smears — and because these pages get used in daylight next to a window. When nothing has been chosen, the operating system preference wins: someone who has set their whole machine to light mode has already said what they want.

The theme is applied by a small inline script in the document head, before first paint. A toggle that waits for React has already let the browser paint one frame of the wrong theme, which is the white flash that every dark-mode site with a client-side toggle gets wrong.

---

## Appointments and history

**Appointments** are local to the browser. There is no scheduling server, no email and no SMS, so nobody is expecting you — the page says exactly that. Which is why every appointment exports an `.ics` with a 15-minute alarm: handing the reminder to a calendar app is the only way one actually reaches you, and faking a notification system we cannot deliver would be worse than being honest. Bookings are validated against a past time, a time more than a year out, and a duration that is not offered.

**History** is what makes any of this more than a curiosity. A single webcam heart rate says almost nothing; the same measurement over weeks, compared against that person's own earlier readings, might. Comparing someone to themselves last Tuesday is also far safer ground than comparing them to a population norm, which is where this technology usually gets people into trouble.

- Readings are saved on **session end**, not continuously — vitals only settle after the first half-minute, and saving every intermediate estimate would fill the record with the noisy start of every session.
- Below 0.5 quality a reading is **shown in the list and excluded from every trend**, and labelled as such. Hiding it would make the record dishonest; letting it bend a trend line would make the trend a lie.
- A trend needs **at least two readings** before it is drawn at all. A line through one point invites exactly the over-reading this project spends most of its effort preventing.
- A change smaller than 2% of the average is reported as **steady** rather than a direction, because below that it is measurement scatter.
- Claude can read the sequence, and is instructed to say which comparisons the signal quality does not support.

Local `localStorage` is the source of truth. The S3 mirror is optional and only for using more than one machine; neither store ever holds a frame of video or a second of audio.

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
  lib/conversation  shared types, sensor-to-prose renderer, the system prompt
  lib/avatar/       presets, voices, languages, portraits, the saved profile
  lib/sign/         the hand rig, the manual alphabet, spelling timing
  lib/appointments  booking rules and RFC 5545 calendar export
  lib/history       local store, merge with S3, trend building
  lib/agents/       the agent catalogue
  lib/server/       config; the only place secrets are read
  hooks/            camera, face/hand/pose tracking, vitals, voice, conversation, profile
  components/       UI, one component per agent
  app/appointments  booking and upcoming sessions
  app/history       past readings, trends, Claude's review
  app/sign          the signing studio, the lexicon, and the alphabet chart
  app/api/          converse + interpret (Claude), speak (Polly), sessions (S3), services
public/audio/       the capture worklet, which runs on the audio thread
public/portraits/   the six illustrated companion faces
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
