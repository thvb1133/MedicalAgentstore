# The camera as instrument — 15 ideas

Three distinct roles for the same hardware: a contact-free physiological sensor reading pulse,
motion, gaze, and pupil size off the body; a capture device for things that already encode
diagnostic information; and, with under $30 of optics, a genuine lab instrument.

---

## Neurology — camera as motion and oculomotor sensor

### 1. Parkinson's motor assessment from hand video

**What it is.** Objective scoring of the motor tasks the MDS-UPDRS exam already grades by eye:
finger-tapping, hand opening-closing, pronation-supination.

**Why it works.** A hand-landmark tracker gives you the fingertip trajectory, and from that you get
amplitude decrement, tapping frequency, and rhythm irregularity as numbers rather than a
clinician's 0–4 impression. Tremor is easier still: run an FFT on the trajectory and rest tremor
shows a clean 4–6 Hz peak that essential tremor does not.

**What you build.** MediaPipe Hands → trajectory extraction → per-task feature set (amplitude
slope over the trial, inter-tap interval variance, dominant frequency and its power) → a scoring
model mapped onto the clinical scale.

**What will bite you.** Not the signal processing — that part is tractable. It's the scoring
calibration against clinician ratings, which needs paired video and expert scores you may not
have. Consider reporting raw interpretable features and a within-subject change over time instead
of predicting a clinical score you can't validate.

### 2. Oculomotor concussion and cognitive screening

**What it is.** Saccade latency, smooth-pursuit gain, and antisaccade error rate — three
established neurological biomarkers — measured with a webcam.

**Why it works.** Show a target that jumps; measure the delay before the eyes follow. All three
metrics are behavioural and geometric, not deep-learning-hard.

**What you build.** WebGazer.js for a quick start, or a landmark-based iris tracker for better
precision. A stimulus presentation loop with hardware-honest timestamps, then latency and gain
extraction per trial.

**What will bite you.** Latencies live in the 200 ms range, so you need 60 fps and rigorous
handling of display-to-capture latency. The engineering challenge is timestamp alignment between
what the screen showed and what the camera saw — not the model.

### 3. Pupillometry via screen-controlled light stimulus

**What it is.** The pupillary light reflex — constriction latency, constriction amplitude,
redilation velocity — which is a real marker in traumatic brain injury and autonomic assessment.

**Why it works.** Flash the screen white and track pupil diameter frame by frame, converting
pixels to millimetres by calibrating against the iris diameter, which is roughly constant across
adults.

**What you build.** Screen-flash stimulus with known onset time, iris and pupil segmentation per
frame, diameter time series, then the three reflex parameters.

**What will bite you.** The technique wants near-infrared illumination. Under visible light,
pupil–iris contrast on dark irises is poor and accuracy degrades. Report that stratified by iris
colour rather than hiding it in an average.

### 4. Stroke FAST screening from face and arm video

**What it is.** Three of the four FAST criteria in one capture: facial droop as landmark asymmetry,
arm drift as pose tracking across a 10-second hold, slurred speech from the audio track.

**Why it works.** Each of the three is a well-posed measurement problem, and the value isn't
diagnostic accuracy — it's triage speed where no neurological exam is available within a useful
time window.

**What you build.** Face landmarks → left/right asymmetry metrics; pose tracking → vertical drift
of each wrist over the hold; speech → intelligibility and prosody features. Combine into a single
"seek emergency care now" decision.

**What will bite you.** The framing. This must say "seek emergency care now" and never state or
imply a diagnosis. Tune for high sensitivity — a missed stroke costs far more than a false alarm —
and make the escalation path (call emergency services) the most prominent element in the UI.

### 5. Infant general movement assessment for cerebral palsy risk

**What it is.** Automating features of Prechtl's General Movement Assessment, which predicts
cerebral palsy from spontaneous infant movement months before clinical diagnosis but requires
scarce trained assessors.

**Why it works.** The assessment is a judgement about movement complexity and variability, which is
exactly what pose trajectories over crib video encode.

**What you build.** An infant-specific pose model (adult pose models fail on infant body
proportions), then movement-complexity features — trajectory entropy, limb-coordination measures,
variability across a recording window.

**What will bite you.** Data access and consent for infant video, and the fact that adult-pretrained
models will quietly give you plausible-looking garbage. High clinical impact, active research area,
genuinely underserved.

---

## Radiology and diagnostics — camera as capture device

### 6. Photographed X-ray interpretation for teleradiology

**What it is.** Chest X-ray interpretation from a phone or laptop photo of a printed film on a
lightbox.

**Why it works.** In much of the world the film is the artefact and there is no radiologist within
a hundred miles, so a photo of the film is the actual data pathway — not a degraded version of
one. CheXphoto exists for exactly this: CheXpert X-rays photographed and synthetically degraded
with glare, moiré, rotation, and screen artefacts.

**What you build.** A chest X-ray classifier trained or fine-tuned with photographic-distortion
augmentation, plus a capture-quality gate that rejects unusable photos before inference.

**What will bite you.** Robustness to glare and moiré is the entire problem. Train for the
distortions and you have something deployable; train on clean films and you have a benchmark
score.

### 7. Rapid diagnostic test and assay strip reader

**What it is.** Quantitative reading of lateral flow tests, urinalysis dipsticks, and pH strips.

**Why it works.** These encode results as colour intensity, which humans read badly and
inconsistently. A camera plus a printed colour-reference card gives quantitative, timestamped,
geotagged results — which matters enormously for disease surveillance, not just for the individual
result.

**What you build.** Card and strip detection, homography rectification, white balance against the
reference patches, per-pad colour extraction, then a calibration curve to concentration.

