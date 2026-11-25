# Yaqiz

**[العربية](#العربية) · [English](#english)**

<div dir="rtl">

## العربية

إضافة لمتصفح Chrome تحذّر الناس في الإمارات من الاحتيال **قبل الضغط على الرابط**، وتشرح سبب كل تحذير بالعربية أو الإنجليزية.

### المشكلة

ينتحل المحتالون صفة الجهات التي يثق بها الناس: شرطة أبوظبي، وتم، وUAE PASS، والبنوك، وبريد الإمارات. يرسلون روابط "ادفع مخالفتك"، وينشئون صفحات دخول UAE PASS مزيفة، ويضعون أرقام جوال شخصية في خرائط Google باسم "دفع المخالفات".

أدوات الفحص المعتادة تعتمد على قوائم سوداء، والموقع المسجل اليوم لا يوجد في أي قائمة بعد.

### الحل

Yaqiz تفحص الرابط نفسه على جهاز المستخدم:

- **بحث Google:** علامة 🟢 / 🟡 / 🔴 بجانب كل نتيجة
- **خرائط Google:** تحذير على المكان المشبوه
- **أي موقع:** الموقع الخطير يُحظر قبل أن يفتح
- **البلاغ:** زر 🚩 يحفظ بلاغًا عن الموقع أو المكان (حاليًا على الجهاز فقط)

### كيف تعمل

تجمع الإضافة أربع إشارات في درجة من 0 إلى 100: هل الرابط ينتحل اسم جهة معروفة؟ هل الدومين جديد؟ من يملك عنوان الـIP؟ هل الصفحة تطلب الهوية أو رمز التحقق في موقع غير رسمي؟

### الاختيارات التقنية والأدوات والبيانات

- **التقنية:** إضافة Chrome (Manifest V3) بلغة JavaScript، بدون مكتبات ولا سيرفر ولا مفتاح API.
- **واجهات خارجية:** RDAP العام لمعرفة عمر الدومين ومالك عنوان الـIP، ونطاقات عناوين Google المنشورة.
- **البيانات:** اختبرنا الدقة على OpenPhish وPhishing.Database وأشهر 5000 موقع (Tranco) وروابط إماراتية مصنفة يدويًا.

### البناء والتشغيل

1. حمّل المشروع: `git clone https://github.com/amrelhaj87-cloud/FraudShield.git`
2. افتح `chrome://extensions` وفعّل **Developer mode**.
3. اضغط **Load unpacked** واختر فولدر المشروع.

لا تحتاج الإضافة أي بناء. ولعمل ملف zip: `npm run build`، وللاختبارات: `npm test`.

### الخطوة القادمة

قاعدة بلاغات مشتركة: تسجيل الدخول بحساب Google، وكل بلاغ يُراجَع قبل اعتماده، وكل نسخة من الإضافة تحدّث قائمتها تلقائيًا من البلاغات المعتمدة.

</div>

---

## English

A Chrome extension that warns people in the UAE about scams **before they click**, and explains every warning in Arabic or English.

## The problem

Scammers pretend to be the bodies people trust: Abu Dhabi Police, TAMM, UAE PASS, banks, Emirates Post. They send "pay your fine" links, build fake UAE PASS sign-in pages, and list personal mobile numbers on Google Maps as "pay traffic fines".

Most checkers rely on blocklists, and a domain registered today is on no list yet.

## The solution

Yaqiz checks the link itself, on the user's device:

- **Google Search:** a 🟢 / 🟡 / 🔴 badge next to every result
- **Google Maps:** a warning on a suspicious place
- **Any website:** high-risk sites are blocked before they load
- **Report:** a 🚩 button saves a report about a site or place (on this device for now)

## How it works

The extension combines four signals into a 0–100 score: does the link impersonate a known body, is the domain new, who owns the IP, and does the page ask for an Emirates ID or OTP on an unofficial site?

## Technical choices, tools, APIs and data

- **Tech:** a Chrome extension (Manifest V3) in plain JavaScript. No libraries, no server, no API key.
- **APIs:** public RDAP lookups for domain age and IP owner, and Google's published IP ranges.
- **Data:** accuracy tested on OpenPhish, Phishing.Database, the Tranco top 5000 sites, and hand-labelled UAE links.

## How to build and run

1. Clone the repo: `git clone https://github.com/amrelhaj87-cloud/FraudShield.git`
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the project folder.

No build step is needed. To make a release zip: `npm run build`. To run the tests: `npm test`. Full technical details, including accuracy results, are in [dev/DETAILS.md](dev/DETAILS.md).

## What's next

A shared report database: sign in with Google, every report is reviewed before it counts, and every copy of the extension keeps its list up to date from the approved reports.
