# Claims and safety — what you may say about your output

The difference between a credible health project and a liability is almost never the model. It's the
sentence describing what the output means. Regulatory details below come from the source brainstorm
and are unverified here; verify before relying on any of them.

## What is genuinely cleared or authorised

Remote photoplethysmography — the camera picking up tiny colour shifts in facial skin as blood pulses
through it — is real and has cleared regulators:

| Product | Status | Outputs |
| --- | --- | --- |
| FaceHeart Vitals | Two US FDA 510(k) clearances: heart rate (K223622), respiratory rate (K243966), from a ~50-second facial scan | Also reports blood pressure, SpO2, HRV, and a stress index — **those specific outputs are not cleared** |
| PanopticAI Vital Signs | FDA-cleared May 2026, phone/tablet camera | Pulse rate, respiratory rate |
| Lifelight (UK) | Class II certification 2025 | Cuffless blood pressure from face video |
| Saudi SFDA authorisation | June 2026, first regulator anywhere to authorise an app measuring these from face video | Heart rate, SpO2, blood pressure — blood pressure requires a one-time calibration against a real cuff |

So: **heart rate, breathing rate, stress, and — with calibration — blood pressure from a face video
are solved problems with shipping products.** Note also that a cleared product often has uncleared
features shipping alongside the cleared ones, which is a useful pattern to understand and a bad one
to imitate carelessly.

## What is not detectable from a face photo

Cancer, eye disease, and most other conditions are detected from the specific tissue involved with
specific imaging:

- **Skin cancer.** FDA-cleared tools like DermaSensor use a spectroscopy probe pressed against the
  lesion — not a photograph.
- **Diabetic retinopathy.** Screened with a retinal camera photographing the back of the eye, not
  your face.
- **The one real "face reveals disease" product** is Face2Gene, which flags rare genetic syndromes
  from facial features. It works because those syndromes actually change facial bone and soft-tissue
  structure — a narrow, mechanistically justified use case, not a general principle.
- **Research published in 2026** does show AI picking up hypertension and diabetes signals from facial
  video. That is research, not an approved product, and the distinction matters when you describe it.

**An app claiming to detect cancer from a selfie would be both scientifically false and, in most
countries, an illegal unapproved medical device claim.** This is the line. Stay on the correct side
of it.

## Language patterns that keep you safe and honest

Replace diagnostic verbs with observational ones, and always pair an output with an action.

| Don't say | Say |
| --- | --- |
| "You have atrial fibrillation" | "This recording shows an irregular rhythm. Please have it checked by a clinician." |
| "Detects stroke" | "Screening indicator. If this appears, seek emergency care now." |
| "Depression score: 14" | "Research-grade indicators from this session. This is not a diagnosis. If you're struggling, here are ways to get help." |
| "Diagnoses malaria" | "Parasite candidates flagged for confirmation by microscopy." |
| "Hb = 11.2 g/dL" | "Estimated haemoglobin, screening range only, ±(your measured error). Confirm with a blood test." |

## Requirements to build in from the start

1. **A visible, non-dismissable disclaimer** on any screen showing a health-relevant output: not a
   diagnosis, not medical advice.
2. **A confidence score or explicit refusal.** If lighting, motion, or focus is bad, say "cannot
   measure" instead of returning a number. A refusal is a feature.
3. **An escalation path to a human.** For mental-health features this means crisis resources shown
   before the user has to look for them. For urgent physical findings it means the emergency
   instruction is the most prominent element on screen.
4. **Stratified evaluation reported in the UI or the README.** Skin tone for rPPG and pallor-based
   estimates, iris colour for pupillometry, ancestry for genomic interpretation. State where accuracy
   drops instead of quoting one average.
5. **Data minimisation by default.** On-device feature extraction where possible, no raw audio or
   video leaving the device unless the user explicitly opts in per session, and a clear deletion path.
   For longitudinal phenotyping this isn't a nice-to-have — it *is* the product.
6. **Never put patient data in an append-only store.** Immutability collides directly with the right
   to erasure. Ledgers are for hashes, model versions, and provenance; never for payloads.

## Why saying the limitation out loud is the winning move

Every strong idea in this catalog has a known weakness: colour constancy, database ancestry bias,
false-alarm rates, an unvalidated scoring calibration, a correlation that isn't a validated model.
Naming the weakness and showing the engineering you did to bound it reads as competence. Hiding it
reads as either ignorance or dishonesty, and it's the first thing an informed question will find.
