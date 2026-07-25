#!/usr/bin/env node
/**
 * Chrome tool broker.
 *
 * WHY THIS PROCESS EXISTS
 * -----------------------
 * Chrome shows an "Allow remote debugging?" dialog for EVERY new CDP connection
 * and Google declined to make approval persistent
 * (ChromeDevTools/chrome-devtools-mcp#825, closed as not planned).
 *
 * pi runs one process per session, and several sessions are typically open at
 * once. If each pi process opened its own CDP connection, each one would prompt.
 * So exactly one broker holds the single approved CDP connection, and every pi
 * session talks to it over a unix socket.
 *
 * NO MCP ANYWHERE
 * ---------------
 * There is no MCP server, transport, or JSON-RPC here. The wire protocol is a
 * single newline-terminated JSON request/response per connection.
 *
 * The `chrome-devtools-mcp` npm package is used strictly as a *library* for its
 * tool implementations (Lighthouse, trace processing, a11y snapshots, etc.).
 * Nothing in it speaks MCP in this path -- we import the tool definitions and
 * the ToolHandler glue directly.
 *
 * PROTOCOL
 *   -> {"op":"list"}                      <- {"ok":true,"tools":[{name,description,inputSchema,annotations}]}
 *   -> {"op":"call","name":..,"params":{}} <- {"ok":true,"content":[...],"isError":bool}
 *   -> {"op":"batch","steps":[{name,params}],"stopOnError":bool}
 *                                         <- {"ok":true,"results":[{name,content,isError,skipped}]}
 *   -> {"op":"status"}                    <- {"ok":true,"pid":..,"connected":bool,"tools":N}
 *   -> {"op":"stop"}                      <- {"ok":true}
 *
 * `call` and `batch` additionally accept:
 *   clientId  opaque per-pi-session string. Auto-screenshot baselines are kept
 *             per client, because "has this caller already seen the page?" is a
 *             property of one conversation, not of the shared browser.
 *   autoShot  "on" | "errors" | "off" (default "on"). Session-local, so one pi
 *             session turning it off cannot change another's behaviour.
 *
 * `list` deliberately does NOT touch Chrome, so pi can register tools at startup
 * without triggering the permission dialog. The dialog happens on the first real
 * tool call.
 */

import { connect, createServer } from "node:net";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOCKET = path.join(DIR, "broker.sock");
const PID_FILE = path.join(DIR, "broker.pid");
const LOG_FILE = path.join(DIR, "broker.log");
const CACHE_FILE = path.join(DIR, "tools.json");

const PKG = path.join(DIR, "node_modules", "chrome-devtools-mcp", "build", "src");

/** Chrome release channel to attach to. Anything unrecognised falls back to stable. */
const CHANNELS = new Set(["stable", "beta", "canary", "dev"]);
const CHANNEL = (() => {
	const raw = (process.env.PI_CHROME_CHANNEL ?? "stable").trim().toLowerCase();
	return CHANNELS.has(raw) ? raw : "stable";
})();

/**
 * Flags the upstream tool implementations read. Mirrors chrome-devtools-mcp's
 * CLI defaults, with these deliberate choices:
 *   autoConnect            -> attach to the already-running Chrome (real profile)
 *   allowUnrestrictedPaths -> screenshots/traces can be written outside /tmp
 *                             (the MCP path warned about this because pi never
 *                             negotiated the MCP "roots" capability)
 *   usageStatistics        -> off
 *   categoryExtensions     -> unsupported over autoConnect until Chrome 149
 */
const SERVER_ARGS = {
	autoConnect: true,
	channel: CHANNEL,
	usageStatistics: false,
	performanceCrux: true,
	allowUnrestrictedPaths: true,
	redactNetworkHeaders: true,
	slim: false,
	viaCli: false,
	experimentalPageIdRouting: false,
	experimentalIncludeAllPages: false,
	categoryInput: true,
	categoryNavigation: true,
	categoryEmulation: true,
	categoryPerformance: true,
	categoryNetwork: true,
	categoryDebugging: true,
	categoryMemory: true,
	categoryExtensions: false,
	categoryExperimentalThirdParty: false,
	categoryExperimentalWebmcp: false,
};

/* ===================================================================== *
 *  AUTO-SCREENSHOT
 *
 *  Two rules, both aimed at one problem: the model cannot see the page, and
 *  making it spend a whole turn on take_screenshot after every action is both
 *  slower and far more expensive than deciding on its behalf.
 *
 *    (2) CONDITIONAL ATTACH -- after a visual tool, grab a cheap luma
 *        fingerprint and compare it against the last frame THIS CLIENT was
 *        actually shown. Only pay for a real screenshot when the page moved.
 *        When it did not, say so: "the click did nothing" is precisely the
 *        signal the caller wanted, and it costs one line of text instead of
 *        ~700 tokens of image.
 *
 *    (3) ATTACH ON FAILURE -- when a tool errors, attach unconditionally, no
 *        diff. A failure is exactly the moment the caller's mental model of the
 *        page is known to be wrong, so it is worth the tokens every time.
 *
 *  WHY A GRID FINGERPRINT AND NOT A PERCEPTUAL HASH
 *  ------------------------------------------------
 *  dHash/aHash are built to be INSENSITIVE to small changes -- that is the
 *  point of them. It is also the exact opposite of what is needed here: an
 *  inline validation error, or a toast in one corner, is a small change and is
 *  the entire reason you wanted to look. So instead of one global hash we keep
 *  a coarse grid of mean luma and call it changed when ANY cell moves far
 *  enough. A localised change lights up its own cells; a blinking text caret is
 *  far smaller than a cell and averages away.
 *
 *  WHY THE SETTLE LOOP
 *  -------------------
 *  A frame captured the instant a handler returns lands mid-transition, so the
 *  model reasons about a half-open menu. A fixed sleep would tax every call for
 *  the benefit of the few that animate. Instead, capture fingerprints until two
 *  consecutive ones agree: a static page settles on the second capture (~20ms,
 *  no sleep at all), an animating one costs a few more and then gives up.
 *
 *  Pages that NEVER settle -- spinners, video, carousels -- would otherwise
 *  report "changed" on every single call and attach a screenshot every time,
 *  which is the token blowup this whole mechanism exists to avoid. So the
 *  residual frame-to-frame delta is measured and used as a noise floor: the
 *  change thresholds are raised above whatever the page is doing on its own,
 *  and only movement exceeding the ambient animation counts.
 *
 *  FAIL-OPEN, ALWAYS
 *  -----------------
 *  Every failure path here -- unsupported PNG, open dialog, closed page,
 *  timeout, decode error -- results in no auto-screenshot and nothing else.
 *  This is an enhancement bolted onto a tool call that already succeeded; it
 *  must never be able to turn that success into a failure, and it must never
 *  be able to hang it.
 *
 *  The pure helpers below (decode, fingerprint, diff, decide) are exported so
 *  they can be tested without a browser -- the unfilter step in particular is
 *  hand-rolled and worth asserting against all five PNG filter types.
 * ===================================================================== */

