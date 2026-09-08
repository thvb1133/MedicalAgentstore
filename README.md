# Sanjivani Setu

**A store of measurement agents that turn an ordinary laptop camera into a clinical instrument.**

Pulse from the colour of your skin. Fatigue from your eyelids. Tremor frequency from your fingertips. The information is already in the video — this is the software that reads it.

Every agent reports a confidence score and **refuses to display a number it cannot stand behind**. That restraint is the design, not a limitation: a contactless measurement that hides its own uncertainty is worse than no measurement at all.

> **Not a medical device.** This produces wellness and research estimates. It does not diagnose, treat or rule out any condition.

---

## Agents

| Agent | What it measures | Cloud keys needed |
|---|---|---|
| **Contactless Vitals** | Heart rate, HRV (SDNN, RMSSD), breathing rate, stress index, calibrated blood pressure, breath-to-heart coherence with a guided breathing coach | None |
| **Alertness & Gaze** | PERCLOS, blink rate and duration, yawns, head nodding, gaze direction, fatigue score, cognitive load from pupil, blinks and gaze scan | None |
| **Tremor & Finger Tapping** | Tremor frequency and amplitude by FFT, tap rate, amplitude decrement, rhythm variability | None |
| **FAST Stroke Check** | Face asymmetry, arm drift, speech clarity | None |
| **Live Wellness Companion** | Everything the vitals agent measures, plus voice acoustics — pitch, jitter, shimmer, harmonics-to-noise, speech rate, pausing — during a spoken conversation, and the face and voice read together | Claude to talk back; Polly to be heard. Measurement works without either. |

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
npm test              # 485 tests against synthetic signals with known ground truth
npm run typecheck
npm run lint
npm run build
npm run verify:browser  # 131 checks in a real Chrome; needs the dev server running
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
flips the theme to confirm the page repaints and remembers. It uploads a
photograph and reads the presenter's jaw over sixty frames to prove that an
uploaded face is genuinely animated rather than merely drawn, and opens the
assistant dock on two unrelated routes to confirm it is mounted site-wide.

The later additions get the same treatment, and for the same reason: each of
them can render a plausible-looking panel while measuring nothing. So it
samples the breathing pacer across a cycle to prove the ring is actually
moving and switches its pace to confirm the period changes with it, asserts
the cognitive-load panel names its three channels and shows no score before a
baseline exists, drives the eye switch and the fingerspelling reader in access
mode, and seeds a fortnight of history to check that the journal and the drift
cards say something specific about it and can be read aloud.

`fetch-models` copies the MediaPipe WASM runtime out of `node_modules` and downloads the three `.task` models into `public/mediapipe`. If you skip it the app falls back to the Google CDN, but running it means a venue's wifi failing cannot take your demo down.

---

## How the pulse is actually extracted

Each stage exists because the one before it leaves a specific problem unsolved.

0. **The lighting gate, before anything else.** The pulse is a fraction of a percent of the reflected brightness, so in a dim room most of it is quantised away before any code sees it — and the failure is silent, because the numbers still come out. Brightness, clipping, evenness across the three regions and frame-to-frame flicker are each checked, and the interface reports the one thing most worth changing: not "too dark" but "the light is coming from one side, turn to face it". A dim but even room is allowed through with a warning rather than blocked, because refusing to measure is its own kind of dishonesty.

1. **Region selection.** MediaPipe face landmarks define a forehead box (inset from the hairline, stopping above the brows) and two cheek boxes. Pixels are screened by channel *ratios* rather than absolute brightness — absolute-value skin detectors are badly biased against darker skin, whereas the red-above-green-above-blue relationship holds across tones.

2. **Uniform resampling.** Webcam frames do not arrive at a constant rate; dropped frames and browser throttling are normal. Every spectral method downstream assumes uniform sampling, so timestamps are interpolated onto a fixed grid first. Skipping this is the single most common cause of a wrong heart rate.

