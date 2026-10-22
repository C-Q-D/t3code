/**
 * Drives the desktop dev app's main window over the Chrome DevTools Protocol, so an agent can
 * screenshot and click the real Electron window instead of asking a person to. The window only
 * exposes CDP when `T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT` is set, which `scripts/desktop-cdp.ts
 * start` does. Windows only: raising a covered window goes through user32.
 */
// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalFetch:off preferSchemaOverJson:off - Plain Node so ad hoc check flows can import it by path; it speaks raw CDP JSON over fetch and WebSocket.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";

const APP_PAGE_URL_PREFIX = "t3code-dev://app";
const APP_WINDOW_TITLE = "T3 Code (Dev)";
const HTTP_TIMEOUT_MS = 2_000;
const CDP_OPEN_TIMEOUT_MS = 10_000;
// A hidden page never paints, so Page.captureScreenshot would otherwise wait forever.
const CDP_CALL_TIMEOUT_MS = 30_000;
const RAISE_SCRIPT_TIMEOUT_MS = 30_000;
const VISIBILITY_POLL_MS = 200;
const VISIBILITY_POLLS_AFTER_RAISE = 15;
const RAISE_SCRIPT = NodePath.join(import.meta.dirname, "desktop-window-front.ps1");

/** CSS selector, optionally narrowed to the match whose trimmed text or aria-label equals `text`. */
export interface ElementTarget {
  readonly selector: string;
  readonly text?: string;
}

/** Viewport point in CSS pixels. */
export interface PointTarget {
  readonly x: number;
  readonly y: number;
}

/** Viewport rectangle in CSS pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Bit flags for CDP input events. */
export const Modifiers = { alt: 1, ctrl: 2, meta: 4, shift: 8 } as const;

const KEY_CODES: Readonly<Record<string, number>> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Escape: 27,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46,
};

interface CdpTarget {
  readonly type: string;
  readonly url: string;
  readonly webSocketDebuggerUrl: string;
}

/** Narrows parsed JSON to an object whose fields can be read and checked one by one. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Shape check for one entry of DevTools `/json/list`; entries without a socket URL fail it. */
const isCdpTarget = (value: unknown): value is CdpTarget =>
  isRecord(value) &&
  typeof value.type === "string" &&
  typeof value.url === "string" &&
  typeof value.webSocketDebuggerUrl === "string";

/** Shape check for the rectangle the page script in `rectOf` returns. */
const isRect = (value: unknown): value is Rect =>
  isRecord(value) &&
  typeof value.x === "number" &&
  typeof value.y === "number" &&
  typeof value.width === "number" &&
  typeof value.height === "number";

/** Names an element target the way error messages quote it. */
const describeTarget = (target: ElementTarget) =>
  target.text === undefined ? target.selector : `${target.selector} with text "${target.text}"`;

/**
 * GETs `path` from the DevTools HTTP endpoint on 127.0.0.1:`port` and returns the parsed JSON.
 * Single attempt, no retry; rejects on a connection failure, a non-2xx answer, invalid JSON, or
 * no answer within HTTP_TIMEOUT_MS.
 */
const fetchDevTools = async (port: number, path: string): Promise<unknown> => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`DevTools ${path} on port ${port} answered HTTP ${response.status}.`);
  }
  return response.json();
};

/**
 * The app's main page target, or `undefined` while the window has not loaded the app yet.
 * Rejects when nothing answers on `port`.
 */
export const findAppPage = async (port: number): Promise<CdpTarget | undefined> => {
  const targets = await fetchDevTools(port, "/json/list");
  if (!Array.isArray(targets))
    throw new Error(`DevTools /json/list on port ${port} is not a list.`);
  return targets
    .filter(isCdpTarget)
    .find((target) => target.type === "page" && target.url.startsWith(APP_PAGE_URL_PREFIX));
};

interface CdpSession {
  /** Sends one CDP command; rejects on a protocol error, a closed socket, or no answer in time. */
  readonly send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  readonly close: () => void;
}

/**
 * Resolves once `socket` is open. Rejects when it errors or closes first, or is still connecting
 * after CDP_OPEN_TIMEOUT_MS. Removes its listeners either way; closing the socket on failure is
 * the caller's job.
 */
