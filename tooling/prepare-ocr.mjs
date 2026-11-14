// Static, same-origin assets. Only the worker, one compatible WASM build,
// and the two recognition models are downloaded when the first photo is used.
import { copyFile, mkdir } from "node:fs/promises";
const out = "public/receipt-ocr";
await mkdir(out, { recursive: true });
const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js/dist/worker.min.js.LICENSE.txt", "worker.min.js.LICENSE.txt"],
  ["tesseract.js/LICENSE.md","LICENSE-tesseract.txt"],
  ["tesseract.js-core/LICENSE","LICENSE-core.txt"],
  ...["lstm","simd-lstm","relaxedsimd-lstm"].map(flavor=>{
    const file = `tesseract-core-${flavor}.wasm.js`;
    return [`tesseract.js-core/${file}`,file];
  }),
  ...["kor","eng"].map(lang=>[`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,`${lang}.traineddata.gz`])
];
await Promise.all(files.map(([src,dest])=>copyFile(`node_modules/${src}`,`${out}/${dest}`)));