const envNum = (name, dflt) => {
	const v = Number(process.env[name]);
	return Number.isFinite(v) && v >= 0 ? v : dflt;
};

/**
 * Tools worth looking at afterwards. Deliberately an explicit allowlist rather
 * than `annotations.readOnlyHint`, which does not mean what we need: take_snapshot
 * is flagged read-write, wait_for is flagged read-only, and get_network_request is
 * read-write because it can write a file. None of that tracks "did the pixels
 * plausibly change".
 */
const AUTO_SHOT_TOOLS = new Set([
	"click",
	"close_page",
	"drag",
	"emulate",
	"evaluate_script",
	"fill",
	"fill_form",
	"handle_dialog",
	"hover",
	"navigate_page",
	"new_page",
	"press_key",
	"resize_page",
	"select_page",
	"type_text",
	"upload_file",
	"wait_for",
]);

/**
 * Failures worth looking at. take_snapshot earns a screenshot only when it
 * fails, since a snapshot that blew up usually means the page is in a state the
 * a11y tree cannot describe -- an interstitial, a crash, a blank render.
 */
const ERROR_SHOT_TOOLS = new Set([...AUTO_SHOT_TOOLS, "take_snapshot"]);

/**
 * take_screenshot already put the current page in front of the model, so the
 * baseline must move with it. Skip this and the very next click reports
 * "changed" against a stale pre-screenshot frame and attaches a duplicate.
 */
const BASELINE_REFRESH_TOOLS = new Set(["take_screenshot"]);

const FP_GRID = envNum("PI_CHROME_AUTOSHOT_GRID", 32); // fingerprint is FP_GRID x FP_GRID mean-luma cells
const FP_WIDTH = envNum("PI_CHROME_AUTOSHOT_FPWIDTH", 160); // px wide capture the fingerprint is derived from
const SETTLE_DELAYS = [0, 0, 120, 220]; // ms before each successive fingerprint capture
const SETTLE_EPS = envNum("PI_CHROME_AUTOSHOT_SETTLE", 6); // max cell delta at which two frames count as identical
const CELL_DELTA = envNum("PI_CHROME_AUTOSHOT_CELL", 24); // one cell moving this much (0-255) is a change
const MEAN_DELTA = envNum("PI_CHROME_AUTOSHOT_MEAN", 2); // or this much average movement across all cells
const SHOT_MAX_WIDTH = envNum("PI_CHROME_AUTOSHOT_WIDTH", 1000);
const SHOT_QUALITY = envNum("PI_CHROME_AUTOSHOT_QUALITY", 55);
// An explicit take_screenshot means the caller wants a proper look, so it gets
// more detail than the automatic frame -- but still bounded.
const MANUAL_MAX_WIDTH = envNum("PI_CHROME_SHOT_WIDTH", 1400);
const MANUAL_QUALITY = envNum("PI_CHROME_SHOT_QUALITY", 72);
const SHOT_BUDGET_MS = envNum("PI_CHROME_AUTOSHOT_BUDGET", 6000);
const BASELINE_LIMIT = 64;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * WHY THESE CAPTURES BYPASS puppeteer's page.screenshot()
 *
 * Two requirements that puppeteer cannot satisfy at the same time.
 *
 * 1. captureBeyondViewport MUST be false. Puppeteer defaults it to TRUE whenever
 *    a clip is supplied, and a clip is how the capture gets downscaled. That
 *    default makes Chrome resize the visual viewport to cover the rect and then
 *    put it back -- a real relayout of the live page, twice, per capture.
 *    Measured on an isolated Chrome, 10 captures of a static page:
 *      captureBeyondViewport: true   -> 11 resize + 11 vvResize, 43ms each
 *      captureBeyondViewport: false  ->  0 resize +  0 vvResize, 22ms each
 *    Several captures fire per tool call, so the default made the page flicker
 *    continuously. (fromSurface:false also avoids the relayout, but measured
 *    256ms per capture -- twelve times slower. Not an option.)
 *
 * 2. clip.scale MUST survive. It is the entire downscaling mechanism.
 *
 * Puppeteer makes these mutually exclusive. With captureBeyondViewport false it
 * intersects the clip against the visual viewport via getIntersectionRect(),
 * which builds a fresh {x,y,width,height} and DROPS scale; _screenshot then
 * applies `scale: clip.scale ?? 1`. So asking for no flicker silently threw away
 * the downscale, and captures came back at full retina resolution: an 18MB RGBA
 * inflate per fingerprint, and an attached frame roughly 4x its intended token
 * cost. Both regressions were invisible -- the images looked fine.
 *
 * Talking to CDP directly honours scale and captureBeyondViewport together, and
 * as a bonus lets us read the viewport from Page.getLayoutMetrics instead of
 * evaluating JS in the page (faster, and it cannot be blocked by a dialog).
 */
const cdpSessions = new WeakMap();

async function cdpFor(pptrPage) {
	const existing = cdpSessions.get(pptrPage);
	if (existing) return existing;
	const session = await pptrPage.createCDPSession();
	cdpSessions.set(pptrPage, session);
	return session;
}

/** Send one CDP command, retrying once on a fresh session if ours was detached. */
async function cdpSend(pptrPage, method, params) {
	try {
		return await (await cdpFor(pptrPage)).send(method, params);
	} catch (err) {
		cdpSessions.delete(pptrPage);
		const fresh = await pptrPage.createCDPSession();
		cdpSessions.set(pptrPage, fresh);
		return await fresh.send(method, params);
	}
}

async function captureScreenshot(pptrPage, { box, scale, format, quality }) {
	const params = {
		format,
		optimizeForSpeed: true,
		fromSurface: true,
		captureBeyondViewport: false,
		clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale },
	};
	if (quality !== undefined) params.quality = quality;
	const { data } = await cdpSend(pptrPage, "Page.captureScreenshot", params);
	return Buffer.from(data, "base64");
}

/** Hard ceiling on the whole auto-screenshot detour. Resolves null rather than throwing. */
function withBudget(promise, ms) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(null), ms);
		promise.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			() => {
				clearTimeout(timer);
				resolve(null);
			},
		);
	});
}

function paeth(a, b, c) {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	return pb <= pc ? b : c;
}

