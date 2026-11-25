// Live check: download public/blocklist like the extension does and print the index.
// Run: node dev/check-community.mjs
import { FIREBASE } from "../config.js";
import { buildIndex, lookupPhoneIn } from "../community.js";

const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/public/blocklist?key=${FIREBASE.apiKey}`;
const res = await fetch(url);
console.log("HTTP", res.status);
const doc = await res.json();
const val = (v) => v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.arrayValue ? (v.arrayValue.values || []).map(val) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : null);
const entries = doc.fields ? val(doc.fields.entries) : [];
const idx = buildIndex(entries);
console.log("sites:", idx.sites);
console.log("phones:", idx.phones);
console.log("0564864684 ->", lookupPhoneIn(idx, "+971 56 486 4684"), "report(s)");
