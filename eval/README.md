# Accuracy scale (الميزان)

Measures the scorer before and after every rule change.

```
node eval/run.mjs            # summary
node eval/run.mjs --details  # + missed scams and false alarms
node eval/run.mjs --write    # also saves RESULTS.md
npm run eval                 # same as --write
```

## The two numbers

- **Detection:** share of scam links flagged medium or high. Higher is better.
- **False alarms:** share of legitimate links flagged medium or high. Lower is better, and it matters more: a tool that cries wolf gets uninstalled.

## Data (`eval/data/`)

| File | What | Source |
|---|---|---|
| `uae-golden.json` | 14 UAE-style scam links, 10 legit, 8 hard negatives (legit links with scam-like words) | Team repo `fraudshield/backend/tests/fixtures/golden_urls.json`, hand-labelled before scoring |
| `phish-openphish.json` | 300 real phishing URLs, split 150 train / 150 test (seed 2026) | Team repo, OpenPhish snapshot |
| `legit-tranco-top5000.txt` | Top 5000 sites, home pages | Team repo `config/popular_domains.txt` (Tranco, 2026-11-23). The extension does not use this list, so it is a fair test |
| `legit-uae.txt` | 89 real UAE sites: government, banks, telecom, shopping, news… | Hand-picked |
| `legit-free-hosting.txt` | 27 legitimate pages on free hosting (github.io, blogspot, vercel, netlify, linktr.ee…) and 19 brands' own subdomains (developer.paypal.com, help.netflix.com…) | Hand-picked |

## Rules for using it honestly

1. **Design rule changes on the TRAIN half only.** The TEST half shows whether a change works on links nobody looked at. The script lists missed links from the TRAIN half (and the UAE set) only.
2. **Run it after every change** and write the numbers in `CHANGELOG.md`.
3. **A new rule that adds false alarms needs a very good reason.**
4. **URL only.** No domain-age lookup, IP owner or page scan, so the browser catches more than this. Do not quote these numbers as the extension's full accuracy, and do not quote the UAE numbers alone: 14 links is too few.
5. The global phishing set is English-heavy and not UAE-specific. The goal is a UAE scam set built from real reports (see the report button).