/**
 * Minimal PNG -> 8-bit grayscale decoder.
 *
 * Node ships zlib but no image codec, and pulling a decoder dependency into the
 * broker to compare two thumbnails is not worth it. Chrome's captureScreenshot
 * emits exactly one shape -- bit depth 8, non-interlaced, RGB/RGBA -- so the
 * long tail of the PNG spec is irrelevant here. Anything unexpected returns
 * null, which the caller treats as "cannot prove it is unchanged" and therefore
 * attaches. Failing toward showing the model too much is the safe direction.
 */
export function decodePngToGray(buf) {
	if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null;
	let off = 8;
	let width = 0;
	let height = 0;
	let depth = 0;
	let color = 0;
	let interlace = 0;
	const idat = [];
	while (off + 8 <= buf.length) {
		const len = buf.readUInt32BE(off);
		const type = buf.toString("ascii", off + 4, off + 8);
		const start = off + 8;
		if (start + len + 4 > buf.length) break;
		if (type === "IHDR") {
			width = buf.readUInt32BE(start);
			height = buf.readUInt32BE(start + 4);
			depth = buf[start + 8];
			color = buf[start + 9];
			interlace = buf[start + 12];
		} else if (type === "IDAT") {
			idat.push(buf.subarray(start, start + len));
		} else if (type === "IEND") {
			break;
		}
		off = start + len + 4;
	}
	if (!width || !height || depth !== 8 || interlace !== 0) return null;
	// 0 gray, 2 RGB, 4 gray+alpha, 6 RGBA. 3 (palette) needs the PLTE chunk and
	// Chrome never emits it for screenshots.
	const channels = color === 0 ? 1 : color === 2 ? 3 : color === 4 ? 2 : color === 6 ? 4 : 0;
	if (!channels) return null;

	let raw;
	try {
		raw = zlib.inflateSync(Buffer.concat(idat));
	} catch {
		return null;
	}
	const stride = width * channels;
	if (raw.length < (stride + 1) * height) return null;

	const gray = new Uint8Array(width * height);
	const cur = new Uint8Array(stride);
	const prev = new Uint8Array(stride);
	let pos = 0;
	for (let y = 0; y < height; y++) {
		const filter = raw[pos++];
		for (let i = 0; i < stride; i++) cur[i] = raw[pos + i];
		pos += stride;
		switch (filter) {
			case 0:
				break;
			case 1:
				for (let i = channels; i < stride; i++) cur[i] = (cur[i] + cur[i - channels]) & 255;
				break;
			case 2:
				for (let i = 0; i < stride; i++) cur[i] = (cur[i] + prev[i]) & 255;
				break;
			case 3:
				for (let i = 0; i < stride; i++) {
					const a = i >= channels ? cur[i - channels] : 0;
					cur[i] = (cur[i] + ((a + prev[i]) >> 1)) & 255;
				}
				break;
			case 4:
				for (let i = 0; i < stride; i++) {
					const a = i >= channels ? cur[i - channels] : 0;
					const c = i >= channels ? prev[i - channels] : 0;
					cur[i] = (cur[i] + paeth(a, prev[i], c)) & 255;
				}
				break;
			default:
				return null;
		}
		const row = y * width;
		if (channels <= 2) {
			for (let x = 0; x < width; x++) gray[row + x] = cur[x * channels];
		} else {
			for (let x = 0; x < width; x++) {
				const o = x * channels;
				// Rec.601 luma in fixed point; exact coefficients do not matter for a diff.
				gray[row + x] = (cur[o] * 77 + cur[o + 1] * 150 + cur[o + 2] * 29) >> 8;
			}
		}
		prev.set(cur);
	}
	return { width, height, gray };
}

/** Box-average a grayscale image down to a grid x grid fingerprint. */
export function toFingerprint(img, grid) {
	const { width, height, gray } = img;
	const out = new Uint8Array(grid * grid);
	for (let gy = 0; gy < grid; gy++) {
		const y0 = Math.floor((gy * height) / grid);
		const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / grid));
		for (let gx = 0; gx < grid; gx++) {
			const x0 = Math.floor((gx * width) / grid);
			const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / grid));
			let sum = 0;
			let n = 0;
			for (let y = y0; y < y1 && y < height; y++) {
				const row = y * width;
				for (let x = x0; x < x1 && x < width; x++) {
					sum += gray[row + x];
					n++;
				}
			}
			out[gy * grid + gx] = n ? Math.round(sum / n) : 0;
		}
	}
	return out;
}

export function frameDelta(a, b) {
	if (!a || !b || a.length !== b.length) return { max: 255, mean: 255 };
	let max = 0;
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = Math.abs(a[i] - b[i]);
		if (d > max) max = d;
		sum += d;
	}
	return { max, mean: sum / a.length };
}

/**
 * The region to capture: what is on screen right now, in CSS document coords.
 *
 * Not `page.viewport()` -- that returns null unless emulation has been set, and
 * we attach to the user's real Chrome. Not {x:0,y:0} either: a clip is
 * interpreted in document space, so hardcoding the origin silently screenshots
 * the top of the page whenever the user has scrolled.
 */
async function viewportBox(pptrPage) {
	const m = await cdpSend(pptrPage, "Page.getLayoutMetrics", {});
	const v = m?.cssVisualViewport ?? m?.visualViewport;
	if (!v) return null;
	const box = {
		x: Math.round(v.pageX ?? 0),
		y: Math.round(v.pageY ?? 0),
		width: Math.round(v.clientWidth ?? 0),
		height: Math.round(v.clientHeight ?? 0),
	};
	if (box.width < 1 || box.height < 1) return null;

	/**
	 * Device pixel ratio, without asking the page.
	 *
	 * clip.scale is expressed against CSS pixels, but a fromSurface capture is
	 * produced in DEVICE pixels, so the output is width * dpr * scale. Ignoring
	 * dpr silently gave us frames at twice the requested width on any Retina
	 * display -- 2000px instead of 1000px, which is 4x the pixels and 4x the
	 * token cost of the attached image.
	 *
	 * getLayoutMetrics returns both flavours: the deprecated `visualViewport` in
	 * device pixels and `cssVisualViewport` in CSS pixels. Their ratio is the dpr
	 * and costs no extra round trip. Guarded, because the deprecated fields are
	 * allowed to disappear and a bogus ratio would be worse than assuming 1.
	 */
	const deviceWidth = m?.visualViewport?.clientWidth;
	const cssWidth = m?.cssVisualViewport?.clientWidth;
	const ratio = deviceWidth && cssWidth ? deviceWidth / cssWidth : 1;
	box.dpr = Number.isFinite(ratio) && ratio >= 1 && ratio <= 4 ? ratio : 1;
	return box;
}

/** Scale factor that lands the capture at `maxWidth` DEVICE pixels or less. */
function scaleFor(box, maxWidth) {
	return Math.min(1, maxWidth / (box.width * (box.dpr || 1)));
}