3. **Pulse extraction, three ways.** [POS](https://doi.org/10.1109/TBME.2016.2609282) (Wang et al., 2017) and [CHROM](https://doi.org/10.1109/TBME.2013.2266196) (de Haan & Jeanne, 2013) project RGB onto a direction where the pulse survives and motion-induced intensity change cancels. Plain detrended green is kept as a third candidate, because POS and CHROM earn their artefact rejection by combining three channels — and therefore adding three lots of uncorrelated sensor noise. When the subject is still, green wins.

4. **Zero-phase bandpass.** A single biquad run forwards then backwards. Squaring the magnitude response cancels the phase response, so peak positions are preserved — which matters because HRV is defined by the spacing between those peaks.

5. **Harmonic correction.** A real pulse is not a sine wave; the dicrotic notch puts substantial energy at twice the heart rate. At low rates that harmonic can be taller than the fundamental, and reporting it doubles the heart rate. This is the classic rPPG failure and the most likely to be believed, since 96 BPM is perfectly plausible for someone whose pulse is 48.

6. **Method selection by prominence.** Prominence — the share of in-band power under the tallest peak — separates a pulse from noise, because a heartbeat concentrates power into one narrow line while noise spreads it. The best of the three candidates wins, chosen per measurement rather than fixed in advance.

7. **Multi-region fusion, weighted by quality.** The forehead and each cheek are extracted *separately* and then combined weighted by how much each looks like a pulse — coverage times prominence squared — rather than averaged. This matters because the three regions fail independently: a hand against one cheek, a window lighting one side, a fringe over the forehead. Averaging the pixels before extraction mixes the ruined region back in at full weight with no way to tell afterwards. Regions that disagree with the leading one are excluded from the sum rather than averaged down, because a dissenting region is not noise — it is measuring something else, and including it would drag the answer towards a rate nothing observed.

8. **Beat detection.** An adaptive-threshold detector with a refractory period derived from the spectral estimate, so the two stages reinforce each other rather than failing independently. Intervals more than 25% from the running median are discarded as missed or doubled beats before HRV is computed.

---

## Why numbers disappear

Signal quality is the **product** of eight independent terms, not their average:

| Term | Fails when |
|---|---|
| Face visibility | Face out of frame or poorly detected |
| Motion | Head moving beyond what POS can cancel |
| Frame rate | Camera below ~15 fps |
| Timing jitter | Browser throttling the render loop |
| Spectral prominence | No tight spectral line — weak or absent pulse |
| Window fill | Not enough data collected yet |
| **Cross-method agreement** | POS, CHROM and green disagree about the rate |
| **Cross-region agreement** | Forehead and cheeks disagree about the rate |
| Lighting | Too dark, blown out, one-sided or flickering |

A serious failure in any one drags the whole score down instead of being averaged away, and the engine reports **which** term is binding — so the interface says "too much movement" rather than "poor signal".

Cross-method agreement is the term that stops confident wrong answers. The three projections weight the colour channels very differently, so a noise peak that looks prominent in one rarely appears at the same frequency in the others. A test sweeps noise across five orders of magnitude and asserts the engine either reports the right rate or reports nothing.

**Cross-region agreement is the stronger of the two**, and supersedes it when both are available. Three methods agreeing on one patch of skin can share an artefact, because they are reading the same pixels; the forehead and both cheeks arriving at the same rate cannot, unless whatever caused it moved the whole face — which the motion term already catches. The interface shows the breakdown rather than folding it into a score: three rows, each with the rate that region found and how much weight it carried.

Lighting enters as a ceiling rather than a full factor. It is already represented indirectly through the spectral and agreement terms, so multiplying the raw score in as well would count it twice. What it adds is that a reading taken in the dark cannot claim "excellent" on the strength of a lucky peak.

### Beat spacing, and what it is not

Average heart rate hides the thing most worth noticing: a run of intervals going 800, 810, 795, 640, 980, 805 averages out to something unremarkable, and the irregularity is the whole of the finding. So the beat-to-beat intervals are scored for scatter relative to the rate, for the share of successive intervals differing by more than 50 ms, and for intervals far from the local median.

The output is deliberately blunt — even, normal variation, or uneven — and it is judged only on readings already good enough to have found their beats reliably. Atrial fibrillation is diagnosed on an ECG, and the studies that put photoplethysmographic detection anywhere near useful used a wrist sensor against the skin, minutes of data, and a trained classifier. A webcam has a fraction of that signal quality, and every artefact it suffers looks exactly like an ectopic beat. "Uneven" says that most likely you moved, that it is worth mentioning to a doctor who can put a real lead on you, and that this is not a diagnosis. It never names a rhythm.

### Saying where this works less well

Melanin sits above the vessels and absorbs strongly at exactly the wavelengths the green-channel contrast lives at, so on darker skin less light reaches the blood and less of what returns survives the trip out. The pulse is still there; there is less of it above the noise floor. This is documented, and not something anybody fixes in a weekend.

What can be done is refusing to hide it. Skin tone is estimated per reading as an [Individual Typology Angle](https://doi.org/10.1111/j.1600-0846.2006.00212.x) over CIELAB, collapsed to three bands, and used to add a sentence saying the confidence will run lower and why. Two constraints are load-bearing: the estimate **never** changes a reported value — it is not a correction factor, because a correction fitted to nobody's data would be an invented number dressed as fairness — and it is **never stored**, never attached to a report and never sent anywhere. It is computed from pixels already in memory, used to pick a sentence, and discarded.

---

## Signals made by combining the others

Three measures here are not read off the video directly. They come from putting two or three of the existing streams beside each other, which is worth doing when the combination is better evidence than any single channel — and worth being careful about, because a derived number inherits every weakness of what it was derived from without looking like it does.

### Cognitive load, from the eyes

Three ocular signs move together when somebody is working hard mentally, and human-factors research has used them this way since the 1960s: the pupil dilates a few percent ([Kahneman & Beatty, 1966](https://doi.org/10.1126/science.154.3756.1583)), spontaneous blinking is suppressed while attention is engaged, and the gaze scan tightens onto fewer places.

The pupil is the hard one, and the face mesh does not provide it. MediaPipe's 478 points track the *iris* boundary, and the iris does not change size — the pupil inside it does. So the landmarks only say where to look and the size comes out of the pixels: the fraction of the iris disc that is dark, which is scale-free and therefore does not need to know how far away the person is sitting. On a dark brown iris the boundary is genuinely not there to be found, and at ordinary webcam framing an iris is about fifteen pixels across, so the contrast between pupil and iris is returned alongside the ratio and the channel is dropped when it is too flat to separate.

Everything is relative to a baseline captured from the same person, in the same light, ten seconds earlier. There is no absolute pupil size that means "working hard", and the light reflex is an order of magnitude larger than the effort response — so a change in face brightness past 12% suspends the pupil channel outright rather than reading the room's lighting as concentration. A channel whose baseline is not trustworthy is dropped **and said to be dropped**: the confidence figure is the summed weight of the channels that survived, so a score resting on gaze alone announces itself as a quarter-strength score instead of looking identical to one with all three.

This is an interface and attention measure. It is not a measure of intelligence, honesty, emotion, or fitness to do anything, and the panel says so.

### Expression and voice, read together

There is a strong claim and a weak claim available from a face plus a microphone, and only the weak one is made. The strong claim — that this reveals what somebody feels — is not supported: the largest review of the evidence ([Barrett et al., 2019](https://doi.org/10.1177/1529100619832930)) found people do not reliably move their faces the same way when experiencing the same emotion, and adding a microphone does not repair that.

The weak claim is still worth making. Two independent channels agreeing about something observable is much better evidence than one channel alone. So what comes out is a description of *signals* — how animated the face and the voice are, and whether they tend pleasant or unpleasant — with an explicit agreement figure between them. A tense jaw with a relaxed voice is a genuinely ambiguous observation and is reported as one rather than averaged into a confident middle. Nothing here is labelled a mood.

### Breath-to-heart coherence, and the coach

Heart rate is not steady even at rest: it rises on the in-breath and falls on the out-breath, mediated by the vagus nerve. Breathing slowly and evenly at around six a minute pulls the whole cardiovascular system into step and the beat-to-beat interval traces a clean oscillation near 0.1 Hz. Coherence is how concentrated the variability spectrum is around that single peak, in the sense the biofeedback literature uses it ([Lehrer & Gevirtz, 2014](https://doi.org/10.3389/fpsyg.2014.00756)).

One thing is added to the usual definition. Because the breath itself is visible in the head movement the camera already tracks, the heart's slow rhythm can be checked against the *measured* breathing rate rather than assumed to be following it — which separates "your heart rate is oscillating tidily" from "your heart is following your breath", and only the second is what a breathing exercise trains.

The coach is the closed loop: a ring that expands and holds and contracts on a selectable pace, with the coherence figure moving live beside it. It is not a measure of health, of emotional state, or of how well somebody is meditating. It shows you your own physiology responding to how you breathe, which is interesting to watch and is the whole of the claim.

---

## The companion agent, and what it replaces

The companion mirrors the shape of a hackathon project that assembled seven commercial services into a conversational wellness avatar. Same experience, different foundation:

| Their component | Here | Why |
|---|---|---|
| Shen.AI SDK — camera vitals | Our own rPPG engine | Already built, and open. Shen's own clinical report puts camera blood pressure at 10.18 mmHg mean error with a 0.38 correlation, so the cuff calibration is not optional there either. |
| Thymia — voice biomarkers | Our own acoustic engine | The underlying measures are standard phonetics, not a trade secret. What a vendor adds is a trained mapping onto clinical labels, which is exactly the part we decline to make. |
| Anam — photoreal video avatar | A photoreal presenter, rendered here | A generated face, warped on a canvas from a landmark mesh found at build time, with lip shapes derived from the reply text and their amplitude from the audio. No streaming video service, no per-minute cost, and it works with the network off. The abstract presence is still there for anyone who would rather not be talked to by a face. |
| Agora ConvoAI — orchestration | An in-browser turn loop | Turn-taking is a silence timer and a state machine. Doing it locally removes a paid dependency and forces the two hard parts to be explicit: deciding when someone has finished speaking, and stopping the assistant from hearing itself. |
| OpenAI GPT | **Claude** | |
| ElevenLabs TTS | **Amazon Polly** | Neural voices |
| Deepgram ASR | **Web Speech API** | Free and built in. The trade-off is real: absent in Firefox, and it needs the network. Typing is a first-class alternative, not a fallback. |

Net effect: seven paid providers reduced to two, and the two that remain are ones you already hold keys for.

---

## Choosing a companion

Six companions, each pairing a manner of speaking with a face.

| | Manner | Default voice |
|---|---|---|
| **Maya** | Warm and steady | Amy, British English |
| **Daniel** | Calm and precise; names the measurement before interpreting it | Arthur, British English |
| **Grace** | Gentle and unhurried, built for older users | Ruth, slow and clear |
| **Pip** | Simple and encouraging, built for children | Ivy, a child's voice |
| **Sofia** | Friendly and direct; follows you between languages | Emma, British English |
| **Nova** | Brisk, minimal small talk | Joanna, American English |

The five presenters are generated portraits of people who do not exist, and they are spread across the world rather than clustered in one part of it. That is not decoration. Somebody who has never been offered a default that looks like them notices, and a tool that measures your body is a poor place to keep that record going.

Pip is drawn rather than photographed, and does not talk. Pip is the companion offered to children, and a photoreal synthetic child is not something this puts on screen.

### How the face moves

Each portrait has a 478-point face mesh found once at build time by `scripts/build-face-rigs.mjs`, which runs MediaPipe's face landmarker in headless Chrome and commits the result to `src/lib/avatar/rigs.json`. Nothing is downloaded at runtime and the same picture always produces the same rig.

At playback, two lattices over the mouth and one over each eye are displaced and redrawn triangle by triangle. Both edges of every patch are pinned to the untouched photograph, so a warp cannot tear a seam across the face. The shapes come from the reply text — graphemes mapped to visemes, fitted to the measured length of the audio — and their **amplitude** from a Web Audio analyser on the speech itself. Text alone gives a mouth that keeps moving through a pause; loudness alone gives a jaw flapping on a fixed shape. Text sets what the mouth is doing and loudness sets how much, which is also why a language whose script has no letter-to-mouth mapping still animates, on loudness alone.

Blinking and a slow drift of the head run underneath, on periods that share no common multiple so the idle never reads as a loop.

### Your own picture

You can **upload a photograph** and it becomes a presenter the same way. The picture is cropped, scaled and re-encoded in the browser and kept in `localStorage`; it never leaves the device, and the re-encode drops the EXIF block, which on a phone photograph carries the GPS coordinates where it was taken. The mesh is found on the device too, once, cached against a hash of the picture. A photograph the mesh cannot read — badly lit, in profile, sunglasses — is not an error: it is shown still, with a note saying why.

**The face will appear to speak, and that is worth being plain about.** Driving a mouth from audio is the deepfake technique and differs only in intent. On something that says "your blood pressure looks raised", a face that appears to say it is saying it in that person's name. The upload control says so at the point of upload rather than in a policy page, every presenter carries an "AI avatar" badge that cannot be turned off, and the built-in faces belong to nobody precisely so that the default carries none of this weight.

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
- **Non-manual markers, as grammar.** Raised brows make a yes/no question, drawn-together brows make a wh-question, a head shake negates. These are held across the whole clause rather than pulsed on one sign, because that is their scope. A signed question with a blank face is not a neutral question — it is a statement. Two browser checks measure the brow height on a question against a statement, because the first version of this drew the hairline low enough that a raised brow landed on the hair, dark on dark: the marking was applied, every unit test passed, and the most important non-manual in the language was invisible. Nothing short of reading the pixels catches that. Raised brows also *arch* rather than simply moving up, because a couple of pixels of vertical shift reads as the same flat line in a slightly different place — the wh-marker was legible when the yes/no one was not precisely because angling changes the shape, and shape is what the eye picks up.
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

### Spelling to the camera

The signing above is output. This is the other direction, and it exists because of one observation: the health side of this application is already running landmark detection on every frame, so somebody signing to it is already being tracked. Reading their hand costs one more pass over twenty-one points, and their pulse comes out of the same frames at the same time. The accessibility path and the sensing path share one camera rather than competing for a second one.

Handshapes are matched on ratios measured within the hand — a finger's straightness against its own length, gaps against the width of the palm — so the reading does not change with how close the hand is or how it is turned. A letter is committed after being held steadily rather than on the first frame that matches, because a hand travelling between two letters passes through several others on the way.

What it refuses is as important as what it reads. J and Z are movements rather than shapes and are not guessed from a still pose. M, N, S and T differ mainly in where the thumb sits inside a closed fist, which one camera cannot see, so they are declined rather than picked between. And this is fingerspelling, not sign language: the manual alphabet is a small borrowed corner of ASL used for names and unfamiliar words, and reading letters is not understanding signing.

### Eyes as an input device

For somebody who cannot speak, sign, or use their hands, the eye tracking built for the drowsiness and neurological checks is — with nothing added to it — a working switch interface. Same landmarks, two very different uses.

Two ways in, because the right one depends on what the person can control. **Gaze**: look left or right to move the highlight, hold still on a choice to take it. Fast, but it needs reliable horizontal eye control. **Scanning**: the highlight steps through the choices by itself and one deliberate action takes whichever is lit. That is the standard assistive-technology fallback and it needs exactly one reliable movement — here, holding the eyes shut.

The thing that makes a blink switch usable at all is telling a deliberate closure from an ordinary one. Spontaneous blinks run 100 to 300 ms; a closure held past half a second is almost never accidental, and everything shorter is ignored rather than debated. After a choice is taken the switch stays muted until the eyes are confirmed open again, because otherwise one long closure walks the whole way down the menu.

---

## The assistant in the corner

Every page here measures one thing and explains that one thing. The questions people actually have are rarely scoped that neatly — *is 118 over 76 alright*, *why does it keep saying low confidence*, *what is HRV* — and making somebody finish a reading before they can ask is the wrong shape. So there is an assistant in the bottom-left corner of every route, mounted in the root layout so its conversation survives navigation rather than being rebuilt on each click.

Bottom **left**, not right. Support widgets live on the right, and this is not one; more practically the right-hand side is where these pages put their own controls, and a floating panel over them would cover the thing being asked about.

It takes typing or speech and answers in voice and text. Where it differs from the measurement agents is language: they pin one, because somebody mid-reading who has chosen Hindi and says one English word should not have the conversation switch under them. The dock does the opposite and **replies in whatever language the question arrived in**, which is the only way to cover languages the picker does not list.

It has no access to the sensors, deliberately. A panel that can be opened from the history page while a measurement runs elsewhere should not narrate numbers it cannot see. It answers questions; the agents interpret readings.

---

## Morning and night

Both themes are real palettes rather than one inverted. Shadow does the separating work in a light interface where borders do it in a dark one, and the accents are darkened for the light theme because the saffron that reads as bright against near-black falls below 4.5:1 against white.

Morning is the default. A dark interface is genuinely harder for a good many people to read — particularly older eyes and anyone with astigmatism, for whom light text on dark smears — and these pages get used in daylight next to a window. Night exists because the camera preview and the pulse trace do carry more weight against a dark field, and because plenty of people simply prefer it.

The default does not follow the operating system. That is a product decision rather than a technical one: light is the face of the thing, it is what the screenshots show, and a first-time visitor on a machine set to dark should see the interface as it was designed. One click changes it, and the choice is remembered from then on.

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

### Your own baseline, not a population's

"Normal resting heart rate is 60 to 100" is true of a population and close to meaningless for an individual. Somebody whose resting rate has been 52 for years is not reassured by being told they are normal, and somebody at 88 who has always been 64 is not warned by it. Both facts are only visible against their own earlier readings, which is the whole reason a history exists here.

So each metric gets a baseline built from that person's own past sessions, and the latest reading is described by how far it sits from it in units of their ordinary variation. Median and median-absolute-deviation rather than mean and standard deviation, because a handful of bad sessions should not be able to move the centre or inflate the spread. It needs at least five usable readings spread over at least three separate days — one long sitting is not a baseline.

The floor is the other half of the honesty. A camera resolves heart rate to a few beats a minute at best, so somebody whose readings happen to cluster tightly must not have everything afterwards called unusual because their apparent spread was narrower than the instrument's own error. Each metric carries a resolution below which differences are attributed to the method rather than to the person, and blood pressure's is deliberately set at 10 mmHg, which is roughly what the published clinical evaluation of camera blood pressure achieves. Where a spread came from the floor rather than from the person, the card says so.

### The week, written out

One scan is an anecdote, and nobody is going to read a fortnight of tables. So the history page writes the paragraph: how often you measured, what moved against your baseline, and how many sessions were too unreliable to count. It can be read aloud, through Polly where it is configured and the browser's own speech synthesis otherwise, which makes it usable without reading the screen.

It is composed in `src/lib/journal.ts` rather than by Claude, on purpose. A summary of somebody's health measurements is exactly the wrong place for a model to improvise, because the failure mode is a fluent sentence containing a number nobody measured. Claude is offered the finished text to read and to answer questions about; it does not get to write it.

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
  lib/vitals/       engine, bloodPressure, coherence
  lib/alertness/    engine                          — PERCLOS, blinks, gaze
  lib/motor/        engine                          — tremor, tapping
  lib/fast/         engine                          — face, arms, speech
  lib/voice/        engine                          — F0, jitter, shimmer, HNR
  lib/cognition/    load                            — pupil, blinks, gaze scan
  lib/affect/       multimodal                      — face and voice, together
  lib/access/       switch                          — gaze and blink as input
  lib/baseline      each person against themselves
  lib/journal       the week, written out
  lib/vision/       mediapipe loading, face regions, pupil
  lib/conversation  shared types, sensor-to-prose renderer, the system prompt
  lib/avatar/       presets, voices, languages, the saved profile
  lib/avatar/       warp, faceRig, visemes, life, presenter  — the talking face
  lib/sign/         the hand rig, the manual alphabet, spelling timing, reading it back
  lib/appointments  booking rules and RFC 5545 calendar export
  lib/history       local store, merge with S3, trend building
  lib/agents/       the agent catalogue
  lib/server/       config; the only place secrets are read
  hooks/            camera, face/hand/pose tracking, vitals, voice, conversation, profile
  components/assistant  the dock that sits on every page
  components/       UI, one component per agent
  app/appointments  booking and upcoming sessions
  app/history       past readings, trends, Claude's review
  app/sign          the signing studio, the lexicon, and the alphabet chart
  app/api/          converse + interpret (Claude), speak (Polly), sessions (S3), services
public/audio/       the capture worklet, which runs on the audio thread
public/portraits/   five generated presenter photographs, and Pip's drawing
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