**What will bite you.** Colorimetric calibration under arbitrary lighting is the whole technical
problem. Solving it well *is* the contribution — don't treat it as preprocessing.

### 8. Webcam microscopy for blood smears and water quality

**What it is.** A microscope. Invert a cheap webcam lens or clip on a $15 macro lens and you get
roughly 100–200x magnification — enough for malaria parasite detection in stained thick smears,
white cell differentials, or identifying waterborne microorganisms.

**Why it works.** Automated malaria microscopy is a genuine, documented global-health need, and the
public data exists: the NIH malaria cell images and the BBBC image collections.

**What you build.** A stable stage (a stack of books works for a prototype), focus-quality
scoring, cell/parasite detection, and a per-field count aggregated to a parasitaemia estimate.

**What will bite you.** Focus and illumination consistency across fields, and staining variability
between labs. This is the highest impact-per-dollar item in the catalog.

---

## Ophthalmic and dermatologic screening — real, but scope carefully

### 9. Neonatal jaundice screening from sclera and skin photos

**What it is.** Bilirubin estimation from the measurable yellowing it produces in the sclera and
skin.

**Why it works.** It's published and validated work (the BiliCam and BiliScreen line of research
out of the University of Washington). Neonatal jaundice is common, dangerous when missed, and
currently needs either a blood draw or a dedicated transcutaneous device.

**What you build.** Sclera segmentation, colour extraction in a perceptually meaningful space,
calibration against a reference card in frame, regression to a bilirubin estimate with a
referral threshold.

**What will bite you.** The reference card is mandatory, which is a design constraint rather than a
blocker. Newborn capture is also genuinely hard: they move, and they don't hold still on request.

### 10. Non-invasive anaemia screening from conjunctiva and nail beds

**What it is.** Haemoglobin estimation from pallor in the lower-eyelid conjunctiva, the tongue, and
the nail beds.

**Why it works.** The correlation is real and camera-based haemoglobin estimation has published
accuracy. Anaemia affects roughly a quarter of the world's population and screening currently needs
a blood test.

**What you build.** Guided capture of the three sites, reference-card white balance, colour and
texture features per site, regression to haemoglobin with a screening cutoff.

**What will bite you.** Colour constancy is everything, again. Make the reference card part of the
protocol.

### 11. Strabismus and amblyopia photoscreening in children

**What it is.** The Hirschberg test — locating the corneal light reflection relative to the pupil
centre to detect eye misalignment — plus red-reflex asymmetry between the two eyes, which flags
amblyopia risk and, rarely, retinoblastoma.

**Why it works.** Both are camera-with-flash measurements and both are geometric rather than
deep-learning-hard. Childhood vision screening coverage is poor almost everywhere.

**What you build.** Flash capture, pupil and corneal-reflection localisation, per-eye offset
vectors, and an inter-eye red-reflex intensity and hue comparison.

**What will bite you.** This is the one legitimate way a laptop camera touches eye disease, and the
scoping matters: you are imaging the eye's exterior and its light reflections, not the retina. Say
that plainly.

---

## Lab and bench biology — camera as scientific instrument

### 12. Automated colony counting and zone-of-inhibition measurement

**What it is.** Two tedious manual tasks in every microbiology lab: counting colonies on plates,
and measuring antibiotic inhibition-zone diameters with a ruler.

**Why it works.** Both are well-posed segmentation problems on a controlled, repeatable scene.

**What you build.** A webcam on a stand with fixed geometry and lighting, classical segmentation
(threshold, watershed for touching colonies) as the baseline, and a small U-Net for crowded
plates. Zone measurement is ellipse fitting around the disc.

**What will bite you.** Very little, which is the point. It's immediately useful to actual
researchers, and antimicrobial-resistance surveillance gives it real weight.

### 13. Model organism behavioural phenotyping

**What it is.** Tracking C. elegans, zebrafish larvae, or Drosophila — standard readouts in
neuroscience and drug screening.

**Why it works.** These are tracked with exactly this kind of setup today, and there is strong
open-source precedent in Tierpsy Tracker and idtracker.ai to learn from.

**What you build.** Video tracking plus feature extraction: locomotion speed, turning rate,
thrashing frequency, and dwell-time distributions. That gives you a drug-screening or
neurodegeneration-model assay running on a laptop.

**What will bite you.** Multi-animal identity maintenance through occlusion, which is the
interesting hard part and where the published tools spend their complexity.

### 14. Plant phenotyping and stress detection by timelapse

**What it is.** A webcam pointed at plants over days, yielding growth rate, leaf area, canopy
structure, and early water- or disease-stress detection from colour shifts and wilting geometry
before a person would notice.

**Why it works.** Agriculture is a serious application domain, the data collection costs nothing
but time, and public datasets exist: PlantVillage for disease classification and the CVPPP leaf
segmentation datasets.

**What you build.** Fixed-camera timelapse capture, leaf segmentation, per-day morphometrics, and a
change-detection layer that flags stress onset.

**What will bite you.** Lighting drift across days and the temptation to skip the boring part —
registering frames so day-to-day comparisons are real.

### 15. DIY webcam spectrometer

**What it is.** A diffraction grating (a broken CD, or $5 for a real one) in front of a webcam,
giving a visible-light spectrometer capable of absorbance measurement, fluorescence detection, and
material identification from emission lines.

**Why it works.** It converts a $20 build into an instrument that costs thousands commercially.
This is the physics-and-chemistry entry in the catalog.

**What you build.** A light-tight enclosure with a slit and grating, spectral-line extraction from
the captured image, and wavelength calibration against known emission lines — a fluorescent lamp
gives you sharp mercury peaks to anchor on.

**What will bite you.** Nothing conceptually, but the wavelength calibration step is what separates
a quantitative instrument from a toy. Do it, and document the residuals.
