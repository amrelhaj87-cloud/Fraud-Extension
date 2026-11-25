# Chrome Web Store listing (draft)

Copy these into the Developer Dashboard when publishing. Nothing here is uploaded automatically.

## Basics

| Field | Value |
|---|---|
| Name | Yaqiz (see the name note in [CHECKLIST.md](CHECKLIST.md)) |
| Category | Tools (or Privacy & Security) |
| Language | Arabic (primary), English |
| Homepage | the Vercel site, e.g. `https://fraudshield.vercel.app/` |
| Support | `https://github.com/amrelhaj87-cloud/FraudShield/issues` |
| Privacy policy | `https://<your-site>/privacy.html` |

## Short description (max 132 characters)

- **AR:** تحذّرك من روابط ومواقع وأرقام الاحتيال في بحث Google وخرائط Google قبل أن تضغط، وتشرح السبب.
- **EN:** Warns you about scam links, sites and phone numbers in Google Search and Maps before you click, and explains why.

## Detailed description

### العربية

Yaqiz تحميك من الاحتيال قبل أن تضغط.

• بحث Google: علامة 🟢 / 🟡 / 🔴 بجانب كل نتيجة، مع سبب واضح.
• خرائط Google: تحذير على الأماكن المزيفة، مثل "دفع المخالفات" أو "خدمة عملاء البنك" برقم جوال شخصي.
• أي موقع: المواقع عالية الخطورة تُحظر قبل أن تفتح، والملفات الخطيرة تتوقف قبل اكتمال التنزيل.
• بلاغات المستخدمين: بلّغ عن موقع أو رقم بحساب Google. كل بلاغ يُراجَع، والمعتمد يحمي كل المستخدمين.

كيف تعمل: الفحص على جهازك. تجمع الإضافة إشارات مثل انتحال اسم جهة معروفة، وعمر الدومين، ومالك عنوان الـIP، وطلب رمز التحقق أو بيانات البطاقة في موقع غير رسمي، والبلاغات المعتمدة، في درجة من 0 إلى 100.

الخصوصية: لا نرسل سجل تصفحك إلى أي خادم. لا إعلانات ولا تتبّع.

### English

Yaqiz protects you from scams before you click.

• Google Search: a 🟢 / 🟡 / 🔴 badge next to every result, with a clear reason.
• Google Maps: warnings on fake listings, such as "pay your fines" or "bank customer service" with a personal mobile number.
• Any website: high-risk sites are blocked before they load; dangerous downloads are paused.
• User reports: report a site or number with your Google account. Every report is reviewed; approved ones protect every user.

How it works: checks run on your device. The extension combines signals such as impersonating a known organisation, domain age, IP owner, asking for an OTP or card details on an unofficial site, and approved reports into a 0–100 score.

Privacy: your browsing history is never sent to any server. No ads, no tracking.

## Single purpose

Warn users about scam and phishing websites, places and phone numbers while they browse and search, and let them report scams.

## Permission justifications

| Permission | Why it is needed |
|---|---|
| `storage` | Saves settings, the user's own reports, recent check results and the shared list on the device. |
| `tabs` | Reads the current tab's address to show its risk in the popup and to open the warning, report and review pages. |
| `webNavigation` | Checks a page's address when the user opens it, so high-risk sites can be blocked before they load. |
| `downloads` | Pauses dangerous file types (.exe, .apk, .scr…) from risky sites until the user decides. |
| `identity` | Google sign-in, only when the user chooses to send a report. |
| `alarms` | Downloads the shared list of approved scam reports about once an hour. |
| Host permission `https://*/*` | Scam pages can be on any domain: needed to check the page the user opens, show warnings on Google Search and Maps, and look up domain age (RDAP) and the shared list. |
| Content scripts on all sites | Detect fake sign-in pages (OTP / Emirates ID requests), card forms on suspicious sites, clipboard hijacking and tech-support scareware. Page contents are analysed locally and never sent anywhere. |

Remote code: **No.** All code ships in the package.

## Data usage disclosures (Privacy tab)

Collected, only when the user sends a report:
- **Personally identifiable information:** name and email (Google sign-in; not shown to others).
- **Website content:** the reported link, or the place's name, number and address, and the user's optional note.

Not collected: browsing history, health, financial, authentication, personal communications, location, user activity.

Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending.

## Screenshots to prepare (1280×800 or 640×400)

1. Google Search with green / yellow / red badges.
2. Google Maps place "دفع المخالفات" with the red warning (85/100, "reported by users").
3. The block page for a high-risk site.
4. The popup (main view) and the settings view.
5. The report page with Google sign-in.
