# FraudShield accuracy (v2.1.0)

URL only: no domain-age lookup, no IP owner, no page scan.

| Scam links | Count | Detected (medium+high) | High only |
|---|---|---|---|
| UAE scams (hand-labelled) | 14 | **92.9%** | 78.6% |
| Global phishing, TRAIN half | 150 | **64.0%** | 17.3% |
| Global phishing, TEST half | 150 | **56.0%** | 12.0% |

| Legitimate links | Count | False alarms (medium+high) | High only |
|---|---|---|---|
| UAE legit + hard negatives (hand-labelled) | 18 | **5.6%** | 0.0% |
| UAE legit sites | 89 | **0.0%** | 0.0% |
| Top 5000 sites (Tranco) | 5000 | **0.0%** | 0.0% |
| Legit pages on free hosting | 27 | **0.0%** | 0.0% |
| **All legitimate** | 5134 | **0.0%** (1) | |

## Missed scams (UAE set and TRAIN half only), grouped by domain ending

- **pages.dev** (5): `https://about-blank-b9l.pages.dev/robots.txt/2606%253A4700%253A310c%253A%253Aac42%253A2f59/appeals/submit-appeal-form/return`
- **blogspot.com** (4): `http://www.hadiahresmi-jkt648.blogspot.com/`
- **wallet-veriffy.com** (4): `https://walletconnect.wallet-veriffy.com/solutions/trading`
- **vercel.app** (4): `https://www.lookhot-rust.vercel.app/`
- **e-docssign.net** (3): `https://login.e-docssign.net/107519/8af662/475d964a-0243-46bf-aefd-66da26254efa/`
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

## False alarms (legitimate links flagged)

- 45 `https://www.dubaipolice-museum.example.org/visit` (UAE legit + hard negatives (hand-labelled)): Impersonates Dubai Police (law enforcement) but is not its official site
