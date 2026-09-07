# Medical Agent Store — Idea Catalog

A catalog of camera-, AI-, and biology-based health project ideas, organised so you can pick
one and start building instead of re-arguing the brainstorm. Every entry answers the same four
questions: **what it is**, **why it can work**, **what you build**, and **what will bite you**.

The catalog is opinionated on one point: an idea is only worth building if the sensor you
actually have can see the thing you claim to measure. That single filter kills most bad health-AI
demos, and it is spelled out in [docs/00-picking-an-idea.md](docs/00-picking-an-idea.md).

## Contents

| Document | What's in it |
| --- | --- |
| [00-picking-an-idea.md](docs/00-picking-an-idea.md) | The filter: what a camera can and cannot sense, and how to score an idea before you commit |
| [01-camera-as-instrument.md](docs/01-camera-as-instrument.md) | 15 ideas that treat the camera as a physiological sensor, a medical-image capture device, or a sub-$30 lab instrument |
| [02-clinical-ai-and-omics.md](docs/02-clinical-ai-and-omics.md) | 10 larger ideas: rPPG vitals, digital phenotyping, pathology triage, neoantigen design, wearables, oculomics, BCI, protein design, federated learning |
| [03-quantum-biology.md](docs/03-quantum-biology.md) | 5 software-gap ideas in quantum biology, where the science is live and the tooling is one-off research scripts |
| [04-genomics-and-public-health.md](docs/04-genomics-and-public-health.md) | Rare-disease variant interpretation, outbreak early warning from satellite and open health data |
| [05-frontier-watch.md](docs/05-frontier-watch.md) | Context you cite but don't build in a weekend: gene editing, orbital manufacturing, self-driving labs, ambient clinical AI |
| [06-shortlist-and-build-order.md](docs/06-shortlist-and-build-order.md) | The ranked shortlist, a dependency-ordered build path, and a hackathon case study |
| [07-claims-and-safety.md](docs/07-claims-and-safety.md) | What is genuinely cleared by regulators, what is research-stage, what is an illegal claim, and the disclaimer/escalation patterns to ship |

## If you only read one thing

Three ideas dominate on buildability-per-hour, and all three are in
[06-shortlist-and-build-order.md](docs/06-shortlist-and-build-order.md):

1. **Contactless vitals from a webcam (rPPG)** — heart rate, HRV, respiration from a 30–50 second
   face video. Well-trodden, open datasets, and it becomes the foundation for stress, fatigue, and
   attention layers on top.
2. **Webcam microscopy for blood smears and water quality** — a $15 clip-on macro lens plus public
   malaria datasets. Highest impact per dollar of hardware in the whole catalog.
3. **Rapid diagnostic test / assay strip reader** — colorimetric calibration against a printed
   reference card, which is both the hard technical problem and the contribution.

## A note on sourcing

Specific figures in this catalog — regulatory clearance numbers, accuracy percentages, dataset
sizes, and 2026-dated results — come from the source brainstorm and have **not** been
independently verified in this repository. Treat them as leads, not citations. Verify each one
against the primary source before it goes into a slide, a paper, or a product claim.