/**
 * Capture at FP_WIDTH rather than natively and downscaling here.
 *
 * A retina viewport screenshot is ~3024x1544, which inflates to an 18MB RGBA
 * buffer -- 40-80ms to decode, several times per call, purely to throw away
 * 99.7% of the pixels. Letting Chrome do the downscale via the clip scale factor
 * means we decode ~160x82 instead, and we get Chrome's filtering for free, which
 * suppresses exactly the sub-pixel noise we do not want to react to.
 */
async function grabFingerprint(pptrPage, box) {
	const png = await captureScreenshot(pptrPage, {
		box,
		scale: scaleFor(box, FP_WIDTH),
		format: "png",
	});
	const img = decodePngToGray(png);
	if (!img) return null;
	return toFingerprint(img, FP_GRID);
}

/**
 * Fingerprint the page once it stops moving, and report how much it is still
 * moving when it never does. See the settle-loop rationale in the header.
 */
async function settleFingerprint(pptrPage, box) {
	let prev = null;
	let noise = { max: 0, mean: 0 };
	for (let i = 0; i < SETTLE_DELAYS.length; i++) {
		if (SETTLE_DELAYS[i]) await sleep(SETTLE_DELAYS[i]);
		const fp = await grabFingerprint(pptrPage, box);
		if (!fp) return null;
		if (prev) {
			noise = frameDelta(prev, fp);
			if (noise.max <= SETTLE_EPS) return { fp, noise, settled: true };
		}
		prev = fp;
	}
	return { fp: prev, noise, settled: false };
}

/** The frame actually sent to the model: JPEG, capped to maxWidth device pixels. */
async function grabShot(pptrPage, box, maxWidth = SHOT_MAX_WIDTH, quality = SHOT_QUALITY) {
	const buf = await captureScreenshot(pptrPage, {
		box,
		scale: scaleFor(box, maxWidth),
		format: "jpeg",
		quality,
	});
	return { type: "image", mimeType: "image/jpeg", data: buf.toString("base64") };
}

/**
 * Thresholds are lifted above the page's own ambient animation, so a permanent
 * spinner raises the bar for what counts as a real change instead of reporting
 * "changed" forever and attaching a screenshot on every single call.
 */
export function decideAttach(baseline, fp, noise) {
	if (!baseline) return { attach: true, reason: "first look at this page" };
	const d = frameDelta(baseline, fp);
	const maxLimit = Math.max(CELL_DELTA, noise.max * 1.5 + 4);
	const meanLimit = Math.max(MEAN_DELTA, noise.mean * 1.5 + 0.5);
	const detail = `\u0394max ${Math.round(d.max)}/${Math.round(maxLimit)}, \u0394mean ${d.mean.toFixed(1)}/${meanLimit.toFixed(1)}`;
	if (d.max >= maxLimit || d.mean >= meanLimit) return { attach: true, reason: `page changed (${detail})` };
	return { attach: false, reason: `no visual change (${detail})` };
}

// ---------------------------------------------------------------- server side

/**
 * Load the upstream tool implementations.
 *
 * These are DEEP IMPORTS into chrome-devtools-mcp's build output, not its public
 * entry point -- that entry point only speaks MCP, and this broker deliberately
 * does not. The cost is that the paths are private API: a version other than the
 * one pinned in package.json may move or rename them. That is why the dependency
 * is pinned exactly, and why the failure is reported with the fix attached
 * instead of surfacing to the user as "broker did not come up".
 */
async function loadUpstream() {
	try {
		return await Promise.all([
			import(path.join(PKG, "browser.js")),
			import(path.join(PKG, "McpContext.js")),
			import(path.join(PKG, "tools", "tools.js")),
			import(path.join(PKG, "ToolHandler.js")),
			import(path.join(PKG, "utils", "Mutex.js")),
			import("zod-to-json-schema"),
		]);
	} catch (err) {
		throw new Error(
			`cannot load chrome-devtools-mcp internals from ${PKG}: ${err?.message ?? err}\n` +
				`This broker deep-imports that package's build output, so only the pinned version is supported. ` +
				`Fix: (cd ${DIR} && npm ci)`,
		);
	}
}

