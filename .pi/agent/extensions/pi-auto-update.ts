import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";

// Disable pi's built-in update banner early. This extension replaces that flow.
process.env.PI_SKIP_VERSION_CHECK = "1";

const PACKAGE_NAME = "@mariozechner/pi-coding-agent";
const PACKAGE_ENTRY_PATH = fileURLToPath(import.meta.resolve(PACKAGE_NAME));

function findPackageJson(startPath: string | undefined): string | undefined {
	if (!startPath) {
		return undefined;
	}

	let currentDir = path.dirname(path.resolve(startPath));
	for (;;) {
		const candidate = path.join(currentDir, "package.json");
		if (existsSync(candidate)) {
			try {
				const pkg = JSON.parse(readFileSync(candidate, "utf-8")) as { name?: unknown };
				if (pkg.name === PACKAGE_NAME) {
					return candidate;
				}
			} catch {
				// Ignore unreadable package.json files while walking upwards.
			}
		}
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return undefined;
		}
		currentDir = parentDir;
	}
}

function resolvePackageJsonPath(): string {
	const argvPath = findPackageJson(process.argv[1]);
	if (argvPath) {
		return argvPath;
	}

	const importResolvedPath = findPackageJson(PACKAGE_ENTRY_PATH);
	if (importResolvedPath) {
		return importResolvedPath;
	}

	throw new Error(`Could not find package.json for ${PACKAGE_NAME}`);
}

const PACKAGE_JSON_PATH = resolvePackageJsonPath();
const STATUS_KEY = "pi-auto-update";
const RUNTIME_DIR = path.join(getAgentDir(), "runtime", "pi-auto-update");
const LOCK_FILE = path.join(RUNTIME_DIR, "lock.json");
const STATE_FILE = path.join(RUNTIME_DIR, "state.json");
const LOG_FILE = path.join(RUNTIME_DIR, "update.log");
const VOLTA_PACKAGES_DIR = path.join(homedir(), ".volta", "tools", "image", "packages");
const CHECK_DELAY_MS = 50;
const POLL_INTERVAL_MS = 1000;
const SPINNER_INTERVAL_MS = 100;
const LAUNCH_TIMEOUT_MS = 15000;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface InstallCommand {
	manager: "npm" | "volta";
	command: string;
	args: string[];
	displayCommand: string;
}

function isSubpath(filePath: string, parentDir: string): boolean {
	const relativePath = path.relative(path.resolve(parentDir), path.resolve(filePath));
	return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isVoltaManagedInstall(packageJsonPath: string): boolean {
	return isSubpath(packageJsonPath, VOLTA_PACKAGES_DIR);
}

function resolveVoltaCommand(): string {
	const voltaHome = process.env.VOLTA_HOME || path.join(homedir(), ".volta");
	const voltaPath = path.join(voltaHome, "bin", "volta");
	return existsSync(voltaPath) ? voltaPath : "volta";
}

function getInstallCommand(targetVersion: string): InstallCommand {
	const packageSpec = `${PACKAGE_NAME}@${targetVersion}`;
	if (isVoltaManagedInstall(PACKAGE_JSON_PATH)) {
		return {
			manager: "volta",
			command: resolveVoltaCommand(),
			args: ["install", packageSpec],
			displayCommand: `volta install ${packageSpec}`,
		};
	}

	return {
		manager: "npm",
		command: "npm",
		args: ["install", "-g", packageSpec],
		displayCommand: `npm install -g ${packageSpec}`,
	};
}

interface UpdateLock {
	phase: "launching" | "running";
	ownerPid: number;
	updatePid?: number;
	previousVersion: string;
	targetVersion: string;
	startedAt: number;
	logFile: string;
}

interface RunningUpdateState {
	status: "running";
	previousVersion: string;
	targetVersion: string;
	startedAt: number;
	logFile: string;
	updatePid?: number;
}

interface SuccessfulUpdateState {
	status: "success";
	previousVersion: string;
	targetVersion: string;
	installedVersion: string;
	startedAt: number;
	finishedAt: number;
	logFile: string;
}

interface FailedUpdateState {
	status: "failed";
	previousVersion: string;
	targetVersion: string;
	startedAt: number;
	finishedAt: number;
	logFile: string;
	reason?: string;
	installedVersion?: string;
}

type UpdateState = RunningUpdateState | SuccessfulUpdateState | FailedUpdateState;

function isInteractiveUi(ctx: ExtensionContext): boolean {
	return ctx.hasUI && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}

function compareVersions(left: string, right: string): number {
	const leftParts = left
		.split("-")[0]
		.split(".")
		.map((part) => Number.parseInt(part, 10) || 0);
	const rightParts = right
		.split("-")[0]
		.split(".")
		.map((part) => Number.parseInt(part, 10) || 0);
	const maxLength = Math.max(leftParts.length, rightParts.length);

	for (let i = 0; i < maxLength; i++) {
		const leftPart = leftParts[i] ?? 0;
		const rightPart = rightParts[i] ?? 0;
		if (leftPart !== rightPart) {
			return leftPart - rightPart;
		}
	}

	return 0;
}

function isProcessAlive(pid?: number): boolean {
	if (!pid || pid <= 0) {
		return false;
	}

	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
		return code === "EPERM";
	}
}