const waitForOpen = (socket: WebSocket, url: string) =>
  new Promise<void>((resolve, reject) => {
    const settled = new AbortController();
    const finish = (error?: Error) => {
      settled.abort();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    const options = { signal: settled.signal };
    socket.addEventListener("open", () => finish(), options);
    socket.addEventListener(
      "error",
      () => finish(new Error(`Could not open the CDP socket ${url}.`)),
      options,
    );
    socket.addEventListener(
      "close",
      () => finish(new Error(`The CDP socket ${url} closed before it opened.`)),
      options,
    );
    AbortSignal.timeout(CDP_OPEN_TIMEOUT_MS).addEventListener(
      "abort",
      () =>
        finish(
          new Error(`The CDP socket ${url} did not open within ${CDP_OPEN_TIMEOUT_MS / 1000} s.`),
        ),
      options,
    );
  });

/**
 * Opens a CDP WebSocket to `webSocketUrl` and returns a request/response session over it. Rejects
 * as `waitForOpen` does, after closing the socket. The caller owns the open session and must
 * `close` it; until then the socket keeps the process alive. Protocol events are ignored.
 */
const openCdpSession = async (webSocketUrl: string): Promise<CdpSession> => {
  const socket = new WebSocket(webSocketUrl);
  try {
    await waitForOpen(socket, webSocketUrl);
  } catch (error) {
    socket.close();
    throw error;
  }

  let nextId = 0;
  const pending = new Map<
    number,
    { readonly resolve: (result: unknown) => void; readonly reject: (error: Error) => void }
  >();
  socket.addEventListener("message", (event) => {
    const message: unknown = JSON.parse(String(event.data));
    // Messages without an id are protocol events nobody subscribed to.
    if (!isRecord(message) || typeof message.id !== "number") return;
    const call = pending.get(message.id);
    if (call === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) {
      call.reject(new Error(`CDP error: ${JSON.stringify(message.error)}`));
    } else {
      call.resolve(message.result);
    }
  });
  socket.addEventListener("close", () => {
    for (const call of pending.values()) call.reject(new Error("The CDP socket closed."));
    pending.clear();
  });

  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} got no answer within ${CDP_CALL_TIMEOUT_MS / 1000} s.`));
      }, CDP_CALL_TIMEOUT_MS);
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { send, close: () => socket.close() };
};

/**
 * Process id of the Electron browser process behind DevTools `port`, which owns the app's
 * windows. Asks over a short-lived browser-level session that it always closes; rejects when the
 * endpoint or the answer is not what Chromium normally serves.
 */
const browserProcessId = async (port: number): Promise<number> => {
  const version = await fetchDevTools(port, "/json/version");
  if (!isRecord(version) || typeof version.webSocketDebuggerUrl !== "string") {
    throw new Error(`DevTools /json/version on port ${port} has no browser socket.`);
  }
  const browser = await openCdpSession(version.webSocketDebuggerUrl);
  try {
    const info = await browser.send("SystemInfo.getProcessInfo");
    const processes = isRecord(info) && Array.isArray(info.processInfo) ? info.processInfo : [];
    for (const entry of processes) {
      if (isRecord(entry) && entry.type === "browser" && typeof entry.id === "number") {
        return entry.id;
      }
    }
    throw new Error("SystemInfo.getProcessInfo listed no browser process.");
  } finally {
    browser.close();
  }
};

/**
 * Brings the app's main window to the foreground through `desktop-window-front.ps1`, for when
 * Page.bringToFront leaves the page hidden. Waits at most RAISE_SCRIPT_TIMEOUT_MS; rejects when
 * the script cannot run, finds no such window, or Windows refuses the foreground change.
 */
const raiseWindow = async (port: number) => {
  const processId = await browserProcessId(port);
  const result = NodeChildProcess.spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      RAISE_SCRIPT,
      "-ProcessId",
      String(processId),
      "-Title",
      APP_WINDOW_TITLE,
    ],
    { encoding: "utf8", timeout: RAISE_SCRIPT_TIMEOUT_MS, windowsHide: true },
  );
  if (result.error !== undefined) {
    throw new Error(`Could not run ${RAISE_SCRIPT}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new Error(
      `Raising the window failed: ${result.stderr.trim() || `exit ${result.status}`}`,
    );
  }
};

/** An open connection to the app's main page. Close it, or the process stays alive. */
export interface DesktopPage {
  /** Raw CDP command, for anything the helpers below do not cover. */
  readonly send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  /** Runs `expression` in the page with a user gesture, awaits promises, returns the JSON value. */
  readonly evaluate: (expression: string) => Promise<unknown>;
  /** Viewport rectangle of the first match, or `undefined` when nothing matches. */
  readonly rectOf: (target: ElementTarget) => Promise<Rect | undefined>;
  /** Moves the mouse to the target's center; rejects when nothing matches. */
  readonly hover: (target: ElementTarget | PointTarget, modifiers?: number) => Promise<PointTarget>;
  /** Trusted left click at the target's center; rejects when nothing matches. */
  readonly click: (target: ElementTarget | PointTarget, modifiers?: number) => Promise<PointTarget>;
  /** Presses and releases a named key (Enter, Escape, Tab, arrows, ...) on the focused element. */
  readonly key: (name: string, modifiers?: number) => Promise<void>;
  /** Inserts text at the caret like an IME commit; no per-character key events. */
  readonly insertText: (text: string) => Promise<void>;
  /**
   * Saves a PNG of the whole window, or of the target plus `padding` CSS pixels at 2x scale.
   * Returns the absolute path; rejects when the target matches nothing.
   */
  readonly shot: (file: string, target?: ElementTarget, padding?: number) => Promise<string>;
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly close: () => void;
  readonly [Symbol.dispose]: () => void;
}

