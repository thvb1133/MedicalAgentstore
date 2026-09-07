# Quantum biology — five software gaps

Quantum biology is unusual: the science is active and contested, and the software is almost entirely
one-off research scripts. That gap is the opportunity. In every entry below, the contribution isn't
new physics — it's turning a reproduction script into engineered, tested, documented infrastructure
that other people can use.

Background, in one paragraph each, on the four phenomena that recur here:

- **Photosynthetic energy transfer.** Light-harvesting complexes shuttle absorbed energy to the
  reaction centre at near-perfect efficiency, essentially exploring many paths rather than bouncing
  randomly. How much quantum coherence contributes has driven the field for fifteen years.
- **Magnetoreception.** Migratory birds are believed to navigate via a radical pair mechanism in a
  retinal protein called cryptochrome: blue light knocks an electron off a flavin, it hops down a
  chain of tryptophans, and the resulting pair of correlated electron spins responds to Earth's
  magnetic field. It's one of the best-evidenced cases of a quantum effect mattering to a living
  animal.
- **Proton tunnelling.** Hydrogen is light enough to tunnel through energy barriers instead of
  climbing them, which shows up in enzyme catalysis rates and in a proposed DNA mutation mechanism
  where a proton in a base pair tunnels to the wrong side and causes a mispairing at the next
  replication.
- **Biological qubits.** The newest thread: engineering proteins found in living cells into
  functioning qubits, so a quantum sensor can operate inside a biological system. The payoff
  everyone points at is disease detection at sensitivities no conventional tool reaches.

---

### 1. The avian quantum compass simulator

**What you build.** A spin Hamiltonian solver: Earth's field around 50 microtesla, configurable
decoherence rates, body temperature at 310 K. Outputs are singlet yield versus field angle,
entanglement entropy, and quantum Fisher information.

**Prior work to build on.** First-principles simulations identifying the electron-transfer pathway
and showing that protein and solvent reorganisation stabilise the radical pair for microseconds —
exactly the lifetime sensing requires. A 2026 result on interradical motion found that motion, long
assumed to wreck sensitivity, actually pushes precision to roughly 90% of the quantum
Cramér–Rao bound, implying evolution landed near the physical optimum. There is an open Python
framework (`Chandan118/Quantum-Theory-of-the-Navigation`) that maps the biological compass onto a
three-qubit Qiskit circuit and reproduces the radio-frequency disruption experiments that
disorient real birds.

**The gap.** These are one-off research scripts. Nobody has built the equivalent well-engineered,
tested, documented library with a parameter-sweep interface.

### 2. Photosynthetic energy transfer solvers

**What you build.** GPU acceleration and a benchmark suite for the hierarchical equations of motion
(HEOM). The simple Lindblad equation assumes weak coupling and no memory, which is wrong for these
systems, so you need HEOM — which is exact and brutally expensive.

**Prior work to build on.** `quantum_HEOM` wraps QuTiP's HEOM solver for the seven-site
Fenna–Matthews–Olson complex and is the friendly entry point. TENSO decomposes HEOM using tree
tensor networks to handle larger systems with complicated bath structure. `qHEOM` runs the dynamics
on IBM quantum hardware by turning non-unitary evolution into circuits via SVD dilation, with
public code and a Colab notebook.

**The gap.** Performance and comparability. HEOM is the bottleneck of the entire field, so GPU
acceleration plus a proper benchmark suite comparing methods on identical systems would be used
immediately by everyone working on it.

### 3. Biology as quantum communication channels

**What you build.** A general library: supply a Hamiltonian and a bath model, get channel metrics
back. Treat every quantum-biological subsystem as an information channel governed by the same
open-systems equations, then measure it with information theory — mutual information, channel
capacity, quantum Fisher information, and a "noise-assistance index" capturing the counterintuitive
fact that noise sometimes helps these systems.

**Prior work to build on.** A 2026 IEEE paper and its public dataset do exactly this across four very
different systems in one unified framework: the FMO complex (PDB 3EOJ), a cryptochrome
magnetoreceptor, guanine–cytosine proton tunnelling as a DNA mutation channel, and a potassium ion
channel (PDB 1BL8). Code, data, and regression suites are downloadable.

**The gap.** It exists as reproduction scripts for one paper. Generalised, it would be the field's
missing common infrastructure. This is the most elegant framing here and probably the best software
opportunity.

### 4. Proton tunnelling in enzymes and DNA

**What you build.** A machine-learned surrogate that predicts tunnelling contributions directly from
molecular structure — the same trick being applied across computational chemistry.

**Why it's tractable.** Rate calculations are expensive quantum chemistry, and the experimental
signature is clean: because tunnelling depends exponentially on mass, you detect it by swapping
hydrogen for deuterium and measuring how much the rate changes. That gives you a labelled target.

**The gap.** No surrogate exists. Well-shaped, tractable project.

### 5. A quantum-versus-classical arbiter

**What you build.** A standalone, rigorous, documented statistical toolkit that takes a dataset and
two competing models and reports which better explains the data, penalising the extra complexity a
quantum model brings. The IEEE work above includes a Bayesian-information-criterion test of exactly
this shape; the goal is to make it usable by experimentalists who aren't theorists.

**Why it matters most.** Quantum biology's central credibility problem is that many claimed effects
have a perfectly good classical explanation, and the field has been burned before — coherence
signals in photosynthesis that later looked like ordinary vibrations. This is the least glamorous
item here and probably the most valuable, because it would raise the evidentiary standard of an
entire discipline.

---

## Adjacent, and worth citing rather than building

- **Quantum sensing for early disease detection.** Quantum sensors small enough to work inside or
  near living cells, detecting disease markers at sensitivities no conventional tool matches. Japan's
  National Institutes for Quantum Science and Technology and Google's $10M REPLIQA programme both
  frame this as the near-term direction.
- **Quantum-assisted drug discovery.** Hybrid quantum-classical simulation of protein structure —
  reported at 303 atoms in March 2026, and enzyme-interaction simulations at nearly 12,000 atoms,
  the largest biological molecules modelled with quantum computing so far. Note *hybrid*: this is
  not full quantum simulation, and describing it as such is the most common overclaim in this space.
- **Quantum machine learning for disease subtyping.** Early studies show improvements in cancer
  subtype classification. Early is the operative word.
- **Bio-inspired engineering.** Both photosynthetic energy transfer and magnetoreception are being
  studied to inform better solar cells and better magnetic sensors, which is often an easier story
  to tell than the biology itself.