function formatHomePath(filePath: string): string {
	const home = homedir();
	if (filePath.startsWith(home)) {
		return `~${filePath.slice(home.length)}`;
	}
	return filePath;
}

function runningStateFromLock(lock: UpdateLock): RunningUpdateState {
	return {
		status: "running",
		previousVersion: lock.previousVersion,
		targetVersion: lock.targetVersion,
		startedAt: lock.startedAt,
		logFile: lock.logFile,
		updatePid: lock.updatePid,
	};
}

async function ensureRuntimeDir(): Promise<void> {
	await mkdir(RUNTIME_DIR, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
	try {
		const content = await readFile(filePath, "utf-8");
		return JSON.parse(content) as T;
	} catch (error) {
		const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
		if (code === "ENOENT") {
			return undefined;
		}
		return undefined;
	}
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
	await ensureRuntimeDir();
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	const content = `${JSON.stringify(value, null, 2)}\n`;
	await writeFile(tempPath, content, "utf-8");
	await rename(tempPath, filePath);
}

async function removeFile(filePath: string): Promise<void> {
	await rm(filePath, { force: true });
}

async function readInstalledVersionOnDisk(): Promise<string | undefined> {
	try {
		const content = await readFile(PACKAGE_JSON_PATH, "utf-8");
		const pkg = JSON.parse(content) as { version?: unknown };
		return typeof pkg.version === "string" ? pkg.version : undefined;
	} catch {
		return undefined;
	}
}

async function resolveLatestPublishedVersion(): Promise<string | undefined> {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn("npm", ["view", `${PACKAGE_NAME}@latest`, "version"], {
				cwd: homedir(),
				env: { ...process.env, npm_config_update_notifier: "false" },
				shell: false,
				stdio: ["ignore", "pipe", "ignore"],
			});
		} catch {
			resolve(undefined);
			return;
		}

		let output = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.on("error", () => resolve(undefined));
		child.on("close", (code) => {
			if (code !== 0) {
				resolve(undefined);
				return;
			}
			const trimmed = output.trim();
			resolve(trimmed.length > 0 ? trimmed : undefined);
		});
	});
}