/**
 * Connects to the app's main page on DevTools `port`, makes sure the window paints, and turns off
 * reduced motion for this connection.
 *
 * Hosts with OS animations turned off make Chromium report reduced motion, and the app then skips
 * its motion; checks want the motion most users see. The override lasts only while this
 * connection stays open, so a check that involves animation keeps one connection for the whole
 * sequence.
 */
export const connectDesktopPage = async (port: number): Promise<DesktopPage> => {
  const target = await findAppPage(port);
  if (target === undefined) {
    throw new Error(`No ${APP_PAGE_URL_PREFIX} page on DevTools port ${port} yet.`);
  }
  const session = await openCdpSession(target.webSocketDebuggerUrl);
  const { send } = session;

  const evaluate = async (expression: string) => {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (!isRecord(response)) throw new Error("Runtime.evaluate returned nothing.");
    if (response.exceptionDetails !== undefined) {
      throw new Error(`Page script threw: ${JSON.stringify(response.exceptionDetails)}`);
    }
    return isRecord(response.result) ? response.result.value : undefined;
  };

  const rectOf = async (element: ElementTarget) => {
    const rect = await evaluate(`(() => {
      const text = ${JSON.stringify(element.text ?? null)};
      const matches = [...document.querySelectorAll(${JSON.stringify(element.selector)})];
      const match = text === null
        ? matches[0]
        : matches.find((candidate) =>
            candidate.textContent?.trim() === text || candidate.getAttribute("aria-label") === text);
      if (!match) return null;
      const { x, y, width, height } = match.getBoundingClientRect();
      return { x, y, width, height };
    })()`);
    return isRect(rect) ? rect : undefined;
  };

  const pointOf = async (pointOrElement: ElementTarget | PointTarget): Promise<PointTarget> => {
    if ("x" in pointOrElement) return pointOrElement;
    const rect = await rectOf(pointOrElement);
    if (rect === undefined) throw new Error(`Nothing matches ${describeTarget(pointOrElement)}.`);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  };

  const hover = async (pointOrElement: ElementTarget | PointTarget, modifiers = 0) => {
    const point = await pointOf(pointOrElement);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, modifiers });
    return point;
  };

  const click = async (pointOrElement: ElementTarget | PointTarget, modifiers = 0) => {
    const point = await hover(pointOrElement, modifiers);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        ...point,
        modifiers,
        button: "left",
        clickCount: 1,
      });
    }
    return point;
  };

  const key = async (name: string, modifiers = 0) => {
    const virtualKeyCode = KEY_CODES[name];
    if (virtualKeyCode === undefined) {
      throw new Error(
        `Unknown key ${name}. Known keys: ${Object.keys(KEY_CODES).join(", ")}. Use insertText for text.`,
      );
    }
    const event = { key: name, code: name, windowsVirtualKeyCode: virtualKeyCode, modifiers };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...event });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  };

  const insertText = async (text: string) => {
    await send("Input.insertText", { text });
  };

  const shot = async (file: string, element?: ElementTarget, padding = 16) => {
    let clip: Record<string, number> | undefined;
    if (element !== undefined) {
      const rect = await rectOf(element);
      if (rect === undefined) throw new Error(`Nothing matches ${describeTarget(element)}.`);
      const left = Math.max(0, rect.x - padding);
      const top = Math.max(0, rect.y - padding);
      clip = {
        x: left,
        y: top,
        width: rect.x + rect.width + padding - left,
        height: rect.y + rect.height + padding - top,
        scale: 2,
      };
    }
    const response = await send("Page.captureScreenshot", {
      format: "png",
      ...(clip === undefined ? {} : { clip }),
    });
    if (!isRecord(response) || typeof response.data !== "string") {
      throw new Error("Page.captureScreenshot returned no image.");
    }
    const absolute = NodePath.resolve(file);
    NodeFS.mkdirSync(NodePath.dirname(absolute), { recursive: true });
    NodeFS.writeFileSync(absolute, Buffer.from(response.data, "base64"));
    return absolute;
  };

  const wait = (milliseconds: number) => NodeTimersPromises.setTimeout(milliseconds);

  try {
    await send("Page.bringToFront");
    if ((await evaluate("document.visibilityState")) !== "visible") {
      await raiseWindow(port);
      let visible = false;
      for (let poll = 0; poll < VISIBILITY_POLLS_AFTER_RAISE && !visible; poll++) {
        await wait(VISIBILITY_POLL_MS);
        visible = (await evaluate("document.visibilityState")) === "visible";
      }
      if (!visible) {
        throw new Error(
          "The window is still hidden after raising it. An always-on-top window, such as a full-screen video player, may be covering it.",
        );
      }
    }
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
  } catch (error) {
    session.close();
    throw error;
  }

  return {
    send,
    evaluate,
    rectOf,
    hover,
    click,
    key,
    insertText,
    shot,
    wait,
    close: session.close,
    [Symbol.dispose]: session.close,
  };
};