async function buildServer() {
	const [{ ensureBrowserConnected }, { McpContext }, { createTools }, { ToolHandler }, { Mutex }, { zodToJsonSchema }] =
		await loadUpstream();

	let context;
	let browser;

	async function getContext() {
		const next = await ensureBrowserConnected({ channel: SERVER_ARGS.channel });
		if (context?.browser !== next) {
			// Browser restarted or first use -> (re)build the context.
			context = await McpContext.from(next, undefined, {
				performanceCrux: SERVER_ARGS.performanceCrux,
				allowUnrestrictedPaths: SERVER_ARGS.allowUnrestrictedPaths,
				reconnected: context !== undefined,
			});
		}
		browser = next;
		return context;
	}

	const mutex = new Mutex();
	const handlers = new Map();
	const descriptors = [];

	for (const tool of createTools(SERVER_ARGS)) {
		const handler = new ToolHandler(tool, SERVER_ARGS, getContext, mutex);
		if (!handler.shouldRegister) continue;
		handlers.set(tool.name, handler);
		let inputSchema;
		try {
			inputSchema = zodToJsonSchema(handler.registeredInputSchema, { $refStrategy: "none" });
		} catch {
			inputSchema = { type: "object", properties: {}, additionalProperties: true };
		}
		delete inputSchema.$schema;
		descriptors.push({
			name: tool.name,
			description: tool.description,
			annotations: tool.annotations ?? {},
			inputSchema,
			// Single source of truth for the auto-screenshot policy: the client side
			// reads this to tell the model the behaviour exists, instead of keeping a
			// second copy of the tool list that can drift from this one.
			autoShot: AUTO_SHOT_TOOLS.has(tool.name),
		});
	}

	// Which properties of each tool are arrays. Used to repair the single most
	// common caller mistake (see coerceParams).
	const arrayProps = new Map();
	for (const d of descriptors) {
		const props = d.inputSchema?.properties ?? {};
		const names = Object.entries(props)
			.filter(([, v]) => v?.type === "array")
			.map(([k]) => k);
		if (names.length) arrayProps.set(d.name, names);
	}

	/**
	 * Be liberal in what we accept, for one specific mistake.
	 *
	 * Inside a batch the caller writes `params` as a free-form object, so it gets
	 * none of the per-tool schema guidance it gets when calling the tool directly,
	 * and has to recall each signature from memory. Observed in the wild:
	 *   wait_for {text: "Sign in"}   -- schema wants string[]
	 * That one typo rejected an entire 4-step batch. Wrapping a lone scalar in an
	 * array is unambiguous and cannot change the meaning of a valid call, so we do
	 * it rather than throw away the batch.
	 */
	const coerceParams = (name, params) => {
		const keys = arrayProps.get(name);
		if (!keys || !params || typeof params !== "object") return null;
		let out = null;
		const fixed = [];
		for (const key of keys) {
			const value = params[key];
			if (value === undefined || value === null || Array.isArray(value)) continue;
			out ??= { ...params };
			out[key] = [value];
			fixed.push(key);
		}
		return out ? { params: out, fixed } : null;
	};

	/** Compact rendering of a tool's accepted arguments, for error messages. */
	const describeSchema = (name) => {
		const schema = descriptors.find((d) => d.name === name)?.inputSchema;
		const props = schema?.properties ?? {};
		const required = new Set(schema?.required ?? []);
		const parts = Object.entries(props).map(([k, v]) => {
			const type = v?.type === "array" ? `${v.items?.type ?? "any"}[]` : (v?.type ?? "any");
			return `${k}${required.has(k) ? "" : "?"}: ${type}`;
		});
		return parts.length ? `{ ${parts.join(", ")} }` : "{}";
	};

	/**
	 * The MCP SDK normally zod-parses params before invoking the handler, which is
	 * what APPLIES SCHEMA DEFAULTS (e.g. take_screenshot's `format: "png"`).
	 * ToolHandler.handle() does not do this itself, so parse here or tools silently
	 * receive `undefined` for defaulted fields. Throws a readable Error on bad input.
	 */
	const parseParams = (name, params, notes) => {
		const handler = handlers.get(name);
		if (!handler) {
			throw new Error(`Unknown tool: ${name}. Available: ${[...handlers.keys()].sort().join(", ")}`);
		}
		try {
			return handler.registeredInputSchema.parse(params ?? {});
		} catch (err) {
			const coerced = coerceParams(name, params);
			if (coerced) {
				try {
					const parsed = handler.registeredInputSchema.parse(coerced.params);
					notes?.push(`${name}: wrapped ${coerced.fixed.join(", ")} in an array (schema expects a list)`);
					return parsed;
				} catch {
					/* coercion did not help; report the original problem */
				}
			}
			const issues = (err?.issues ?? [])
				.map((i) => `${i.path?.join(".") || "(root)"}: ${i.message}`)
				.join("; ");
			// Include the signature: the caller usually retries immediately, and a
			// bare "Expected array" makes it guess again.
			throw new Error(`Invalid arguments for ${name}: ${issues || err?.message}. Accepts ${describeSchema(name)}`);
		}
	};

	/**
	 * Last frame each client was actually shown, keyed by pi session.
	 *
	 * NOT global. The whole point of this broker is that several pi sessions share
	 * one browser, so a single baseline would let session A's screenshot suppress
	 * session B's -- B would be told "no visual change" about a page it has never
	 * seen. The baseline models one conversation's knowledge, not the browser's
	 * state, so it is per conversation.
	 */
	const baselines = new Map();
	const autoShotStats = { attached: 0, skipped: 0, errors: 0 };

	const setBaseline = (clientId, fp) => {
		baselines.delete(clientId);
		baselines.set(clientId, fp);
		// Sessions come and go; bound the map rather than leak one entry per pi run.
		while (baselines.size > BASELINE_LIMIT) baselines.delete(baselines.keys().next().value);
	};

	/**
	 * Decide on, and if warranted produce, the auto-screenshot for one tool call.
	 * Returns extra content blocks to append, or null. Never throws.
	 */
	const autoShot = async ({ clientId, tool, isError, mode }) => {
		if (mode === "off") return null;
		const wantShot = isError ? ERROR_SHOT_TOOLS.has(tool) : mode === "on" && AUTO_SHOT_TOOLS.has(tool);
		const wantRefresh = !isError && BASELINE_REFRESH_TOOLS.has(tool);
		if (!wantShot && !wantRefresh) return null;

		let mcpPage;
		try {
			mcpPage = context?.getSelectedMcpPage();
		} catch {
			return null; // no page selected, or it was just closed
		}
		const pptrPage = mcpPage?.pptrPage;
		if (!pptrPage || pptrPage.isClosed()) return null;
		// A native dialog blocks both page.evaluate and captureScreenshot forever.
		// The budget below would eventually cut us loose, but only after stalling the
		// tool call for seconds, so check first.
		try {
			if (mcpPage.getDialog()) return null;
		} catch {
			return null;
		}

		return withBudget(
			(async () => {
				// Resolve the capture region ONCE per tool call. It was previously
				// re-read before every capture, which added three or four CDP round
				// trips per call for a rectangle that cannot meaningfully change
				// across the few hundred milliseconds of a settle loop.
				const box = await viewportBox(pptrPage);
				if (!box) return null;

				const settled = await settleFingerprint(pptrPage, box);
				if (!settled) return null;

				if (wantRefresh) {
					setBaseline(clientId, settled.fp);
					return null;
				}

				if (isError) {
					/**
					 * Attach on failure, but not the same frame over and over.
					 *
					 * Observed in a real session: six clicks failed in a row against the
					 * same unchanged page and each one attached a near-identical
					 * screenshot. The first is worth every token; the rest are pure
					 * waste. If the page is indistinguishable from the frame this client
					 * was last shown, the caller is already looking at the failure state.
					 */
					/**
					 * Reuse the SAME judgement as the success path rather than a stricter
					 * one. This first used SETTLE_EPS (6), which is a "two consecutive
					 * captures agree" tolerance, not a "human would notice" one -- the
					 * focus ring left by a click alone measures around 19. The result was
					 * that identical failures deduped or did not depending on rendering
					 * noise, which is exactly the kind of coin-flip behaviour that makes a
					 * feature untrustworthy.
					 */
					const baseline = baselines.get(clientId);
					if (baseline && !decideAttach(baseline, settled.fp, settled.noise).attach) {
						autoShotStats.skipped++;
						return [
							{
								type: "text",
								text: "[auto-screenshot: call failed, but the page is identical to the frame you were last shown \u2014 no new screenshot]",
							},
						];
					}
					const image = await grabShot(pptrPage, box);
					if (!image) return null;
					setBaseline(clientId, settled.fp);
					autoShotStats.errors++;
					return [
						{ type: "text", text: "[auto-screenshot: attached because the call failed. This is the current page.]" },
						image,
					];
				}

				const verdict = decideAttach(baselines.get(clientId), settled.fp, settled.noise);
				if (!verdict.attach) {
					autoShotStats.skipped++;
					// Worth a line even though nothing is attached: "the click did nothing"
					// is a real result, and without it the model assumes the page moved.
					return [{ type: "text", text: `[auto-screenshot: ${verdict.reason}]` }];
				}

				const image = await grabShot(pptrPage, box);
				if (!image) return null;
				setBaseline(clientId, settled.fp);
				autoShotStats.attached++;
				const animating = settled.settled ? "" : "; still animating, may be mid-transition";
				// Say plainly that this IS the current view. Without it the model treats
				// the attachment as incidental and calls take_screenshot anyway.
				return [
					{ type: "text", text: `[auto-screenshot: ${verdict.reason}${animating}. This is the current page.]` },
					image,
				];
			})(),
			SHOT_BUDGET_MS,
		);
	};

	/**
	 * Serve a plain viewport take_screenshot ourselves.
	 *
	 * Telling the model not to take redundant screenshots did not work. Measured
	 * across three sessions, take_screenshot stayed at 17% / 18% / 20% of all
	 * browser calls before and after the tool descriptions were changed to say so.
	 * So stop trying to forbid it and make it cheap instead, which helps equally
	 * when the screenshot IS warranted.
	 *
	 * Upstream hands back a full Retina PNG. At 3024x1544 that trips its own
	 * 2,000,000-byte inline limit, so it writes a temp file and answers with a
	 * path -- forcing a SECOND tool call to read the image back, which then costs
	 * ~2,700 tokens. Routing the common case through the same clip+scale path as
	 * the auto frame returns ~1,300 tokens inline, in one call, with no relayout.
	 *
	 * Only the plain case. A filePath, an element uid or fullPage all mean the
	 * caller wants something this path cannot produce, so those go to upstream
	 * untouched -- as does any failure here.
	 */
	const isPlainViewportShot = (name, p) =>
		name === "take_screenshot" && !p?.filePath && !p?.uid && p?.fullPage !== true;

	const servePlainShot = async (clientId) => {
		let mcpPage;
		try {
			mcpPage = context?.getSelectedMcpPage();
			if (mcpPage.getDialog()) return null;
		} catch {
			return null;
		}
		const pptrPage = mcpPage?.pptrPage;
		if (!pptrPage || pptrPage.isClosed()) return null;

		return withBudget(
			(async () => {
				const box = await viewportBox(pptrPage);
				if (!box) return null;
				const image = await grabShot(pptrPage, box, MANUAL_MAX_WIDTH, MANUAL_QUALITY);
				if (!image) return null;
				// The caller has now seen the page, so move the baseline with it or the
				// next action reports a change against a frame that is already stale.
				const fp = await grabFingerprint(pptrPage, box);
				if (fp) setBaseline(clientId, fp);
				return {
					content: [{ type: "text", text: "Took a screenshot of the current page's viewport." }, image],
					isError: false,
				};
			})(),
			SHOT_BUDGET_MS,
		);
	};

	/** Dispatch one already-validated tool call, with the screenshot shortcut applied. */
	const runOne = async (name, params, clientId) => {
		if (isPlainViewportShot(name, params)) {
			const served = await servePlainShot(clientId);
			if (served) return served;
		}
		return await handlers.get(name).handle(params);
	};

	return {
		descriptors,
		isConnected: () => Boolean(browser?.connected),
		autoShotStats: () => ({ ...autoShotStats }),
		call: async (name, params, opts = {}) => {
			const notes = [];
			let parsed;
			try {
				parsed = parseParams(name, params, notes);
			} catch (err) {
				// Schema rejection never reached the browser, so there is nothing new to see.
				return { content: [{ type: "text", text: err.message }], isError: true };
			}
			const out = await runOne(name, parsed, opts.clientId ?? "default");
			if (notes.length) {
				out.content = [{ type: "text", text: `[auto-corrected] ${notes.join("; ")}` }, ...(out.content ?? [])];
			}
			const extra = await autoShot({
				clientId: opts.clientId ?? "default",
				tool: name,
				isError: Boolean(out.isError),
				mode: opts.mode ?? "on",
			});
			if (extra?.length) out.content = [...(out.content ?? []), ...extra];
			return out;
		},
		/**
		 * Run several tools back-to-back inside one request.
		 *
		 * Validates EVERY step before running ANY of them. A typo in step 4 must not
		 * leave the browser half-mutated by steps 1-3, and reporting all schema errors
		 * at once is the whole point of batching: the caller fixes them in one turn
		 * instead of discovering them one failed round-trip at a time.
		 */
		batch: async (steps, stopOnError, opts = {}) => {
			const parsed = [];
			const errors = [];
			const notes = [];
			steps.forEach((step, i) => {
				try {
					parsed.push({ name: step.name, params: parseParams(step.name, step.params, notes) });
				} catch (err) {
					parsed.push(undefined);
					errors.push(`step ${i + 1} (${step.name}): ${err.message}`);
				}
			});
			if (errors.length) {
				throw new Error(`batch rejected, nothing executed:\n${errors.join("\n")}`);
			}

			const results = [];
			let aborted = false;
			let last;
			for (const { name, params } of parsed) {
				if (aborted) {
					results.push({ name, skipped: true });
					continue;
				}
				let out;
				try {
					out = await runOne(name, params, opts.clientId ?? "default");
				} catch (err) {
					// handle() catches its own errors, so this is a broker-side surprise.
					out = { content: [{ type: "text", text: err?.message ?? String(err) }], isError: true };
				}
				const entry = { name, content: out.content ?? [], isError: Boolean(out.isError) };
				results.push(entry);
				last = entry;
				if (out.isError && stopOnError) aborted = true;
			}

			/**
			 * One auto-screenshot for the whole batch, after the last step that ran.
			 *
			 * Per-step would attach up to 20 images to a single tool result, which is
			 * the opposite of why anyone batches. The intermediate states are exactly
			 * what the caller chose to skip past; only where it ended up is news. With
			 * stopOnError the last executed step is also the failing one, so rule 3
			 * still fires on the frame that matters.
			 */
			if (last) {
				const extra = await autoShot({
					clientId: opts.clientId ?? "default",
					tool: last.name,
					isError: last.isError,
					mode: opts.mode ?? "on",
				});
				if (extra?.length) last.content = [...last.content, ...extra];
			}

			/**
			 * Hand back a fresh snapshot whenever a batch aborts.
			 *
			 * The dominant batch failure is a `uid` that is stale or not yet
			 * interactive, and the caller cannot retry it: every uid it holds came
			 * from a snapshot taken before the page changed. Observed twice in one
			 * session, and both times the caller gave up on uid interaction entirely
			 * and burned two extra turns driving the page through evaluate_script.
			 * Attaching current uids turns that two-turn detour into an immediate
			 * retry. Best-effort: a failed snapshot must not mask the real error.
			 */
			let recovery;
			if (aborted && handlers.has("take_snapshot")) {
				try {
					const snap = await handlers.get("take_snapshot").handle({});
					if (!snap?.isError) recovery = snap?.content ?? undefined;
				} catch {
					recovery = undefined;
				}
			}
			return { results, aborted, recovery, notes };
		},
	};
}