async function tryAcquireLock(targetVersion: string): Promise<UpdateLock | undefined> {
	await ensureRuntimeDir();

	const lock: UpdateLock = {
		phase: "launching",
		ownerPid: process.pid,
		previousVersion: VERSION,
		targetVersion,
		startedAt: Date.now(),
		logFile: LOG_FILE,
	};

	try {
		await writeFile(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`, {
			encoding: "utf-8",
			flag: "wx",
		});
		return lock;
	} catch (error) {
		const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
		if (code === "EEXIST") {
			return undefined;
		}
		throw error;
	}
}

async function appendUpdateLog(targetVersion: string): Promise<void> {
	await ensureRuntimeDir();
	const installCommand = getInstallCommand(targetVersion);
	const header = [
		"",
		`=== ${new Date().toISOString()} pi auto-update ${VERSION} -> ${targetVersion} ===`,
		`Manager: ${installCommand.manager}`,
		`Package JSON: ${PACKAGE_JSON_PATH}`,
		`Command: ${installCommand.displayCommand}`,
	].join("\n");
	await appendFile(LOG_FILE, `${header}\n`, "utf-8");
}

async function finalizeFromLock(lock: UpdateLock): Promise<UpdateState | undefined> {
	const installedVersion = await readInstalledVersionOnDisk();
	const finishedAt = Date.now();

	// If the installed version is newer than what was running, the update succeeded.
	if (installedVersion && compareVersions(installedVersion, lock.previousVersion) > 0) {
		const state: SuccessfulUpdateState = {
			status: "success",
			previousVersion: lock.previousVersion,
			targetVersion: installedVersion,
			installedVersion,
			startedAt: lock.startedAt,
			finishedAt,
			logFile: lock.logFile,
		};
		await atomicWriteJson(STATE_FILE, state);
		await removeFile(LOCK_FILE);
		return state;
	}

	// Version didn't change — either no qualifying update was available or the
	// install was a no-op.  Clean up silently.
	await removeFile(LOCK_FILE);
	await removeFile(STATE_FILE);
	return undefined;
}

async function reconcileState(): Promise<UpdateState | undefined> {
	const lock = await readJson<UpdateLock>(LOCK_FILE);
	if (lock) {
		const launchExpired = lock.phase === "launching" && Date.now() - lock.startedAt > LAUNCH_TIMEOUT_MS;
		const running = lock.phase === "running" && isProcessAlive(lock.updatePid);
		if ((lock.phase === "launching" && !launchExpired) || running) {
			return runningStateFromLock(lock);
		}
		return finalizeFromLock(lock);
	}

	const state = await readJson<UpdateState>(STATE_FILE);
	if (!state) {
		return undefined;
	}

	const installedVersion = await readInstalledVersionOnDisk();

	if (state.status === "success") {
		if (compareVersions(VERSION, state.installedVersion) >= 0) {
			await removeFile(STATE_FILE);
			return undefined;
		}
		if (installedVersion && compareVersions(installedVersion, state.installedVersion) < 0) {
			await removeFile(STATE_FILE);
			return undefined;
		}
		return state;
	}

	if (installedVersion && compareVersions(installedVersion, state.previousVersion) > 0) {
		const recoveredState: SuccessfulUpdateState = {
			status: "success",
			previousVersion: state.previousVersion,
			targetVersion: installedVersion,
			installedVersion,
			startedAt: state.startedAt,
			finishedAt: Date.now(),
			logFile: state.logFile,
		};
		await atomicWriteJson(STATE_FILE, recoveredState);
		if (compareVersions(VERSION, recoveredState.installedVersion) >= 0) {
			await removeFile(STATE_FILE);
			return undefined;
		}
		return recoveredState;
	}

	return state;
}

async function spawnBackgroundUpdate(lock: UpdateLock): Promise<RunningUpdateState> {
	const installCommand = getInstallCommand(lock.targetVersion);
	await appendUpdateLog(lock.targetVersion);
	const logFd = openSync(LOG_FILE, "a");

	try {
		const child = spawn(installCommand.command, installCommand.args, {
			cwd: homedir(),
			detached: true,
			env: {
				...process.env,
				npm_config_update_notifier: "false",
			},
			shell: false,
			stdio: ["ignore", logFd, logFd],
		});

		if (!child.pid) {
			throw new Error(`Failed to start ${installCommand.displayCommand}`);
		}

		const runningLock: UpdateLock = {
			...lock,
			phase: "running",
			updatePid: child.pid,
		};
		await atomicWriteJson(LOCK_FILE, runningLock);

		const runningState: RunningUpdateState = {
			status: "running",
			previousVersion: runningLock.previousVersion,
			targetVersion: runningLock.targetVersion,
			startedAt: runningLock.startedAt,
			logFile: runningLock.logFile,
			updatePid: runningLock.updatePid,
		};
		await atomicWriteJson(STATE_FILE, runningState);

		child.unref();
		return runningState;
	} finally {
		closeSync(logFd);
	}
}

function renderStatus(
	ctx: ExtensionContext,
	state: UpdateState | undefined,
	spinnerFrame: number,
): void {
	if (!ctx.hasUI) {
		return;
	}

	const theme = ctx.ui.theme;

	if (state?.status === "running") {
		const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
		const spinner = theme.fg("accent", frame);
		const text = theme.fg("dim", " pi checking for updates");
		ctx.ui.setStatus(STATUS_KEY, spinner + text);
		return;
	}

	if (!state) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	if (state.status === "success") {
		const check = theme.fg("success", "✓");
		const text = theme.fg("dim", ` pi updated to v${state.installedVersion}; restart pi to use it`);
		ctx.ui.setStatus(STATUS_KEY, check + text);
		return;
	}

	const error = theme.fg("error", "✗");
	const text = theme.fg("dim", ` pi update failed; see ${formatHomePath(state.logFile)}`);
	ctx.ui.setStatus(STATUS_KEY, error + text);
}

export default function piAutoUpdateExtension(pi: ExtensionAPI) {
	let activeCtx: ExtensionContext | undefined;
	let currentState: UpdateState | undefined;
	let spinnerFrame = 0;
	let spinnerTimer: ReturnType<typeof setInterval> | undefined;
	let pollTimer: ReturnType<typeof setInterval> | undefined;
	let pollInFlight = false;
	let checkInFlight = false;

	function startSpinner(): void {
		if (spinnerTimer) {
			return;
		}
		spinnerTimer = setInterval(() => {
			spinnerFrame++;
			syncRenderedStatus();
		}, SPINNER_INTERVAL_MS);
	}

	function stopSpinner(): void {
		if (!spinnerTimer) {
			return;
		}
		clearInterval(spinnerTimer);
		spinnerTimer = undefined;
	}

	function stopTimers(): void {
		stopSpinner();
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = undefined;
		}
	}

	function syncRenderedStatus(): void {
		if (!activeCtx) {
			return;
		}
		renderStatus(activeCtx, currentState, spinnerFrame);
	}

	function ensureRunningTimers(): void {
		if (!currentState || currentState.status !== "running") {
			stopSpinner();
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = undefined;
			}
			return;
		}

		startSpinner();

		if (!pollTimer) {
			pollTimer = setInterval(() => {
				if (pollInFlight) {
					return;
				}
				pollInFlight = true;
				void (async () => {
					try {
						currentState = await reconcileState();
						if (!currentState || currentState.status !== "running") {
							stopTimers();
						}
						syncRenderedStatus();
					} finally {
						pollInFlight = false;
					}
				})();
			}, POLL_INTERVAL_MS);
		}
	}

	async function maybeStartBackgroundUpdate(): Promise<void> {
		if (!activeCtx || !isInteractiveUi(activeCtx) || checkInFlight || currentState?.status === "running") {
			return;
		}
		if (process.env.PI_OFFLINE) {
			return;
		}

		let nextState: UpdateState | undefined;
		checkInFlight = true;
		try {
			currentState = await reconcileState();
			if (currentState?.status === "running") {
				ensureRunningTimers();
				syncRenderedStatus();
				return;
			}

			// Check if already updated on disk but not yet restarted.
			const installedVersion = await readInstalledVersionOnDisk();
			if (installedVersion && compareVersions(installedVersion, VERSION) > 0) {
				nextState = {
					status: "success",
					previousVersion: VERSION,
					targetVersion: installedVersion,
					installedVersion,
					startedAt: Date.now(),
					finishedAt: Date.now(),
					logFile: LOG_FILE,
				};
				await atomicWriteJson(STATE_FILE, nextState);
				return;
			}

			// Resolve the latest published version up front so we can refuse to
			// downgrade.  If the resolution fails (offline, registry down, etc.) we
			// silently skip this update attempt rather than risk installing an
			// unknown version.
			const targetVersion = await resolveLatestPublishedVersion();
			if (!targetVersion) {
				return;
			}

			const baselineVersion = installedVersion ?? VERSION;
			if (compareVersions(targetVersion, baselineVersion) <= 0) {
				// Target isn't newer than what's already installed — abort to avoid
				// downgrading or redundantly reinstalling.
				return;
			}

			let lock = await tryAcquireLock(targetVersion);
			if (!lock) {
				const reconciledState = await reconcileState();
				if (reconciledState?.status === "running") {
					nextState = reconciledState;
					spinnerFrame = 0;
					return;
				}
				lock = await tryAcquireLock(targetVersion);
			}

			if (!lock) {
				return;
			}

			try {
				nextState = await spawnBackgroundUpdate(lock);
				spinnerFrame = 0;
			} catch (error) {
				const installCommand = getInstallCommand(targetVersion);
				await removeFile(LOCK_FILE);
				nextState = {
					status: "failed",
					previousVersion: VERSION,
					targetVersion,
					startedAt: lock.startedAt,
					finishedAt: Date.now(),
					logFile: LOG_FILE,
					reason: error instanceof Error ? `${installCommand.displayCommand}: ${error.message}` : `${installCommand.displayCommand}: ${String(error)}`,
				};
				await atomicWriteJson(STATE_FILE, nextState);
			}
		} finally {
			if (nextState) {
				currentState = nextState;
			}
			ensureRunningTimers();
			syncRenderedStatus();
			checkInFlight = false;
		}
	}

	function scheduleBootstrap(ctx: ExtensionContext): void {
		if (!isInteractiveUi(ctx)) {
			return;
		}
		activeCtx = ctx;
		setTimeout(() => {
			void (async () => {
				currentState = await reconcileState();
				if (currentState?.status === "running") {
					spinnerFrame = 0;
					ensureRunningTimers();
				} else {
					stopTimers();
				}
				syncRenderedStatus();
				await maybeStartBackgroundUpdate();
			})();
		}, CHECK_DELAY_MS);
	}

	// session_start fires on startup, reload, resume, fork, and new sessions,
	// which covers the case the old code was trying to handle with a separate
	// (non-existent) "session_switch" event.
	pi.on("session_start", async (_event, ctx) => {
		scheduleBootstrap(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopTimers();
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
