/**
 * Verifies the auto-screenshot pure helpers in broker.mjs.
 *
 * The PNG decoder is the risky part: it hand-rolls the unfilter step, so the
 * test encodes the SAME pixels five times, once per PNG filter type, and
 * requires all five to decode back to identical luma. A bug in any single
 * filter branch shows up as one row of the matrix disagreeing with the rest.
 */
import zlib from "node:zlib";
import assert from "node:assert";
import { decodePngToGray, toFingerprint, frameDelta, decideAttach } from "../broker.mjs";

const crc32 = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return (buf) => {
		let c = -1;
		for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
		return (c ^ -1) >>> 0;
	};
})();

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function paeth(a, b, c) {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	return pb <= pc ? b : c;
}

/** Encode raw RGBA with every scanline using the given filter type. */
function encodePng(width, height, rgba, filterType, channels = 4) {
	const stride = width * channels;
	const rows = [];
	const zero = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const cur = rgba.subarray(y * stride, (y + 1) * stride);
		const prev = y === 0 ? zero : rgba.subarray((y - 1) * stride, y * stride);
		const out = Buffer.alloc(stride + 1);
		out[0] = filterType;
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? cur[i - channels] : 0;
			const b = prev[i];
			const c = i >= channels ? prev[i - channels] : 0;
			let v;
			switch (filterType) {
				case 0: v = cur[i]; break;
				case 1: v = cur[i] - a; break;
				case 2: v = cur[i] - b; break;
				case 3: v = cur[i] - ((a + b) >> 1); break;
				case 4: v = cur[i] - paeth(a, b, c); break;
			}
			out[i + 1] = v & 255;
		}
		rows.push(out);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : channels === 2 ? 4 : 0;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

const W = 61, H = 37; // deliberately not multiples of the grid size
const rgba = new Uint8Array(W * H * 4);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >>> 8) & 255;
for (let i = 0; i < W * H; i++) {
	rgba[i * 4] = rnd();
	rgba[i * 4 + 1] = rnd();
	rgba[i * 4 + 2] = rnd();
	rgba[i * 4 + 3] = 255;
}

// --- 1. every filter type must decode to the same image -------------------
let reference = null;
for (const filter of [0, 1, 2, 3, 4]) {
	const png = encodePng(W, H, rgba, filter);
	const img = decodePngToGray(png);
	assert.ok(img, `filter ${filter}: decode returned null`);
	assert.equal(img.width, W);
	assert.equal(img.height, H);
	if (!reference) reference = img.gray;
	else assert.deepEqual(Buffer.from(img.gray), Buffer.from(reference), `filter ${filter} disagrees with filter 0`);
}
// and the luma must match an independent computation
for (let i = 0; i < W * H; i++) {
	const expect = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
	assert.equal(reference[i], expect, `luma mismatch at ${i}`);
}
console.log("ok  PNG decode: filters 0-4 agree, luma exact");

// --- 2. RGB (3 channel) and grayscale also decode -------------------------
const rgb = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
	rgb[i * 3] = rgba[i * 4];
	rgb[i * 3 + 1] = rgba[i * 4 + 1];
	rgb[i * 3 + 2] = rgba[i * 4 + 2];
}
const rgbImg = decodePngToGray(encodePng(W, H, rgb, 4, 3));
assert.ok(rgbImg, "RGB decode returned null");
assert.deepEqual(Buffer.from(rgbImg.gray), Buffer.from(reference), "RGB decode differs from RGBA");
console.log("ok  PNG decode: colorType 2 (RGB) matches colorType 6 (RGBA)");

// --- 3. malformed input must fail closed to null, never throw -------------
for (const [label, bad] of [
	["empty", Buffer.alloc(0)],
	["not a png", Buffer.from("hello world this is not a png at all")],
	["truncated", encodePng(W, H, rgba, 0).subarray(0, 40)],
	["corrupt idat", (() => { const p = encodePng(W, H, rgba, 0); p.fill(0, 60, 90); return p; })()],
]) {
	let result;
	assert.doesNotThrow(() => { result = decodePngToGray(bad); }, `${label} threw`);
	assert.equal(result, null, `${label} should decode to null`);
}
console.log("ok  PNG decode: malformed input returns null without throwing");

// --- 4. fingerprint + change detection ------------------------------------
const flat = (v) => ({ width: 64, height: 64, gray: new Uint8Array(64 * 64).fill(v) });
const base = toFingerprint(flat(100), 32);
assert.equal(base.length, 32 * 32);
assert.ok(base.every((c) => c === 100), "flat image should give a flat fingerprint");

const quiet = { max: 0, mean: 0 };
assert.equal(decideAttach(null, base, quiet).attach, true, "no baseline must always attach");
assert.equal(decideAttach(base, base, quiet).attach, false, "identical frames must not attach");

// a caret-sized change: one cell nudged slightly
const caret = Uint8Array.from(base);
caret[500] = 108;
assert.equal(decideAttach(base, caret, quiet).attach, false, "sub-threshold single-cell change must not attach");

// a toast-sized change: a small localised block goes dark. This is the case a
// global perceptual hash would miss, so it is the important one.
const toast = Uint8Array.from(base);
for (let y = 2; y < 6; y++) for (let x = 24; x < 31; x++) toast[y * 32 + x] = 20;
const toastVerdict = decideAttach(base, toast, quiet);
assert.equal(toastVerdict.attach, true, `localised change must attach, got: ${toastVerdict.reason}`);
console.log("ok  change detection: ignores caret-scale noise, catches a corner toast");

// --- 5. the noise floor must suppress a permanently animating page --------
const spinner = Uint8Array.from(base);
for (let y = 14; y < 18; y++) for (let x = 14; x < 18; x++) spinner[y * 32 + x] = 40;
const loud = frameDelta(base, spinner); // what the page does to itself between frames
assert.equal(decideAttach(base, spinner, quiet).attach, true, "with a quiet page this IS a change");
assert.equal(
	decideAttach(base, spinner, loud).attach,
	false,
	"once the same magnitude is measured as ambient animation it must stop counting",
);
console.log("ok  change detection: ambient animation raises the bar instead of attaching forever");

console.log("\nall assertions passed");
