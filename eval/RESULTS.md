# FraudShield accuracy (v2.0.2)

URL only: no domain-age lookup, no IP owner, no page scan.

| Scam links | Count | Detected (medium+high) | High only |
|---|---|---|---|
| UAE scams (hand-labelled) | 14 | **92.9%** | 78.6% |
| Global phishing, TRAIN half | 150 | **36.7%** | 0.0% |
| Global phishing, TEST half | 150 | **34.7%** | 0.0% |

| Legitimate links | Count | False alarms (medium+high) | High only |
|---|---|---|---|
| UAE legit + hard negatives (hand-labelled) | 18 | **5.6%** | 0.0% |
| UAE legit sites | 89 | **2.2%** | 0.0% |
| Top 5000 sites (Tranco) | 5000 | **0.1%** | 0.0% |
| Legit pages on free hosting | 27 | **0.0%** | 0.0% |
| **All legitimate** | 5134 | **0.1%** (7) | |

## Missed scams (UAE set and TRAIN half only), grouped by domain ending

- **pages.dev** (23): `https://j36po-nmd-emf4-kq8un-21-10-2026-aa.pages.dev/`
- **blogspot.com** (9): `http://www.hadiahresmi-jkt648.blogspot.com/`
- **vercel.app** (6): `https://www.lookhot-rust.vercel.app/`
- **com.bo** (4): `https://roblox.com.bo/games/188331334/Testing-Server?privateServerLinkCode=82251204748658424511459550797082`
- **wallet-veriffy.com** (4): `https://walletconnect.wallet-veriffy.com/solutions/trading`
- **e-docssign.net** (3): `https://login.e-docssign.net/107519/8af662/475d964a-0243-46bf-aefd-66da26254efa/`
- **com.et** (3): `http://www.roblox.com.et/users/9591227408/profile`
- **workers.dev** (3): `https://damp-snowflake-4c83.ctonhucaqllaeie.workers.dev/help`
- **oppdateraltinn.com** (2): `https://oppdateraltinn.com/index2.html`
- **netlify.app** (2): `http://vodafone-admin-app.netlify.app/`
- **roblox.ss** (2): `https://www.roblox.ss/users/1019373172/profile`
- **metaagencypartner.com** (2): `https://member18.metaagencypartner.com/`
- **hostel.town** (2): `http://tailormadetekapoaccommodation.hostel.town/`
- **weebly.com** (2): `http://www.finitys.weebly.com/`
- **bit.ly** (1): `http://bit.ly/3xYzAbC`

## False alarms (legitimate links flagged)

- 45 `https://www.dubaipolice-museum.example.org/visit` (UAE legit + hard negatives (hand-labelled)): Impersonates Dubai Police (law enforcement) but is not its official site
- 45 `https://www.etihadwe.ae/` (UAE legit sites): Impersonates Etihad Airways (airline) but is not its official site
- 45 `https://www.mashreq.com/en/uae/neo/` (UAE legit sites): Impersonates Mashreq (UAE bank) but is not its official site
- 40 `https://xn--12c1ezaww.com/` (Top 5000 sites (Tranco)): Domain uses non-Latin look-alike characters (possible homograph attack)
- 40 `https://xn--18-3qi3cza3b2a2dxc4b9a.com/` (Top 5000 sites (Tranco)): Domain uses non-Latin look-alike characters (possible homograph attack)
- 60 `https://xn--42cf7cgd7gxbd4m7c.cc/` (Top 5000 sites (Tranco)): Domain uses non-Latin look-alike characters (possible homograph attack); Untrusted extension often used in scam campaigns (.cc)
- 40 `https://xn--l3ca4b6dsc1b.com/` (Top 5000 sites (Tranco)): Domain uses non-Latin look-alike characters (possible homograph attack)