/**
 * Serializes whole requests, so a batch runs atomically.
 *
 * chrome-devtools-mcp's own Mutex is taken and released INSIDE each
 * ToolHandler.handle() call and is not reentrant, so a batch cannot hold it
 * across steps. Without an outer lock, a second pi session's tool call could
 * land between two steps of a batch and navigate the page out from under it.
 *
 * Wrapping at this level is deadlock-free: only one locked operation runs at a
 * time, so the inner Mutex is always uncontended when handle() reaches for it.
 */
function createLock() {
	let tail = Promise.resolve();
	return (fn) => {
		const result = tail.then(fn);
		tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};
}

/**
 * Keep the broker alive through bugs in code we do not control.
 *
 * WHY THIS IS THE RIGHT LAYER
 * ---------------------------
 * This process holds the ONE CDP connection the user approved. If it dies,
 * every in-flight tool call is dropped mid-response (clients see a truncated
 * socket) and Chrome re-shows "Allow remote debugging?" -- exactly the thing
 * this broker exists to avoid. Process death is a far worse outcome than any
 * single failed tool call, so the daemon must not inherit Node's default
 * "crash on unhandled error" policy.
 *
 * chrome-devtools-mcp bundles the whole DevTools front-end, which was written
 * for a browser. It throws from CDP event handlers that no frame of ours is on
 * the stack for, so try/catch around tool calls cannot help. Known example:
 *
 *   DebuggerModel.pausedScript()  ->  fireEvent(name, detail, target = window)
 *   ReferenceError: window is not defined
 *
 * fired via `void this.#debuggerModel.pausedScript(...)` (unawaited) whenever
 * Chrome sends `Debugger.paused` -- e.g. a `debugger` trap on photopea.com
 * beating the fire-and-forget `setSkipAllPauses` in DevtoolsUtils.js.
 *
 * WHY NOT PATCH THE BUNDLED LINE INSTEAD
 * --------------------------------------
 * Tried and rejected. `fireEvent()` is the LAST statement in `pausedScript`
 * and the call is unawaited, so swallowing the rejection leaves byte-identical
 * state to making `fireEvent` a no-op. A source patch would buy nothing over
 * this barrier while adding a postinstall hook, a mutated node_modules tree,
 * and an exact-string match that silently stops applying on the next upgrade.
 *
 * WHAT THIS DELIBERATELY DOES NOT FIX
 * -----------------------------------
 * If the renderer really is paused at a `debugger` statement, it stays paused;
 * neither this barrier nor a source patch resumes it. That surfaces as tool
 * calls timing out, not as a dead broker. Counts are tracked and surfaced via
 * `status` (and `/chrome status`) so a swallowed error is observable rather
 * than silent.
 */
