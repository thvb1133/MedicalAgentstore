# Picking an idea: what a camera can actually sense

Almost every failed camera-based health demo fails the same way: it claims a measurement that
requires a sensing modality the camera does not have. So before anything else, apply this filter.

## What an ordinary camera genuinely gives you

- **High frame rate.** 60 fps resolves saccade latencies, tremor frequency, blink dynamics, and
  pulse waveform timing.
- **Sub-pixel colour sensitivity.** Small, spatially-averaged colour shifts are measurable well
  below what a human eye notices — this is what makes rPPG, jaundice screening, anaemia pallor
  estimation, and colorimetric strip reading possible at all.
- **Spatial precision.** Landmark geometry, asymmetry, displacement, and diameter ratios are
  measurable to a fraction of a pixel with a decent tracker.
- **Digitisation of anything already imaged.** A camera cannot emit X-rays, but it can photograph
  a printed X-ray film on a lightbox and interpret it. This is how radiology legitimately enters a
  camera project.
- **A cheap optical bench.** Add a $15 macro lens, an inverted webcam lens, or a diffraction
  grating and the camera becomes a microscope or a spectrometer.

## What it does not give you

- **Retinal interiors.** A fundus photo needs a fundus lens and controlled illumination. A laptop
  webcam images the eye's exterior and its light reflections — nothing behind the pupil.
- **Blood chemistry.** Glucose, electrolytes, troponin, hormone levels. There is no optical path
  from a face video to a molar concentration.
- **Deep tissue.** Anything below a few hundred microns of skin. No tumour detection, no organ
  imaging, no internal bleeding.

The rule of thumb: **a face is a good window into cardiovascular state, because blood visibly
flows through it. It is not a window into the rest of the body.**

## Scoring an idea before you commit

Score each candidate 1–5 on all six axes. Anything that scores 1 on axis 1 or 2 is dead regardless
of the rest.

| Axis | Question |
| --- | --- |
| 1. Modality match | Can the sensor I have physically observe the quantity I claim? |
| 2. Ground truth | Is there a public dataset or a cheap reference device to validate against? |
| 3. Signal-to-noise | Does the effect survive real lighting, real motion, real users? |
| 4. Baseline first | Is there a classical (non-deep-learning) baseline I can ship in hours? |
| 5. Failure cost | If it is wrong, does someone get hurt, and does high sensitivity or high precision matter more? |
| 6. Claim legality | Can I describe the output without making an unapproved medical-device claim? |

## Two design rules that decide whether it works

**Colour constancy is the whole game for anything colorimetric.** Jaundice, anaemia, dipsticks,
lateral flow tests, and spectrometry all collapse under arbitrary white balance. Make a printed
colour-reference card part of the capture protocol, not an afterthought. Design the protocol
first, then the model.

**Optimise the metric the deployment cares about, not accuracy.** A stroke screener should
maximise sensitivity, because a missed stroke costs vastly more than a false alarm. A seizure or
atrial-fibrillation alarm should maximise precision at a fixed high recall, because an alarm that
cries wolf twice a day gets switched off and then saves nobody. Accuracy averages these two
opposite needs into a number that tells you nothing.

## Two honesty requirements

**Fairness is a technical requirement, not a values statement.** Melanin absorbs the green-channel
signal rPPG depends on, so a pipeline tuned on light skin degrades measurably on dark skin. The
same applies to pupillometry under visible light, where dark irises give poor pupil–iris contrast.
Stratify your evaluation by skin tone and iris colour explicitly, or you will ship a product that
works for some users and quietly fails others.

**A calibrated uncertainty estimate beats a better point estimate.** A strong classical baseline
that reports "72 bpm, low confidence, excessive motion detected" is more useful and more credible
than a flashy model with no error bars. Build the confidence score in from the start; retrofitting
it is painful.
