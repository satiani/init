/**
 * End-to-end: drive the real broker over its unix socket and check that the
 * auto-screenshot rules fire where they should and stay quiet where they should.
 */
import { request } from "../broker.mjs";

// Fresh ids every run. The broker keeps a baseline per client for as long as it
// lives, so reusing an id makes the run depend on whatever the previous run
// left behind -- "first look" stops being a first look, and the per-client
// isolation check silently passes for the wrong reason.
const RUN = Math.random().toString(36).slice(2, 8);
const CLIENT = `e2e-${RUN}`;
const call = (name, params = {}, autoShot = "on", clientId = CLIENT) =>
	request({ op: "call", name, params, clientId, autoShot }, 120_000);

function summarise(res) {
	const content = res.content ?? [];
	const texts = content.filter((c) => c.type === "text").map((c) => c.text);
	const images = content.filter((c) => c.type === "image");
	return {
		isError: Boolean(res.isError),
		shotNote: texts.find((t) => t.startsWith("[auto-screenshot")),
		imageCount: images.length,
		imageKB: images.length ? Math.round(Buffer.from(images[0].data, "base64").length / 1024) : 0,
	};
}

const results = [];
function check(label, cond, detail) {
	results.push({ label, ok: Boolean(cond), detail });
	console.log(`${cond ? "ok  " : "FAIL"} ${label}${detail ? `  \u2014 ${detail}` : ""}`);
}

const HTML = `<!doctype html><meta charset=utf-8>
<style>body{font:16px system-ui;margin:40px;background:#fff}
#toast{position:fixed;top:10px;right:10px;background:#c00;color:#fff;padding:8px 14px;border-radius:6px;display:none}</style>
<h1>autoshot harness</h1><p>initial content</p>
<button id=a onclick="document.getElementById('toast').style.display='block'">show toast</button>
<button id=b onclick="void 0">does nothing</button>
<div id=toast>saved</div>`;
const PAGE = `data:text/html,${encodeURIComponent(HTML)}`;

/** uid of a control, skipping the RootWebArea line (its url echoes the whole page). */
async function uidFor(label) {
	const snap = await call("take_snapshot", {}, "off");
	const text = (snap.content ?? []).map((c) => c.text ?? "").join("\n");
	const line = text.split("\n").find((l) => !l.includes("RootWebArea") && l.includes(`"${label}"`));
	const uid = line?.match(/uid=(\S+)/)?.[1];
	if (!uid) throw new Error(`no uid for ${label} in:\n${text.slice(0, 600)}`);
	return uid;
}

console.log("--- new_page (first look) ---");
let s = summarise(await call("new_page", { url: PAGE }));
console.log(JSON.stringify(s));
check("first look at a page attaches a screenshot", s.imageCount === 1, s.shotNote);

console.log('\n--- click "does nothing" ---');
s = summarise(await call("click", { uid: await uidFor("does nothing") }));
console.log(JSON.stringify(s));
check("a click that changes nothing attaches NO image", s.imageCount === 0, s.shotNote);
check("...and says so explicitly", /no visual change/.test(s.shotNote ?? ""), s.shotNote);

console.log('\n--- click "show toast" (small corner change) ---');
const toastUid = await uidFor("show toast");
s = summarise(await call("click", { uid: toastUid }));
console.log(JSON.stringify(s));
check("a small corner change DOES attach an image", s.imageCount === 1, s.shotNote);
check("attached frame is small", s.imageKB > 0 && s.imageKB < 400, `${s.imageKB}KB`);

console.log("\n--- click it again (toast already shown, nothing changes) ---");
s = summarise(await call("click", { uid: toastUid }));
console.log(JSON.stringify(s));
check("repeating a no-op click stays quiet", s.imageCount === 0, s.shotNote);

// The page here is identical to the frame the last successful click attached,
// so the dedupe is expected to suppress the image. What must NOT be lost is the
// error itself.
console.log("\n--- bogus uid on a page already shown (fails, but nothing new to see) ---");
s = summarise(await call("click", { uid: `${toastUid}_gone` }));
console.log(JSON.stringify(s));
check("a failed call is reported as an error", s.isError === true);
check("a failure on an already-shown page does not re-attach", s.imageCount === 0, s.shotNote);
check("...and explains why", /identical to the frame you were last shown/.test(s.shotNote ?? ""), s.shotNote);

console.log('\n--- mode "off" on a real state change ---');
await call("navigate_page", { url: PAGE }, "off");
s = summarise(await call("click", { uid: await uidFor("show toast") }, "off"));
console.log(JSON.stringify(s));
check('mode "off" attaches nothing and adds no note', s.imageCount === 0 && !s.shotNote);

console.log('\n--- mode "errors" on a SUCCEEDING call that changes the page ---');
await call("navigate_page", { url: PAGE }, "off");
s = summarise(await call("click", { uid: await uidFor("show toast") }, "errors"));
console.log(JSON.stringify(s));
check('mode "errors" stays quiet when the call succeeds', s.imageCount === 0 && !s.shotNote);

// Fresh client: CLIENT has already been shown this exact view earlier in the
// run, and the failure dedupe would (correctly) suppress the image for it. The
// thing under test here is the MODE, so isolate it from the dedupe.
console.log('\n--- mode "errors" on a FAILING call ---');
s = summarise(await call("click", { uid: "definitely_not_a_uid" }, "errors", `errmode-${RUN}`));
console.log(JSON.stringify(s));
check('mode "errors" still attaches on failure', s.imageCount === 1, s.shotNote);