const survived = { total: 0, last: undefined, byMessage: new Map() };

// A debugger trap can fire on a timer, so an unthrottled handler would race the
// disk. Log the first few of each distinct message in full, then sample.
const LOG_BURST = 3;
const LOG_SAMPLE = 100;

function installCrashBarrier() {
	const record = (kind, err) => {
		const message = `${kind}: ${err?.message ?? String(err)}`;
		const at = new Date().toISOString();
		survived.total++;
		survived.last = { message, at };
		const seen = survived.byMessage.get(message) ?? { count: 0 };
		seen.count++;
		seen.lastAt = at;
		survived.byMessage.set(message, seen);

		if (seen.count <= LOG_BURST) {
			console.error(`[chrome-broker] survived ${kind} (#${seen.count}): ${err?.stack ?? err}`);
		} else if (seen.count % LOG_SAMPLE === 0) {
			console.error(`[chrome-broker] survived ${kind} x${seen.count} (repeating): ${message}`);
		}
	};
	process.on("uncaughtException", (err) => record("uncaughtException", err));
	process.on("unhandledRejection", (err) => record("unhandledRejection", err));
}

async function serve() {
	installCrashBarrier();

	/**
	 * Lose the startup race quietly.
	 *
	 * ensureBroker() is called lazily from every pi session, so two sessions can
	 * both find no broker and both spawn one. Unlinking the socket unconditionally
	 * (which this used to do) let the second broker steal a LIVE socket: clients
	 * would then be split across two brokers, each opening its own CDP connection,
	 * so Chrome prompts twice -- precisely the thing this process exists to
	 * prevent. The socket is the identity of the one approved connection, so only
	 * a dead one may be removed.
	 */
	if (existsSync(SOCKET)) {
		if (await isHealthy(2000)) {
			console.log("[chrome-broker] another broker is already listening; exiting");
			return;
		}
		try {
			unlinkSync(SOCKET);
		} catch {
			/* ignore */
		}
	}

	const server = await buildServer();
	const withLock = createLock();
	// Cache descriptors so pi sessions can register tools instantly (and offline)
	// without waiting on, or waking, the broker.
	writeFileSync(CACHE_FILE, JSON.stringify(server.descriptors, null, 2));

	const net = createServer((socket) => {
		let buf = "";
		// The protocol is exactly one request per connection. Without this guard a
		// request split across chunks so that the newline lands in the first one
		// would be executed again for every later chunk, since `buf` is never
		// consumed -- running a mutating tool call twice.
		let handled = false;
		socket.on("data", async (chunk) => {
			if (handled) return;
			buf += chunk;
			const nl = buf.indexOf("\n");
			if (nl < 0) return;
			handled = true;
			let req;
			try {
				req = JSON.parse(buf.slice(0, nl));
			} catch (err) {
				socket.end(JSON.stringify({ ok: false, error: `bad request: ${err.message}` }) + "\n");
				return;
			}
			let res;
			try {
				switch (req.op) {
					case "list":
						res = { ok: true, tools: server.descriptors };
						break;
					case "status":
						res = {
							ok: true,
							pid: process.pid,
							connected: server.isConnected(),
							tools: server.descriptors.length,
							survived: { total: survived.total, last: survived.last },
							autoShot: server.autoShotStats(),
						};
						break;
					case "stop":
						res = { ok: true };
						setTimeout(() => process.exit(0), 50);
						break;
					case "call": {
						const opts = { clientId: req.clientId, mode: req.autoShot };
						const out = await withLock(() => server.call(req.name, req.params, opts));
						res = { ok: true, content: out.content ?? [], isError: Boolean(out.isError) };
						break;
					}
					case "batch": {
						const steps = Array.isArray(req.steps) ? req.steps : [];
						if (!steps.length) throw new Error("batch requires a non-empty steps array");
						const stopOnError = req.stopOnError !== false;
						const opts = { clientId: req.clientId, mode: req.autoShot };
						const out = await withLock(() => server.batch(steps, stopOnError, opts));
						res = { ok: true, results: out.results, aborted: out.aborted, recovery: out.recovery, notes: out.notes };
						break;
					}
					default:
						res = { ok: false, error: `unknown op: ${req.op}` };
				}
			} catch (err) {
				res = { ok: false, error: err?.message ?? String(err) };
			}
			socket.end(JSON.stringify(res) + "\n");
		});
		socket.on("error", () => undefined);
	});

	// Closes the remaining window in the race above: if both brokers got past the
	// probe, whoever binds second gets EADDRINUSE and must give up rather than let
	// the crash barrier keep a broker alive that serves nobody.
	net.on("error", (err) => {
		console.error(`[chrome-broker] cannot listen on ${SOCKET}: ${err?.message ?? err}`);
		process.exit(1);
	});

	net.listen(SOCKET, () => {
		writeFileSync(PID_FILE, String(process.pid));
		console.log(`[chrome-broker] listening on ${SOCKET} (${server.descriptors.length} tools)`);
	});

	const shutdown = () => {
		try {
			net.close();
		} catch {
			/* ignore */
		}
		rmSync(SOCKET, { force: true });
		rmSync(PID_FILE, { force: true });
		process.exit(0);
	};
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

// ---------------------------------------------------------------- client side

export function request(payload, timeoutMs = 180_000) {
	return new Promise((resolve, reject) => {
		const socket = connect(SOCKET);
		let buf = "";
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`broker timeout after ${timeoutMs}ms`));
		}, timeoutMs);
		socket.on("connect", () => socket.write(JSON.stringify(payload) + "\n"));
		socket.on("data", (d) => (buf += d));
		socket.on("end", () => {
			clearTimeout(timer);
			// A closed socket with no/partial payload means the broker died mid-request,
			// not that it sent us malformed JSON. Say so: the recovery (and the reason
			// Chrome is about to re-prompt) is completely different.
			if (!buf.trim()) {
				reject(new Error(`broker died mid-request (no response); see ${LOG_FILE}`));
				return;
			}
			try {
				resolve(JSON.parse(buf));
			} catch {
				reject(new Error(`broker died mid-request (truncated response); see ${LOG_FILE}`));
			}
		});
		socket.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

