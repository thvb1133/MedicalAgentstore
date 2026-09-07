# Genomics and public health

Two ideas here that need no hardware at all, plus the smaller data-tooling variants of each.

---

## 1. Genomic variant interpretation for rare disease

**What it is.** A doctor or a family uploads a raw sequencing file. The system annotates every
variant against public clinical databases, filters the tens of thousands of harmless ones down to a
handful of candidates, and produces a readable report explaining which mutation likely explains the
child's symptoms.

**Why it wins.** The emotional weight is enormous. Families with an undiagnosed rare disease spend
years and large sums bouncing between specialists. Sequencing itself now costs under a hundred
dollars, so the bottleneck is purely interpretation — which is software. The reference databases are
free and downloadable.

**What you build.** VCF ingest → annotation against public clinical-variant and population-frequency
databases → filtering by inheritance model and phenotype match → a ranked candidate list with a
plain-language explanation per candidate and links to the supporting evidence.

**The risk to name out loud.** These databases underrepresent non-European ancestry, so accuracy
drops for exactly the populations that are already underserved. Say that on stage rather than hiding
it, and build an ancestry-aware confidence score into the tool. Naming the limitation and
engineering around it impresses good judges; papering over it is the thing that gets you caught in
questions.

---

## 2. Dengue and malaria outbreak early warning from satellite data

**What it is.** A public dashboard that pulls free satellite imagery and weather data, identifies the
standing-water and vegetation conditions where disease-carrying mosquitoes breed, and predicts which
districts will see an outbreak weeks before cases appear — so a health department can spray and
prepare hospital beds in advance instead of reacting.

**Why it wins.** It's visual in a way judges remember: a map of the country lighting up in red weeks
before an outbreak beats any chart as a closing slide. It's directly a governance tool, it uses
public money already spent on satellites, and it targets diseases that kill people every year.

**What you build.** Satellite and weather ingest → per-district feature extraction (surface water
proxies, vegetation indices, temperature and rainfall lags) → a lagged model against historical case
counts → a choropleth risk map with a time slider.

**The risk to name out loud.** Prediction accuracy is the hard part, and a short build window gets
you a credible correlation, not a validated model. That's fine if you present it honestly as a
screening and prioritisation tool rather than a prophecy. Show the historical backtest, including
the districts it got wrong.

---

## Smaller variants of the same shape

- **Public health early-warning dashboard from open health data.** Free NHS, ONS, or CDC data turned
  into a regional risk map that flags emerging outbreaks before case counts spike. Same deliverable
  as above with no remote-sensing pipeline to build.
- **Genomics / public-health data explorer.** Take a free public dataset — NASA GeneLab, or open
  genomic and health datasets — and build a tool that turns raw data into something a non-expert,
  like a public health officer, can read and act on. Less flashy, but a strong real-world-usefulness
  story and very little to go wrong technically.
- **AI symptom-checker and clinical documentation assistant.** Built on an open-source medical
  language model: take described symptoms and return likely conditions plus an urgency level with a
  clear "not a diagnosis" disclaimer, or auto-summarise a doctor–patient conversation into clean
  notes. No hardware, no lab, just a model and a good interface. Note that ambient clinical
  documentation is a crowded market — see [05-frontier-watch.md](05-frontier-watch.md) for where the
  open space actually is.