console.log("\n--- per-client baselines ---");
await call("navigate_page", { url: PAGE }, "off");
const sharedUid = await uidFor("show toast");
const mine = summarise(await call("click", { uid: sharedUid }, "on", `session-A-${RUN}`));
const theirs = summarise(await call("click", { uid: sharedUid }, "on", `session-B-${RUN}`));
console.log(`A: ${JSON.stringify(mine)}\nB: ${JSON.stringify(theirs)}`);
check("session A sees the page", mine.imageCount === 1, mine.shotNote);
check("session B is NOT suppressed by session A having seen it", theirs.imageCount === 1, theirs.shotNote);

console.log("\n--- batch: one shot for the whole batch ---");
const batch = await request(
	{
		op: "batch",
		steps: [
			{ name: "navigate_page", params: { url: PAGE } },
			{ name: "wait_for", params: { text: ["autoshot harness"] } },
		],
		stopOnError: true,
		clientId: CLIENT,
		autoShot: "on",
	},
	180_000,
);
const imgs = (batch.results ?? []).flatMap((r) => (r.content ?? []).filter((c) => c.type === "image"));
console.log(JSON.stringify({ steps: batch.results?.length, images: imgs.length }));
check("a 2-step batch attaches at most one image", imgs.length <= 1, `${imgs.length} images`);

// The page can see its own relayouts, so it can testify about flicker.
console.log("\n--- captures must not relayout the page (flicker regression) ---");
const PROBE = `${HTML}<script>window.__ev={n:0};addEventListener('resize',()=>window.__ev.n++);visualViewport.addEventListener('resize',()=>window.__ev.n++);<\/script>`;
await call("navigate_page", { url: `data:text/html,${encodeURIComponent(PROBE)}` }, "off");
const probeUid = await uidFor("does nothing");
// Reset AFTER the snapshot: take_snapshot does its own layout work, and counting
// that here would blame auto-screenshot for something it did not do.
await call("evaluate_script", { function: "() => { window.__ev = {n:0}; return 1; }" }, "off");
for (let i = 0; i < 5; i++) await call("click", { uid: probeUid });
const evRes = await call("evaluate_script", { function: "() => window.__ev.n" }, "off");
const relayouts = Number(
	(evRes.content ?? [])
		.map((c) => c.text ?? "")
		.join(" ")
		.match(/\d+/g)
		?.pop() ?? -1,
);
/**
 * Threshold, not zero. This runs against the user's live Chrome, where focus
 * changes and other tabs produce the occasional incidental resize, so an
 * exact-zero assertion flaps. What must never come back is a relayout PER
 * CAPTURE: five calls fire roughly 13 captures, and captureBeyondViewport:true
 * measured ~2 relayouts each, so the broken behaviour scores ~26 here.
 */
console.log(`layout events across 5 auto-screenshot tool calls: ${relayouts} (broken behaviour scores ~26)`);
check("captures do not relayout the page", relayouts >= 0 && relayouts <= 3, `${relayouts} resize events`);

// A failure the client has NOT already seen must attach. Use a fresh client so
// there is no baseline, then confirm the follow-up failures collapse.
console.log("\n--- first failure attaches, repeats do not ---");
await call("navigate_page", { url: PAGE }, "off");
const deadUid = `${await uidFor("show toast")}_gone`;
const freshClient = `fail-${RUN}`;
const fail1 = summarise(await call("click", { uid: deadUid }, "on", freshClient));
const fail2 = summarise(await call("click", { uid: deadUid }, "on", freshClient));
const fail3 = summarise(await call("click", { uid: deadUid }, "on", freshClient));
console.log(`1: ${JSON.stringify(fail1)}\n2: ${JSON.stringify(fail2)}\n3: ${JSON.stringify(fail3)}`);
check("the first failure attaches", fail1.imageCount === 1, fail1.shotNote);
check(
	"repeat failures on an unchanged page do not re-attach",
	fail2.imageCount === 0 && fail3.imageCount === 0,
	`${fail2.imageCount}/${fail3.imageCount} images`,
);
check("...but still report the failure", fail2.isError && fail3.isError);

console.log("\n--- latency of the quiet path ---");
await call("navigate_page", { url: PAGE }, "off");
const noopUid = await uidFor("does nothing");
const t0 = Date.now();
for (let i = 0; i < 5; i++) await call("click", { uid: noopUid });
const withShot = (Date.now() - t0) / 5;
const t1 = Date.now();
for (let i = 0; i < 5; i++) await call("click", { uid: noopUid }, "off");
const without = (Date.now() - t1) / 5;
console.log(`no-change click: ${withShot.toFixed(0)}ms with detection vs ${without.toFixed(0)}ms without`);
check("detection overhead on the quiet path is under 400ms", withShot - without < 400, `+${(withShot - without).toFixed(0)}ms`);

console.log(`\nbroker counters: ${JSON.stringify((await request({ op: "status" })).autoShot)}`);

// Close ONLY tabs this script created. Never close by positional index: ids are
// assigned in enumeration order, so index 0 is whatever tab the user already had
// open, not ours.
const pages = await call("list_pages", {}, "off");
const listing = (pages.content ?? []).map((c) => c.text ?? "").join("\n");
for (const line of listing.split("\n")) {
	const m = line.match(/^(\d+):/);
	if (!m || !line.includes("data:text/html")) continue;
	await call("close_page", { pageId: Number(m[1]) }, "off").catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
	console.log("FAILED:");
	for (const f of failed) console.log(`  - ${f.label} ${f.detail ?? ""}`);
	process.exit(1);
}
