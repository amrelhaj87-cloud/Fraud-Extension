# Accuracy scale (الميزان)

Measures the scorer before and after every rule change.

```
node eval/run.mjs            # summary
node eval/run.mjs --details  # + missed scams and false alarms
node eval/run.mjs --write    # also saves RESULTS.md
npm run eval                 # same as --write
node eval/fetch-ages.mjs     # look up domain ages (RDAP, network) into data/rdap-ages.json
```

With `data/rdap-ages.json` present, a second table shows **URL + domain age**, the layer the browser adds (a domain under 30 days old is high risk on its own). The top-5000 set is a fixed sample of 400 there, to keep registry lookups polite. Ages are relative to the fetch date in the file; the phishing snapshot is from 2026-11-23.

## The two numbers

- **Detection:** share of scam links flagged medium or high. Higher is better.
- **False alarms:** share of legitimate links flagged medium or high. Lower is better, and it matters more: a tool that cries wolf gets uninstalled.

## Data (`eval/data/`)

| File | What | Source |
|---|---|---|
| `uae-golden.json` | 14 UAE-style scam links, 10 legit, 8 hard negatives (legit links with scam-like words) | Team repo `fraudshield/backend/tests/fixtures/golden_urls.json`, hand-labelled before scoring |
| `phish-openphish.json` | 300 real phishing URLs, split 150 train / 150 test (seed 2026) | Team repo, OpenPhish snapshot |
| `phish-phishingdb.json` | **Test only, never used to design rules.** Fixed samples from Phishing.Database (MIT, ACTIVE lists, last updated 2026-10-02): 2000 links, 2000 domains, and 600 of the 1928 links that name a UAE body, city or `.ae` (keyword match, so noisy) | github.com/Phishing-Database/Phishing.Database |
| `legit-tranco-top5000.txt` | Top 5000 sites, home pages | Team repo `config/popular_domains.txt` (Tranco, 2026-11-23). The extension does not use this list, so it is a fair test |
| `legit-uae.txt` | 89 real UAE sites: government, banks, telecom, shopping, news… | Hand-picked |
| `legit-free-hosting.txt` | 27 legitimate pages on free hosting (github.io, blogspot, vercel, netlify, linktr.ee…) and 19 brands' own subdomains (developer.paypal.com, help.netflix.com…) | Hand-picked |

## Rules for using it honestly

1. **Design rule changes on the TRAIN half only.** The TEST half shows whether a change works on links nobody looked at. The script lists missed links from the TRAIN half (and the UAE set) only.
2. **Run it after every change** and write the numbers in `CHANGELOG.md`.
3. **A new rule that adds false alarms needs a very good reason.**
4. **Main table is URL only; the second table adds domain age.** Neither has the IP owner or page scan, so the browser catches more than this. Do not quote these numbers as the extension's full accuracy, and do not quote the UAE numbers alone: 14 links is too few.
5. The global phishing set is English-heavy and not UAE-specific. The goal is a UAE scam set built from real reports (see the report button).
6. **`.ae` and `.gov.ae` have no public RDAP record**, so the domain-age check never fires for UAE domains (in the browser too). A new `.ae` scam domain is only caught by its name or its page.
