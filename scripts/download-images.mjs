import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "politicians");

const politicians = [
  { id: "netanyahu", wiki: "Benjamin_Netanyahu" },
  { id: "lapid", wiki: "Yair_Lapid" },
  { id: "smotrich", wiki: "Bezalel_Smotrich" },
  { id: "ben-gvir", wiki: "Itamar_Ben-Gvir" },
  { id: "gantz", wiki: "Benny_Gantz" },
  { id: "lieberman", wiki: "Avigdor_Lieberman" },
  { id: "deri", wiki: "Aryeh_Deri" },
  { id: "gallant", wiki: "Yoav_Gallant" },
  { id: "saar", wiki: "Gideon_Sa%27ar" },
  { id: "eisenkot", wiki: "Gadi_Eizenkot" },
  { id: "goldknopf", wiki: "Yitzhak_Goldknopf" },
  { id: "michaeli", wiki: "Merav_Michaeli" },
  { id: "abbas", wiki: "Mansour_Abbas" },
  { id: "odeh", wiki: "Ayman_Odeh" },
  { id: "yoav-kisch", wiki: "Yoav_Kisch" },
  { id: "ahmad-tibi", wiki: "Ahmad_Tibi" },
  { id: "moshe-gafni", wiki: "Moshe_Gafni" },
  { id: "miki-zohar", wiki: "Miki_Zohar" },
  { id: "ofer-cassif", wiki: "Ofer_Cassif" },
  { id: "bennett", wiki: "Naftali_Bennett" },
  { id: "israel-katz", wiki: "Israel_Katz_(politician)" },
  { id: "keti-shitrit", wiki: "Keti_Shitrit" },
  { id: "yariv-levin", wiki: "Yariv_Levin" },
  { id: "miri-regev", wiki: "Miri_Regev" },
  { id: "amir-ohana", wiki: "Amir_Ohana" },
  { id: "nir-barkat", wiki: "Nir_Barkat" },
  { id: "avi-dichter", wiki: "Avi_Dichter" },
  { id: "shlomo-karhi", wiki: "Shlomo_Karhi" },
  { id: "yuli-edelstein", wiki: "Yuli_Edelstein" },
  { id: "simcha-rothman", wiki: "Simcha_Rothman" },
  { id: "orit-strook", wiki: "Orit_Strook" },
];

function fetchBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { headers: { "User-Agent": "BadakFactCheck/1.0 (https://github.com/badak)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith("/")) loc = new URL(url).origin + loc;
        res.resume();
        return fetchBuffer(loc, maxRedirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function fetchJSON(url) {
  return fetchBuffer(url).then((buf) => JSON.parse(buf.toString()));
}

async function getWikiImageUrl(wikiTitle) {
  const data = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`);
  return data.thumbnail?.source || null;
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const p of politicians) {
  const filePath = path.join(outDir, `${p.id}.jpg`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 5000) {
    console.log(`✓ ${p.id} already exists`);
    continue;
  }

  try {
    const imageUrl = await getWikiImageUrl(p.wiki);
    if (!imageUrl) {
      console.log(`✗ ${p.id}: no image on Wikipedia`);
      continue;
    }
    const buf = await fetchBuffer(imageUrl);
    if (buf.length < 5000) {
      console.log(`✗ ${p.id}: image too small (${buf.length} bytes), skipping`);
      continue;
    }
    fs.writeFileSync(filePath, buf);
    console.log(`✓ ${p.id}: ${Math.round(buf.length / 1024)}KB`);
  } catch (err) {
    console.log(`✗ ${p.id}: ${err.message}`);
  }
}

console.log("\nDone!");