export function readPid() {
	try {
		const pid = Number(readFileSync(PID_FILE, "utf8").trim());
		process.kill(pid, 0);
		return pid;
	} catch {
		return undefined;
	}
}

/**
 * Last few lines of the broker log.
 *
 * A broker that fails during startup (missing or mismatched dependencies, no
 * Chrome) writes the real reason here and then exits, and the client would
 * otherwise only ever see "did not come up within 30s" -- true, useless, and it
 * sends the user reading log files instead of fixing the problem.
 */
function logTail(lines = 6) {
	try {
		return readFileSync(LOG_FILE, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
	} catch {
		return "";
	}
}

export function readCachedTools() {
	try {
		return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
	} catch {
		return undefined;
	}
}

export async function isHealthy(timeoutMs = 3000) {
	try {
		const r = await request({ op: "status" }, timeoutMs);
		return Boolean(r?.ok);
	} catch {
		return false;
	}
}

/** Start the broker detached if it isn't already answering. Idempotent. */
export async function ensureBroker({ wait = 20_000 } = {}) {
	if (await isHealthy(2000)) return { started: false };

	// Stale socket/pid from a crashed broker.
	if (!readPid()) rmSync(SOCKET, { force: true });

	mkdirSync(DIR, { recursive: true });
	const logFd = openSync(LOG_FILE, "a");
	const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], {
		detached: true,
		stdio: ["ignore", logFd, logFd],
	});
	child.unref();

	const deadline = Date.now() + wait;
	while (Date.now() < deadline) {
		if (await isHealthy(1500)) return { started: true };
		await new Promise((r) => setTimeout(r, 300));
	}
	const tail = logTail();
	throw new Error(
		`broker did not come up within ${Math.round(wait / 1000)}s (see ${LOG_FILE})${tail ? `:\n${tail}` : ""}`,
	);
}

/**
 * Stop the broker and WAIT for it to actually be gone.
 *
 * The `stop` op answers before exiting (it has to -- the reply travels over the
 * socket it is about to close), so returning as soon as the reply lands means
 * the broker is still listening. Anything that stops and immediately restarts
 * then hits the dying broker: `ensure` reports "already running", the process
 * exits a moment later, and there is now no broker at all. Callers used to paper
 * over this with a sleep; waiting here fixes it for all of them.
 */
export async function stopBroker() {
	if (!(await isHealthy(2000))) {
		rmSync(SOCKET, { force: true });
		rmSync(PID_FILE, { force: true });
		return false;
	}
	await request({ op: "stop" }, 5000).catch(() => undefined);
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		if (!(await isHealthy(1000))) return true;
		await new Promise((r) => setTimeout(r, 100));
	}
	// Still answering after 5s: report success anyway rather than block a restart
	// forever. ensureBroker() will find it healthy and reuse it, which is safe.
	return true;
}

// ---------------------------------------------------------------------- CLI

async function main() {
	const cmd = process.argv[2] ?? "status";
	switch (cmd) {
		case "serve":
			await serve();
			break;
		case "ensure": {
			const r = await ensureBroker();
			console.log(r.started ? "started" : "already running");
			break;
		}
		case "status": {
			const healthy = await isHealthy();
			if (!healthy) {
				console.log("broker: not running");
				process.exit(1);
			}
			const r = await request({ op: "status" });
			console.log(`broker: running (pid ${r.pid}), chrome connected: ${r.connected}, tools: ${r.tools}`);
			if (r.autoShot) {
				console.log(
					`auto-screenshot: ${r.autoShot.attached} attached, ${r.autoShot.skipped} skipped (no change), ${r.autoShot.errors} on failure`,
				);
			}
			if (r.survived?.total) {
				console.log(`survived ${r.survived.total} error(s); last: ${r.survived.last?.message} at ${r.survived.last?.at}`);
			}
			break;
		}
		case "stop":
			console.log((await stopBroker()) ? "stopped" : "not running");
			break;
		case "restart":
			// No sleep needed: stopBroker() waits for the socket to stop answering.
			await stopBroker();
			await ensureBroker();
			console.log("restarted");
			break;
		case "tools": {
			const r = await request({ op: "list" });
			for (const t of r.tools) console.log(`${t.name.padEnd(28)} ${t.annotations?.category ?? ""}`);
			console.log(`\n${r.tools.length} tools`);
			break;
		}
		default:
			console.error("usage: broker.mjs [serve|ensure|status|stop|restart|tools]");
			process.exit(2);
	}
}

if (process.argv[1] && path.basename(process.argv[1]) === "broker.mjs") {
	main().catch((err) => {
		console.error(`[chrome-broker] ${err.message}`);
		process.exit(1);
	});
}
