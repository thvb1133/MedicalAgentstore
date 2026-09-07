# Clinical AI and omics — 10 larger ideas

These are bigger than a weekend, and several are genuine research programmes. Each is scoped down
to a version a small team can finish.

### 1. Contactless vitals from a webcam (rPPG)

Take a 30-second face video and return heart rate, heart rate variability, and respiration rate
with an explicit confidence score.

- **Stack.** Face landmarking (MediaPipe) → region-of-interest signal extraction → either classical
  chrominance methods (CHROM, POS) as the baseline or a learned model (PhysNet, PhysFormer).
- **Data.** UBFC-rPPG, PURE, VIPL-HR, MMPD.
- **Hard parts.** Motion and illumination robustness, plus fairness across skin tones. Melanin
  absorbs the green-channel signal the method depends on, so validate on darker skin explicitly or
  you will ship a biased product.
- **Scope advice.** A strong classical baseline plus a calibrated uncertainty estimate beats a
  flashy model with no error bars. Ship the baseline, then try to beat it.

### 2. Passive digital phenotyping for depression and relapse

Instead of scoring a selfie, track one person over weeks and predict deterioration.

- **Signals.** Sleep timing from phone usage, typing dynamics, voice prosody from consented voice
  notes, movement entropy from GPS, social interaction counts.
- **Label.** Periodic PHQ-9 or GAD-7 self-reports.
- **Why it works.** Each user is their own baseline, which sidesteps the between-person variance
  that wrecks single-snapshot approaches.
- **Cohort references.** StudentLife; DAIC-WOZ for audio.
- **The actual product is the ethics.** On-device feature extraction, no raw audio leaving the
  phone, and a clear escalation path to a human clinician. Build those first, not last.

### 3. Cancer pathology triage on whole-slide images

Pathologists are the bottleneck in cancer diagnosis worldwide. Build a tile-level model with
multiple-instance learning (CLAM, TransMIL) that flags and ranks slides by suspicion so the queue
gets reordered, and produces attention heatmaps a pathologist can audit.

- **Data.** TCGA; CAMELYON16/17 for breast lymph-node metastasis; PANDA for prostate grading.
- **Realistic scope for a small team.** One tissue type, one question, done well. The deliverable is
  a reordered queue plus an auditable heatmap, not an autonomous diagnosis.

### 4. Cheap-modality cancer screening for low-resource settings

Cervical cancer screening from smartphone colposcopy images, or oral cancer screening from phone
photos of the oral cavity.

These kill enormous numbers of people in places with no pathology infrastructure, the imaging
device is a phone camera, and the model can run offline on-device. Arguably the highest
lives-saved-per-line-of-code idea in the catalog. The constraints are image-quality gating and
on-device inference, both tractable.

### 5. Neoantigen and personalised cancer vaccine design

Given a tumour's mutation calls, predict which mutant peptides will actually be presented by that
patient's HLA type and be immunogenic.

- **Build on.** NetMHCpan, MHCflurry, and protein language models such as ESM-2.
- **Data.** IEDB, which is public.
- **Why it's attractive.** Purely computational, no wet lab, and it sits at the frontier of oncology
  rather than replicating a solved task.

### 6. Seizure and stroke early warning from wearable signals

Detect pre-ictal EEG patterns, or catch atrial fibrillation from a smartwatch PPG trace — which
matters because untreated AF causes strokes and is often asymptomatic.

- **Data.** CHB-MIT and the TUH EEG corpus; PhysioNet AF challenges.
- **The engineering problem that decides success is the false-alarm rate.** An alarm that cries wolf
  twice a day gets switched off and then protects nobody. Optimise precision at a fixed high recall,
  and report alarms-per-day-per-patient as a headline metric alongside sensitivity.

### 7. Retinal imaging as a window on systemic disease ("oculomics")

A fundus photo carries signal about diabetic retinopathy and also about cardiovascular risk,
anaemia, and chronic kidney disease.

- **Data.** EyePACS, APTOS, Messidor, UK Biobank fundus images.
- **Deployment path.** Pair it with a ~$50 phone-clip fundus lens and you have deployable screening.
- **Note the distinction from anything face-camera-based.** This needs a retinal camera or clip lens;
  a webcam cannot substitute. Diabetic-retinopathy screening is also one of the most clinically
  validated AI-health applications that exists, which makes it a good reference point for what real
  medical AI looks like.

### 8. Brain–computer interfaces for communication

Non-invasive motor-imagery or P300 speller decoding from consumer EEG (OpenBCI, Muse) to give
people with ALS or locked-in syndrome a communication channel.

- **Data.** BCI Competition IV, plus the recent speech-decoding literature.
- **The real enemy is low information rate.** A language model as a decoding prior is the single
  biggest available win — it converts a noisy character stream into usable sentences.

### 9. Protein structure and binder design for undrugged targets

AlphaFold, ESMFold, RFdiffusion, and ProteinMPNN are all openly available, which makes designing
candidate binders against a chosen target a laptop-plus-GPU exercise.

Pick a genuinely hard target — KRAS, a specific viral protein, an antibiotic-resistance enzyme —
and design plus computationally validate binders. Antimicrobial peptide design against resistant
bacteria is a variant with a huge, underserved need. The catch is that computational validation is
not experimental validation; be explicit about which one you have.

### 10. Federated learning for hospital data, with verifiable audit

Hospitals can't pool patient records, which starves medical AI of exactly the diverse data it needs.
Train across institutions where only model updates move, add differential privacy on those updates,
and use an append-only ledger to record which institution contributed which update and which model
version produced a given clinical prediction.

- **Framework.** Flower or NVIDIA FLARE.
- **This is where a ledger genuinely fits.** Provenance and tamper-evident audit trails are a real
  use for an append-only log. Putting patient records on-chain is straightforwardly a bad idea,
  because immutability collides with the right to erasure. Record hashes and provenance, never
  payloads.
