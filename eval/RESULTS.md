# FraudShield accuracy (v2.4)

URL only: no domain-age lookup, no IP owner, no page scan.

| Scam links | Count | Detected (medium+high) | High only |
|---|---|---|---|
| UAE scams (hand-labelled) | 14 | **92.9%** | 78.6% |
| Global phishing, TRAIN half | 150 | **69.3%** | 22.0% |
| Global phishing, TEST half | 150 | **60.0%** | 15.3% |
| Phishing.Database links (sample 2000) | 2000 | **13.1%** | 2.0% |
| Phishing.Database domains (sample 2000) | 2000 | **33.6%** | 4.5% |
| Phishing.Database links naming UAE / .ae (600) | 600 | **19.2%** | 4.7% |

| Legitimate links | Count | False alarms (medium+high) | High only |
|---|---|---|---|
| UAE legit + hard negatives (hand-labelled) | 18 | **5.6%** | 0.0% |
| UAE legit sites | 89 | **0.0%** | 0.0% |
| Top 5000 sites (Tranco) | 5000 | **0.0%** | 0.0% |
| Legit free hosting + brand subdomains | 46 | **0.0%** | 0.0% |
| **All legitimate** | 5153 | **0.0%** (1) | |

## URL + domain age (RDAP ages fetched 2026-11-24)

Domains under 30 days old are high risk on their own; under 180 days add points. "Age known" is how many links had a registry record (taken-down and reserved domains have none; free hosting reports the host's own age, e.g. pages.dev).

| Set | Count | Age known | Flagged (medium+high) | High only |
|---|---|---|---|---|
| UAE scams (hand-labelled) | 14 | 21.4% | **92.9%** detected | 78.6% |
| Global phishing, TRAIN half | 150 | 92.7% | **77.3%** detected | 31.3% |
| Global phishing, TEST half | 150 | 91.3% | **67.3%** detected | 22.0% |
| Phishing.Database links (sample 2000) | 2000 | 10.3% | **13.1%** detected | 2.0% |
| Phishing.Database domains (sample 2000) | 2000 | 14.4% | **33.6%** detected | 4.5% |
| Phishing.Database links naming UAE / .ae (600) | 600 | 0.7% | **19.2%** detected | 4.7% |
| UAE legit + hard negatives (hand-labelled) | 18 | 77.8% | **5.6%** false alarms | 0.0% |
| UAE legit sites | 89 | 40.4% | **0.0%** false alarms | 0.0% |
| Top sites, fixed sample of 400 (Tranco) | 400 | 80.5% | **0.5%** false alarms | 0.0% |
| Legit free hosting + brand subdomains | 46 | 76.1% | **0.0%** false alarms | 0.0% |

## Missed scams (UAE set and TRAIN half only), grouped by domain ending

- **pages.dev** (5): `https://about-blank-b9l.pages.dev/robots.txt/2606%253A4700%253A310c%253A%253Aac42%253A2f59/appeals/submit-appeal-form/return`
- **blogspot.com** (4): `http://www.hadiahresmi-jkt648.blogspot.com/`
- **vercel.app** (4): `https://www.lookhot-rust.vercel.app/`
- **workers.dev** (3): `https://damp-snowflake-4c83.ctonhucaqllaeie.workers.dev/help`
- **oppdateraltinn.com** (2): `https://oppdateraltinn.com/index2.html`
- **metaagencypartner.com** (2): `https://member18.metaagencypartner.com/`
- **hostel.town** (2): `http://tailormadetekapoaccommodation.hostel.town/`
- **weebly.com** (2): `http://www.finitys.weebly.com/`
- **bit.ly** (1): `http://bit.ly/3xYzAbC`
- **contabostorage.com** (1): `https://sin1.contabostorage.com/db01c8204bba439db38b55b2acee7ec1:webmail-oxcs.web.com-appsuite/0xcs.html`
- **u.to** (1): `http://u.to/WvvhIg`
- **php-code2000.info** (1): `https://php-code2000.info/lum`
- **almidossa.pro** (1): `http://almidossa.pro/`
- **godaddysites.com** (1): `https://site-keui76ldh.godaddysites.com/`
- **spi66.com** (1): `http://spi66.com/`

## False alarms (legitimate links flagged)

- 45 `https://www.dubaipolice-museum.example.org/visit` (UAE legit + hard negatives (hand-labelled)): Impersonates Dubai Police (law enforcement) but is not its official site
