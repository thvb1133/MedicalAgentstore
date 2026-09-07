# Shortlist and build order

The brainstorm converged on the same ranking more than once. This is the deduplicated version, plus
the dependency order to build it in and a case study of a team that already did something close.

## The face-scan stack, in dependency order

Each layer reuses the one above it, so this is the highest-output path if you want a face-camera
health project. Build downward and stop wherever you run out of time — every prefix is a complete
demo.

| # | Layer | Depends on | Difficulty | Notes |
| --- | --- | --- | --- | --- |
| 1 | Heart rate via rPPG | — | Low | Well-established, open-source libraries exist, works reliably. The foundation signal. |
| 2 | Heart rate variability → stress score | 1 | Low | Natural next layer once the pulse signal is clean; use established HRV metrics rather than inventing one. |
| 3 | Breathing rate | 1 | Low | Same camera, different signal — subtle motion instead of colour change. |
| 4 | Fatigue / drowsiness detection | — | Low | Blink rate, eye-closure duration, head nodding. Already used in real driver-safety systems. Clearest demo of the set: the camera watches you get sleepy and alerts you. |
| 5 | Attention / focus tracking | 4 | Low | Gaze direction and look-away frequency. Useful for students and remote workers, and an easy non-medical framing. |
| 6 | Facial emotion recognition | — | Low | Real-time happy/sad/angry/neutral. Easy to demo, weakest scientific footing of the group — don't lean on it for a clinical story. |
| 7 | Pain level estimation from facial action units | 6 | Medium | Genuine clinical research area, used for patients who can't verbally report pain: infants, dementia patients, ICU. Meaningful use case. |
| 8 | Depression-risk screening indicators | 1, 6, audio | Medium | Facial expressiveness plus speech patterns. DAIC-WOZ pairs facial video with clinical depression scores. Research-grade screening only — see the framing requirements below. |
| 9 | Early cognitive-decline research indicators | 8, longitudinal | High | Speech pauses plus facial micro-expression change across repeated sessions. Genuinely active Alzheimer's and Parkinson's research. Best as a stretch/research demo, not a product. |

**On items 8 and 9:** both need a visible "not medical advice" disclaimer and crisis-resource
information in the UI, framed as screening or research and never as diagnosis. That isn't optional
polish — see [07-claims-and-safety.md](07-claims-and-safety.md).

## Beyond the face-scan stack

Ranked by buildability, with pointers to the full entries:

1. **Webcam microscopy** — [01, item 8](01-camera-as-instrument.md). $15 of optics, public malaria
   datasets, highest impact per dollar in the catalog.
2. **Assay strip reader** — [01, item 7](01-camera-as-instrument.md). Colour calibration is the whole
   problem and solving it is the contribution.
3. **Colony counting / zone of inhibition** — [01, item 12](01-camera-as-instrument.md). Immediately
   useful to real researchers; least likely to fail technically.
4. **Skin lesion / mole classification** — take a photo of a mole, flag whether it looks concerning
   enough to see a dermatologist. Real, published, open datasets (ISIC). Same caution as depression
   screening: screening tool only, never a diagnosis. Note that the FDA-cleared products in this space
   use a spectroscopy probe pressed against the lesion, not a photo.
5. **Genomic variant interpretation** — [04, item 1](04-genomics-and-public-health.md). No hardware,
   free databases, enormous emotional weight.
6. **Outbreak early warning** — [04, item 2](04-genomics-and-public-health.md). Best closing slide of
   any idea here.
7. **Photographed X-ray interpretation** — [01, item 6](01-camera-as-instrument.md). CheXphoto makes
   this unusually well-supported for a radiology project.
8. **Retinal / diabetic retinopathy screening** — [02, item 7](02-clinical-ai-and-omics.md). The most
   clinically validated AI-health application that exists, but it needs a retina photo, so it's easier
   to *reference* than to build without the lens.

## Case study: Nura (Claude Builder Club @ Imperial, March 2026)

Also titled "Neura – Track 2". An AI mental-health assistant giving you a real-time video call with an
AI avatar therapist. While you talk, it captures voice and video biomarkers live and feeds them to an
LLM that observes the conversation — so the model isn't just chatting, it's reading vocal and facial
signals in the background at the same time.

**Their stack.** Agora for real-time conversational voice infrastructure; Anam.AI for the video
avatar; Thymia.ai for voice biometrics; Shen.ai for video biometrics (an rPPG-style vitals company);
ElevenLabs for text-to-speech; Deepgram for speech-to-text; GPT-5.4 as the LLM; Claude Code to build
it.

**Three things worth copying.**

- They used existing clinically-oriented biometric APIs rather than building signal processing from
  scratch. If a reliable API exists, wiring the right tools together well is a legitimate strategy —
  you do not have to derive rPPG from raw pixels to have a real project.
- Their reported challenges were exactly the ones this catalog warns about: unreliable camera signal
  quality, dependence on good lighting and a quiet room, and latency they had to tune. Budget time for
  those, not for the model.
- They explicitly worked on ethics and safeguarding for vulnerable users, and they're pursuing NHS
  adoption rather than stopping at a demo. Judges reward that kind of maturity.
