var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var isWorkerdProcessV2 = globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
var unenvProcess = new Process({
  env: globalProcess.env,
  // `hrtime` is only available from workerd process v2
  hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  // Always implemented by workerd
  env,
  // Only implemented in workerd v2
  hrtime: hrtime3,
  // Always implemented by workerd
  nextTick
} = unenvProcess;
var {
  _channel,
  _disconnect,
  _events,
  _eventsCount,
  _handleQueue,
  _maxListeners,
  _pendingMessage,
  _send,
  assert: assert2,
  disconnect,
  mainModule
} = unenvProcess;
var {
  // @ts-expect-error `_debugEnd` is missing typings
  _debugEnd,
  // @ts-expect-error `_debugProcess` is missing typings
  _debugProcess,
  // @ts-expect-error `_exiting` is missing typings
  _exiting,
  // @ts-expect-error `_fatalException` is missing typings
  _fatalException,
  // @ts-expect-error `_getActiveHandles` is missing typings
  _getActiveHandles,
  // @ts-expect-error `_getActiveRequests` is missing typings
  _getActiveRequests,
  // @ts-expect-error `_kill` is missing typings
  _kill,
  // @ts-expect-error `_linkedBinding` is missing typings
  _linkedBinding,
  // @ts-expect-error `_preload_modules` is missing typings
  _preload_modules,
  // @ts-expect-error `_rawDebug` is missing typings
  _rawDebug,
  // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
  _startProfilerIdleNotifier,
  // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
  _stopProfilerIdleNotifier,
  // @ts-expect-error `_tickCallback` is missing typings
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  availableMemory,
  // @ts-expect-error `binding` is missing typings
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  // @ts-expect-error `domain` is missing typings
  domain,
  emit,
  emitWarning,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  // @ts-expect-error `initgroups` is missing typings
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  memoryUsage,
  // @ts-expect-error `moduleLoadList` is missing typings
  moduleLoadList,
  off,
  on,
  once,
  // @ts-expect-error `openStdin` is missing typings
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  // @ts-expect-error `reallyExit` is missing typings
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// C:/Users/flame/AppData/Roaming/npm/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/lib/response.js
function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers || {}
    }
  });
}
__name(json, "json");
function jsonError(status, message, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status });
}
__name(jsonError, "jsonError");
function jsonOk(data = {}) {
  return json({ ok: true, ...data });
}
__name(jsonOk, "jsonOk");

// src/lib/crm-original-answers.js
var HOMEPAGE_FIELDS = Object.freeze([
  ["name", "\uC774\uB984"],
  ["phone", "\uC5F0\uB77D\uCC98"],
  ["email", "\uC774\uBA54\uC77C"],
  ["space_type", "\uACF5\uAC04 \uC720\uD615"],
  ["space_size", "\uACF5\uAC04 \uADDC\uBAA8"],
  ["address", "\uC8FC\uC18C"],
  ["address_detail", "\uC0C1\uC138 \uC8FC\uC18C"],
  ["schedule", "\uD76C\uB9DD \uC77C\uC815"],
  ["referral", "\uC720\uC785 \uACBD\uB85C"],
  ["branch", "\uD76C\uB9DD \uC9C0\uC810"],
  ["detail", "\uBB38\uC758 \uB0B4\uC6A9"],
  ["budget", "\uAC00\uC6A9 \uC608\uC0B0"]
]);
var MAX_ANSWERS = 14;
var MAX_TEXT = 5e3;
function valueText(value) {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ").slice(0, MAX_TEXT);
  if (value === null || value === void 0) return "";
  if (typeof value === "object") return "";
  return String(value).trim().slice(0, MAX_TEXT);
}
__name(valueText, "valueText");
function serializeHomepageAnswers(fields = {}) {
  return HOMEPAGE_FIELDS.map(([field, question]) => {
    const answer = valueText(fields?.[field]);
    return answer ? { question, answer, field } : null;
  }).filter(Boolean).slice(0, MAX_ANSWERS);
}
__name(serializeHomepageAnswers, "serializeHomepageAnswers");

// src/lib/security.js
var MIN_SUBMIT_TIME_MS = 3e3;
var RATE_LIMIT_PER_HOUR = 10;
function escapeHtml(s2) {
  if (s2 === null || s2 === void 0) return "";
  return String(s2).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(escapeHtml, "escapeHtml");
function clientIP(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "0.0.0.0";
}
__name(clientIP, "clientIP");
function botSignals(fields) {
  const hp = fields._hp ?? fields.website ?? "";
  const honeypotFilled = String(hp).trim() !== "";
  const ts = Number(fields._ts || 0);
  const tooFast = ts > 0 && Date.now() - ts < MIN_SUBMIT_TIME_MS;
  return { honeypotFilled, tooFast, ts };
}
__name(botSignals, "botSignals");
async function rateLimit(ip, limit = RATE_LIMIT_PER_HOUR) {
  const cache = caches.default;
  const key = `https://rate-limit.internal/${ip}`;
  const cached = await cache.match(key);
  let count3 = 0;
  if (cached) {
    count3 = parseInt(await cached.text() || "0", 10) || 0;
  }
  count3++;
  if (count3 > limit) return { allowed: false, count: count3 };
  const res = new Response(String(count3), {
    headers: { "cache-control": "max-age=3600" }
  });
  await cache.put(key, res);
  return { allowed: true, count: count3 };
}
__name(rateLimit, "rateLimit");
function validateContentType(request, expected = "application/json") {
  const ct = request.headers.get("content-type") || "";
  return ct.toLowerCase().includes(expected);
}
__name(validateContentType, "validateContentType");
var URL_RE = /(https?:\/\/|www\.)/i;
function hasUrl(s2) {
  return URL_RE.test(String(s2 || ""));
}
__name(hasUrl, "hasUrl");
var LINK_GLOBAL_RE = /(https?:\/\/|www\.)/gi;
var HTML_INJECT_RE = /<\s*(a|script|iframe|img|svg|form|style)\b|javascript:/i;
function isLinkSpam(s2) {
  const str = String(s2 || "");
  const linkCount = (str.match(LINK_GLOBAL_RE) || []).length;
  return linkCount >= 3 || HTML_INJECT_RE.test(str);
}
__name(isLinkSpam, "isLinkSpam");
function isValidEmail(s2) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s2 || ""));
}
__name(isValidEmail, "isValidEmail");
function isValidPhone(s2) {
  return /^\d{2,3}-?\d{3,4}-?\d{4}$/.test(String(s2 || "").replace(/\s/g, ""));
}
__name(isValidPhone, "isValidPhone");
var INFLOW_APPS = Object.freeze([
  "naver-app",
  "kakaotalk",
  "instagram-app",
  "facebook-app",
  "legacy-link"
]);
function safeInflowApp(value) {
  const v = String(value ?? "").trim();
  return INFLOW_APPS.includes(v) ? v : "";
}
__name(safeInflowApp, "safeInflowApp");

// src/lib/jwt.js
var enc = new TextEncoder();
var dec = new TextDecoder();
function b64url(buf) {
  const s2 = typeof buf === "string" ? buf : String.fromCharCode(...new Uint8Array(buf));
  return btoa(s2).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(b64url, "b64url");
function b64urlDecode(s2) {
  s2 = s2.replace(/-/g, "+").replace(/_/g, "/");
  while (s2.length % 4) s2 += "=";
  const raw = atob(s2);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
__name(b64urlDecode, "b64urlDecode");
async function getKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(getKey, "getKey");
async function sign(payload, secret, expSeconds = 43200) {
  if (!secret) throw new Error("JWT secret required");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1e3);
  const body = { ...payload, iat: now, exp: now + expSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const data = `${h}.${p}`;
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}
__name(sign, "sign");
async function verify(token, secret) {
  if (!token || !secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s2] = parts;
  const data = `${h}.${p}`;
  try {
    const key = await getKey(secret);
    const sig = b64urlDecode(s2);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      enc.encode(data)
    );
    if (!valid) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(p)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verify, "verify");

// src/lib/auth.js
var COOKIE_NAME = "day1_admin";
var COOKIE_MAX_AGE = 60 * 60 * 12;
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  const out = {};
  raw.split(/;\s*/).forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}
__name(parseCookies, "parseCookies");
async function verifyAdmin(request, env2) {
  if (!env2.JWT_SECRET) return false;
  const cookies = parseCookies(request);
  const cookieJwt = cookies[COOKIE_NAME];
  if (cookieJwt) {
    const payload = await verify(cookieJwt, env2.JWT_SECRET);
    if (payload && payload.sub === "admin") return true;
  }
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const payload = await verify(m[1].trim(), env2.JWT_SECRET);
    if (payload && payload.sub === "admin") return true;
  }
  return false;
}
__name(verifyAdmin, "verifyAdmin");
function setSessionCookie(jwt, maxAge = COOKIE_MAX_AGE) {
  return `${COOKIE_NAME}=${encodeURIComponent(jwt)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}
__name(setSessionCookie, "setSessionCookie");
function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}
__name(clearSessionCookie, "clearSessionCookie");

// src/lib/r2.js
async function r2Upload(bucket, key, body, opts = {}) {
  const { contentType, publicBase } = opts;
  await bucket.put(key, body, {
    httpMetadata: contentType ? { contentType } : void 0
  });
  const base = publicBase || "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev";
  return `${base.replace(/\/$/, "")}/${key}`;
}
__name(r2Upload, "r2Upload");
function safeFileName(name) {
  return String(name || "file").replace(/[^\w.\-ㄱ-ㅎ가-힣]/g, "_").slice(0, 120);
}
__name(safeFileName, "safeFileName");
function datePrefix(d = /* @__PURE__ */ new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}
__name(datePrefix, "datePrefix");
function randomId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s2 = "";
  for (let i = 0; i < len; i++)
    s2 += chars[Math.floor(Math.random() * chars.length)];
  return s2;
}
__name(randomId, "randomId");
function urlToKey(url, publicBase) {
  if (!url || typeof url !== "string") return null;
  const base = String(
    publicBase || "https://pub-7a0a5e1669f345bb8ae95ab3c7865149.r2.dev"
  ).replace(/\/$/, "");
  if (!url.startsWith(base + "/")) return null;
  return decodeURIComponent(url.slice(base.length + 1));
}
__name(urlToKey, "urlToKey");
async function r2DeleteByUrl(bucket, url, publicBase) {
  const key = urlToKey(url, publicBase);
  if (!key || !bucket) return false;
  try {
    await bucket.delete(key);
    return true;
  } catch (e) {
    console.warn("[r2] delete failed:", key, e?.message);
    return false;
  }
}
__name(r2DeleteByUrl, "r2DeleteByUrl");
async function r2DeleteMany(bucket, urls, publicBase) {
  const list = (urls || []).filter((u) => typeof u === "string" && u);
  if (!list.length) return;
  await Promise.all(list.map((u) => r2DeleteByUrl(bucket, u, publicBase)));
}
__name(r2DeleteMany, "r2DeleteMany");

// src/lib/d1.js
var ID_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function generateId() {
  let s2 = "";
  const buf = crypto.getRandomValues(new Uint8Array(14));
  for (const b of buf) s2 += ID_CHARSET[b % ID_CHARSET.length];
  return "rec" + s2;
}
__name(generateId, "generateId");
var SCHEMA = {
  Estimates: [
    "Name",
    "Phone",
    "Email",
    "SpaceType",
    "SpaceSize",
    "Postcode",
    "Address",
    "AddressDetail",
    "Schedule",
    "Referral",
    "Branch",
    "Detail",
    "PrivacyAgreed",
    "ConceptFiles",
    "FloorPlans",
    "SubmittedAt",
    "IP",
    "Status",
    "Assignee",
    "ContactedAt",
    "ConsultAt",
    "ConsultBranch",
    "ConsultCancelledAt",
    "ConsultRemind1dAt",
    "ConsultRemind2hAt",
    "ContractAt",
    "ContractOwner",
    "ContractAmount",
    "Memo",
    "EstimateAmount",
    "Source",
    "Platform",
    "Campaign",
    "UtmSource",
    "UtmMedium",
    "UtmCampaign",
    "MetaCampaign",
    "MetaCampaignId",
    "MetaAdset",
    "MetaAdsetId",
    "MetaAd",
    "MetaAdId",
    "Fbclid",
    "Fbp",
    "Fbc",
    "SessionId",
    "FirstSource",
    "FirstPlatform",
    "FirstCampaign",
    "FirstReferrer",
    "FirstRefPath",
    "FirstUtmSource",
    "FirstUtmMedium",
    "FirstUtmCampaign",
    "FirstInflowApp",
    "MetaLeadId",
    "MetaFieldData",
    "LeadKey",
    "FormType"
  ],
  EstimateMemos: ["EstimateId", "Body", "Author", "CreatedAt", "UpdatedAt"],
  Clients: ["Brand", "Phone4", "Order"],
  Works: [
    "ClientId",
    "Date",
    "Type",
    "Title",
    "Body",
    "AuthorLabel",
    "IP",
    "CreatedAt",
    "CompletedAt"
  ],
  WorkComments: ["WorkId", "Role", "Label", "Body", "IP", "CreatedAt"],
  HeroSlides: ["Image", "Href", "Alt", "Order", "Active", "Lqip"],
  Portfolio: [
    "Name",
    "Folder",
    "Count",
    "Category",
    "Order",
    "RightId",
    "RightFolder",
    "RightCount",
    "RightName",
    "ThumbAfter",
    "ThumbBefore",
    "Images"
  ],
  Community: [
    "Idx",
    "Title",
    "Category",
    "Date",
    "Board",
    "Thumb",
    "Views",
    "Excerpt",
    "BodyText",
    "BodyHtml",
    "Images",
    "ContentBlocks"
  ],
  AnalyticsSnapshots: [
    "RangeKey",
    "StartDate",
    "EndDate",
    "Source",
    "Payload",
    "RawR2Key",
    "CreatedAt"
  ],
  AdminSettings: ["Value", "UpdatedAt"],
  Popups: [
    "Title",
    "ImageUrl",
    "Alt",
    "LinkUrl",
    "WidthPx",
    "TopPx",
    "LeftPx",
    "Active",
    "Order",
    "CreatedAt",
    "UpdatedAt"
  ],
  MessageTemplates: ["Name", "Subject", "Content", "CreatedAt", "UpdatedAt"],
  SmsLogs: [
    "EstimateId",
    "TemplateId",
    "ToPhone",
    "Subject",
    "Content",
    "SmsType",
    "Status",
    "Detail",
    "SentAt",
    "SentBy"
  ],
  HealthChecks: ["CheckedAt", "Overall", "Results", "TriggeredBy"],
  SystemHeartbeats: ["Source", "At", "Status", "Detail"],
  MetaFormSchemas: ["FormId", "FormName", "Questions", "Mapping", "UpdatedAt"],
  IntakeEvents: [
    "At",
    "Channel",
    "Source",
    "Branch",
    "RefName",
    "RefPhone",
    "Geo",
    "EstimateId",
    "Steps",
    "Overall",
    "IP"
  ],
  MetaAdsDaily: [
    "Date",
    "Level",
    "EntityId",
    "EntityName",
    "Status",
    "Objective",
    "Impressions",
    "Clicks",
    "LinkClicks",
    "Spend",
    "Ctr",
    "Cpc",
    "Reach",
    "Frequency",
    "Leads",
    "ActionsJson",
    "VideoP25Watched",
    "VideoP50Watched",
    "VideoP75Watched",
    "VideoP100Watched",
    "VideoAvgWatchSec",
    "ThruPlay",
    "UniqueClicks",
    "UniqueLinkClicks",
    "CostPerLinkClick",
    "FetchedAt",
    "CreatedAt"
  ],
  MetaAdsAd: [
    "Date",
    "AdId",
    "AdName",
    "AdsetId",
    "AdsetName",
    "CampaignId",
    "CampaignName",
    "CreativeId",
    "CreativeType",
    "ThumbnailUrl",
    "CreativeTitle",
    "CreativeBody",
    "CreativeCallToAction",
    "CreativeLinkUrl",
    "CreativeVariants",
    "Status",
    "Impressions",
    "Clicks",
    "LinkClicks",
    "Spend",
    "Ctr",
    "Cpc",
    "Reach",
    "Leads",
    "ThruPlay",
    "VideoAvgWatchSec",
    "FetchedAt",
    "CreatedAt"
  ],
  MetaAdsBreakdown: [
    "Date",
    "Dimension",
    "DimensionValue",
    "DimensionSub",
    "Impressions",
    "Clicks",
    "LinkClicks",
    "Spend",
    "Ctr",
    "Cpc",
    "Reach",
    "Leads",
    "FetchedAt",
    "CreatedAt"
  ],
  MetaSyncLog: [
    "SyncType",
    "Status",
    "DateRangeStart",
    "DateRangeEnd",
    "ApiCallsUsed",
    "RecordsUpdated",
    "ErrorCode",
    "ErrorMessage",
    "StartedAt",
    "CompletedAt",
    "CreatedAt"
  ]
};
var BOOL_COLS = /* @__PURE__ */ new Set(["PrivacyAgreed", "Active"]);
var RESERVED = /* @__PURE__ */ new Set(["Order"]);
var q = /* @__PURE__ */ __name((col) => RESERVED.has(col) ? `"${col}"` : col, "q");
function rowToRecord(row, table3) {
  if (!row) return null;
  const fields = {};
  for (const col of SCHEMA[table3]) {
    if (!(col in row)) continue;
    let v = row[col];
    if (BOOL_COLS.has(col)) v = v ? true : false;
    fields[col] = v;
  }
  return { id: row.id, fields };
}
__name(rowToRecord, "rowToRecord");
function fieldsToRow(fields, table3) {
  const cols = [];
  const vals = [];
  const placeholders = [];
  for (const col of SCHEMA[table3]) {
    if (!(col in fields)) continue;
    cols.push(q(col));
    let v = fields[col];
    if (BOOL_COLS.has(col)) {
      v = v ? 1 : 0;
    } else if (Array.isArray(v) || v && typeof v === "object") {
      v = JSON.stringify(v);
    } else if (v === null || v === void 0) {
      v = "";
    } else if (typeof v === "boolean") {
      v = v ? 1 : 0;
    }
    vals.push(v);
    placeholders.push("?");
  }
  return { cols, vals, placeholders };
}
__name(fieldsToRow, "fieldsToRow");
function assertTable(table3) {
  if (!SCHEMA[table3]) throw new Error(`Unknown table: ${table3}`);
}
__name(assertTable, "assertTable");
async function d1List(env2, table3, { where, sort, limit, pageSize, offset } = {}) {
  assertTable(table3);
  if (!env2.DB) throw new Error("D1 binding (DB) missing");
  let sql = `SELECT * FROM ${table3}`;
  const binds = [];
  if (where && Object.keys(where).length) {
    const conds = [];
    for (const [k, v] of Object.entries(where)) {
      if (!SCHEMA[table3].includes(k) && k !== "id") {
        throw new Error(`Unknown where column: ${table3}.${k}`);
      }
      conds.push(`${q(k)} = ?`);
      let vv = v;
      if (BOOL_COLS.has(k)) vv = v ? 1 : 0;
      binds.push(vv);
    }
    sql += " WHERE " + conds.join(" AND ");
  }
  if (sort && sort.length) {
    const orders = sort.map((s2) => {
      if (!SCHEMA[table3].includes(s2.field) && s2.field !== "id") {
        throw new Error(`Unknown sort column: ${table3}.${s2.field}`);
      }
      return `${q(s2.field)} ${s2.direction === "desc" ? "DESC" : "ASC"}`;
    });
    sql += " ORDER BY " + orders.join(", ");
  }
  const lim = limit || pageSize;
  if (lim) {
    const n = Math.max(1, Math.min(parseInt(lim, 10) || 100, 1e3));
    sql += " LIMIT " + n;
    const off2 = Math.max(0, parseInt(offset, 10) || 0);
    if (off2 > 0) sql += " OFFSET " + off2;
  }
  const result = await env2.DB.prepare(sql).bind(...binds).all();
  return { records: (result.results || []).map((r) => rowToRecord(r, table3)) };
}
__name(d1List, "d1List");
async function d1ListAll(env2, table3, opts = {}) {
  const r = await d1List(env2, table3, { ...opts, limit: 5e3 });
  return r.records;
}
__name(d1ListAll, "d1ListAll");
async function d1Get(env2, table3, id2) {
  assertTable(table3);
  if (typeof id2 !== "string" || !id2) throw new Error("d1Get: invalid id");
  const row = await env2.DB.prepare(`SELECT * FROM ${table3} WHERE id = ?`).bind(id2).first();
  if (!row) {
    const err = new Error(`d1 get ${table3}/${id2}: not found`);
    err.notFound = true;
    throw err;
  }
  return rowToRecord(row, table3);
}
__name(d1Get, "d1Get");
async function d1Create(env2, table3, fields) {
  assertTable(table3);
  const id2 = fields.__id || generateId();
  const cleanFields = { ...fields };
  delete cleanFields.__id;
  const { cols, vals, placeholders } = fieldsToRow(cleanFields, table3);
  const allCols = ["id", ...cols];
  const allVals = [id2, ...vals];
  const allPlaceholders = ["?", ...placeholders];
  const sql = `INSERT INTO ${table3} (${allCols.join(",")}) VALUES (${allPlaceholders.join(",")})`;
  await env2.DB.prepare(sql).bind(...allVals).run();
  return d1Get(env2, table3, id2);
}
__name(d1Create, "d1Create");
async function d1Update(env2, table3, id2, fields) {
  assertTable(table3);
  const { cols, vals } = fieldsToRow(fields, table3);
  if (!cols.length) return d1Get(env2, table3, id2);
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const sql = `UPDATE ${table3} SET ${sets} WHERE id = ?`;
  const result = await env2.DB.prepare(sql).bind(...vals, id2).run();
  if (result.meta && result.meta.changes === 0) {
    const err = new Error(`d1 update ${table3}/${id2}: not found`);
    err.notFound = true;
    throw err;
  }
  return d1Get(env2, table3, id2);
}
__name(d1Update, "d1Update");
async function d1Delete(env2, table3, id2) {
  assertTable(table3);
  const result = await env2.DB.prepare(`DELETE FROM ${table3} WHERE id = ?`).bind(id2).run();
  if (result.meta && result.meta.changes === 0) {
    const err = new Error(`d1 delete ${table3}/${id2}: not found`);
    err.notFound = true;
    throw err;
  }
  return { deleted: true, id: id2 };
}
__name(d1Delete, "d1Delete");
async function d1BatchUpdateColumn(env2, table3, column, updates) {
  if (!updates || !updates.length) return { updated: 0 };
  assertTable(table3);
  const allowed = SCHEMA[table3] || [];
  if (!allowed.includes(column)) {
    throw new Error(`column ${column} not allowed for ${table3}`);
  }
  const safeCol = `"${column}"`;
  const sql = `UPDATE ${table3} SET ${safeCol} = ? WHERE id = ?`;
  const stmts = updates.map(
    (u) => env2.DB.prepare(sql).bind(u.value, String(u.id))
  );
  await env2.DB.batch(stmts);
  return { updated: updates.length };
}
__name(d1BatchUpdateColumn, "d1BatchUpdateColumn");
async function d1CreateMany(env2, table3, recordsFields) {
  if (!recordsFields.length) return [];
  assertTable(table3);
  const stmts = [];
  const ids = [];
  for (const fields of recordsFields) {
    const id2 = fields.__id || generateId();
    ids.push(id2);
    const cleanFields = { ...fields };
    delete cleanFields.__id;
    const { cols, vals, placeholders } = fieldsToRow(cleanFields, table3);
    const allCols = ["id", ...cols];
    const allVals = [id2, ...vals];
    const allPlaceholders = ["?", ...placeholders];
    const sql = `INSERT INTO ${table3} (${allCols.join(",")}) VALUES (${allPlaceholders.join(",")})`;
    stmts.push(env2.DB.prepare(sql).bind(...allVals));
  }
  await env2.DB.batch(stmts);
  const out = [];
  for (const id2 of ids) out.push(await d1Get(env2, table3, id2));
  return out;
}
__name(d1CreateMany, "d1CreateMany");
async function d1ReplaceAll(env2, table3, recordsFields) {
  assertTable(table3);
  await env2.DB.prepare(`DELETE FROM ${table3}`).run();
  return d1CreateMany(env2, table3, recordsFields);
}
__name(d1ReplaceAll, "d1ReplaceAll");

// src/lib/services.js
function createTableRepository(env2, table3) {
  return {
    list(opts) {
      return d1List(env2, table3, opts);
    },
    listAll(opts) {
      return d1ListAll(env2, table3, opts);
    },
    get(id2) {
      return d1Get(env2, table3, id2);
    },
    create(fields) {
      return d1Create(env2, table3, fields);
    },
    update(id2, fields) {
      return d1Update(env2, table3, id2, fields);
    },
    delete(id2) {
      return d1Delete(env2, table3, id2);
    },
    replaceAll(recordsFields) {
      return d1ReplaceAll(env2, table3, recordsFields);
    },
    batchUpdateColumn(column, updates) {
      return d1BatchUpdateColumn(env2, table3, column, updates);
    }
  };
}
__name(createTableRepository, "createTableRepository");
function createMediaStore(bucket, publicBase) {
  return {
    upload(key, body, opts = {}) {
      if (!bucket) throw new Error("R2 binding (IMAGES) missing");
      return r2Upload(bucket, key, body, {
        ...opts,
        publicBase: opts.publicBase || publicBase
      });
    },
    deleteMany(urls) {
      return r2DeleteMany(bucket, urls, publicBase);
    }
  };
}
__name(createMediaStore, "createMediaStore");
function createObjectStore(bucket) {
  return {
    async putJson(key, data) {
      if (!bucket) throw new Error("R2 binding (IMAGES) missing");
      await bucket.put(key, JSON.stringify(data), {
        httpMetadata: { contentType: "application/json; charset=utf-8" }
      });
      return key;
    }
  };
}
__name(createObjectStore, "createObjectStore");
function createServices(env2 = {}) {
  return {
    estimates: createTableRepository(env2, "Estimates"),
    estimateMemos: createTableRepository(env2, "EstimateMemos"),
    clients: createTableRepository(env2, "Clients"),
    works: createTableRepository(env2, "Works"),
    workComments: createTableRepository(env2, "WorkComments"),
    heroSlides: createTableRepository(env2, "HeroSlides"),
    portfolio: createTableRepository(env2, "Portfolio"),
    community: createTableRepository(env2, "Community"),
    analyticsSnapshots: createTableRepository(env2, "AnalyticsSnapshots"),
    adminSettings: createTableRepository(env2, "AdminSettings"),
    popups: createTableRepository(env2, "Popups"),
    messageTemplates: createTableRepository(env2, "MessageTemplates"),
    smsLogs: createTableRepository(env2, "SmsLogs"),
    healthChecks: createTableRepository(env2, "HealthChecks"),
    intakeEvents: createTableRepository(env2, "IntakeEvents"),
    systemHeartbeats: createTableRepository(env2, "SystemHeartbeats"),
    metaFormSchemas: createTableRepository(env2, "MetaFormSchemas"),
    analyticsRaw: createObjectStore(env2.IMAGES),
    media: createMediaStore(env2.IMAGES, env2.R2_PUBLIC_BASE)
  };
}
__name(createServices, "createServices");

// src/lib/upload-policy.js
var IMAGE_EXTS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"]);
var DOCUMENT_EXTS = /* @__PURE__ */ new Set(["pdf", "zip"]);
function fileExt(name) {
  return String(name || "").split(".").pop().toLowerCase().slice(0, 12);
}
__name(fileExt, "fileExt");
function isImageUpload(file) {
  const type = String(file?.type || "").toLowerCase();
  const ext = fileExt(file?.name);
  return type.startsWith("image/") || IMAGE_EXTS.has(ext);
}
__name(isImageUpload, "isImageUpload");
function isAllowedDocumentUpload(file) {
  const type = String(file?.type || "").toLowerCase();
  const ext = fileExt(file?.name);
  if (!DOCUMENT_EXTS.has(ext)) return false;
  if (ext === "pdf") return type === "application/pdf";
  return [
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream"
  ].includes(type);
}
__name(isAllowedDocumentUpload, "isAllowedDocumentUpload");
function uploadPolicyError(file, { allowDocuments = false } = {}) {
  if (isImageUpload(file)) return null;
  if (allowDocuments && isAllowedDocumentUpload(file)) return null;
  return allowDocuments ? "Only image files, PDF files, or ZIP files are allowed" : "Only image files are allowed";
}
__name(uploadPolicyError, "uploadPolicyError");
function assertUploadPolicy(file, opts = {}) {
  const message = uploadPolicyError(file, opts);
  if (!message) return;
  const err = new Error(message);
  err.status = 415;
  throw err;
}
__name(assertUploadPolicy, "assertUploadPolicy");

// src/lib/telegram.js
var TELEGRAM_MAX_TEXT_LENGTH = 3900;
function splitTelegramText(text) {
  const value = String(text || "");
  if (value.length <= TELEGRAM_MAX_TEXT_LENGTH) return value ? [value] : [];
  const chunks = [];
  let remaining = value;
  while (remaining.length > TELEGRAM_MAX_TEXT_LENGTH) {
    let splitAt = remaining.lastIndexOf("\n\n", TELEGRAM_MAX_TEXT_LENGTH);
    if (splitAt < TELEGRAM_MAX_TEXT_LENGTH * 0.6) {
      splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_TEXT_LENGTH);
    }
    if (splitAt < TELEGRAM_MAX_TEXT_LENGTH * 0.6) {
      splitAt = remaining.lastIndexOf(" ", TELEGRAM_MAX_TEXT_LENGTH);
    }
    if (splitAt <= 0) splitAt = TELEGRAM_MAX_TEXT_LENGTH;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
__name(splitTelegramText, "splitTelegramText");
function telegramChatIds(env2) {
  return [
    ...new Set(
      [env2.TELEGRAM_CHAT_ID, env2.TELEGRAM_ADMIN_CHAT_ID].map((value) => String(value || "").trim()).filter(Boolean)
    )
  ];
}
__name(telegramChatIds, "telegramChatIds");
async function notifyInfra(env2, text) {
  const botToken = String(env2.INFRA_BOT_TOKEN || "").trim();
  const chatId = String(env2.INFRA_CHAT_ID || "").trim();
  if (botToken && chatId) {
    return notifyTelegram(env2, text, { botToken, chatId });
  }
  return notifyTelegram(env2, text);
}
__name(notifyInfra, "notifyInfra");
async function notifyTelegram(env2, text, opts = {}) {
  const botToken = String(opts.botToken || env2.TELEGRAM_BOT_TOKEN || "").trim();
  let chatIds;
  if (opts.chatId) {
    chatIds = (Array.isArray(opts.chatId) ? opts.chatId : [opts.chatId]).map((v) => String(v || "").trim()).filter(Boolean);
  } else {
    chatIds = telegramChatIds(env2);
  }
  if (!botToken || !chatIds.length) return;
  try {
    const chunks = splitTelegramText(text);
    for (const chatId of chatIds) {
      for (const chunk of chunks) {
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: chunk,
              parse_mode: "HTML",
              disable_web_page_preview: true
            })
          }
        );
        if (!res.ok) {
          const body = await res.text();
          console.error(
            "telegram:",
            `Telegram API ${res.status}: ${body.slice(0, 200)}`
          );
        }
      }
    }
  } catch (e) {
    console.error("telegram:", e);
  }
}
__name(notifyTelegram, "notifyTelegram");

// src/routes/pixel-events.js
var ALLOWED = /* @__PURE__ */ new Set([
  "PageView",
  "ViewContent",
  "Contact",
  "InitiateCheckout",
  "Search",
  "FormStart",
  "SubmitAttempt",
  "ValidationError",
  "SubmitError",
  "FormSuccess"
]);
var s = /* @__PURE__ */ __name((v, n) => String(v || "").slice(0, n), "s");
var SOURCE_TENANT_ID = "day1design";
async function handlePixelEvents(request, env2, ctx) {
  if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return jsonError(400, "invalid json");
  }
  const eventName = s(body.event_name, 40);
  if (!ALLOWED.has(eventName)) return jsonOk({ skipped: true });
  try {
    await env2.DB.prepare(
      `INSERT INTO pixel_events
         (id, CrmTenantId, created_at, event_name, ga4_name, channel, event_id, page_path, source, session_id,
          campaign, adset, ad, ad_id, fbclid, event_detail, estimate_id, ip, ua)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, 'pixel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(),
      SOURCE_TENANT_ID,
      eventName,
      s(body.ga4_name, 60),
      s(body.event_id, 100),
      s(body.page_path, 300),
      s(body.source, 40),
      s(body.session_id, 64),
      s(body.campaign, 120),
      s(body.adset, 120),
      s(body.ad, 120),
      s(body.ad_id, 40),
      s(body.fbclid, 200),
      s(body.event_detail, 160),
      s(body.estimate_id, 40),
      clientIP(request),
      s(request.headers.get("user-agent"), 400)
    ).run();
  } catch {
  }
  return jsonOk({ received: true });
}
__name(handlePixelEvents, "handlePixelEvents");
async function logPixelEvent(env2, row = {}) {
  try {
    await env2.DB.prepare(
      `INSERT INTO pixel_events
         (id, CrmTenantId, created_at, event_name, ga4_name, channel, event_id, page_path, source, session_id,
          campaign, adset, ad, ad_id, fbclid, event_detail, estimate_id, capi_status, matched_fields, ip, ua)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(),
      SOURCE_TENANT_ID,
      s(row.event_name || "Lead", 40),
      s(row.ga4_name, 60),
      s(row.channel || "capi", 10),
      s(row.event_id, 100),
      s(row.page_path, 300),
      s(row.source, 40),
      s(row.session_id, 64),
      s(row.campaign, 120),
      s(row.adset, 120),
      s(row.ad, 120),
      s(row.ad_id, 40),
      s(row.fbclid, 200),
      s(row.event_detail, 160),
      s(row.estimate_id, 40),
      s(row.capi_status, 20),
      s(row.matched_fields, 120),
      s(row.ip, 60),
      s(row.ua, 400)
    ).run();
  } catch {
  }
}
__name(logPixelEvent, "logPixelEvent");
async function handlePixelEventsAdmin(request, env2) {
  if (!await verifyAdmin(request, env2)) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1),
    365
  );
  const since = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${days} days')`;
  const byName = await env2.DB.prepare(
    `SELECT event_name, COUNT(*) c FROM pixel_events WHERE created_at >= ${since} GROUP BY event_name`
  ).all();
  const nameCount = {};
  for (const r of byName.results || []) nameCount[r.event_name] = r.c;
  const daily = await env2.DB.prepare(
    `SELECT substr(created_at,1,10) d, event_name, COUNT(*) c
       FROM pixel_events WHERE created_at >= ${since}
       GROUP BY d, event_name ORDER BY d ASC LIMIT 4000`
  ).all();
  const bySource = await env2.DB.prepare(
    `SELECT COALESCE(NULLIF(source,''),'homepage') source, COUNT(*) c
       FROM pixel_events WHERE created_at >= ${since}
       GROUP BY source ORDER BY c DESC LIMIT 12`
  ).all();
  const byAd = await env2.DB.prepare(
    `SELECT COALESCE(NULLIF(ad,''), NULLIF(ad_id,''), NULLIF(campaign,'')) label,
            ad_id, campaign,
            COUNT(*) total,
            SUM(CASE WHEN event_name='Lead' THEN 1 ELSE 0 END) leads
       FROM pixel_events
       WHERE created_at >= ${since} AND (ad_id <> '' OR ad <> '' OR campaign <> '')
       GROUP BY label ORDER BY total DESC LIMIT 20`
  ).all();
  const leadStat = await env2.DB.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN event_id <> '' THEN 1 ELSE 0 END) dedup
       FROM pixel_events WHERE created_at >= ${since} AND event_name='Lead'`
  ).first();
  const matchRows = await env2.DB.prepare(
    `SELECT channel,
            COALESCE(NULLIF(matched_fields,''),'(\uC5C6\uC74C)') matched_fields,
            capi_status,
            COUNT(*) n
       FROM pixel_events
      WHERE created_at >= ${since} AND event_name='Lead'
      GROUP BY channel, matched_fields, capi_status
      ORDER BY n DESC LIMIT 30`
  ).all();
  const leadReconcile = await env2.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM pixel_events
         WHERE created_at >= ${since} AND event_name='Lead' AND channel <> 'capi') tracked,
       (SELECT COUNT(*) FROM Estimates
         WHERE SubmittedAt >= ${since} AND Status NOT IN ('\uC791\uC131\uC911','\uC624\uB958')
           AND Source <> 'meta') recorded`
  ).first();
  const items = await env2.DB.prepare(
    `SELECT created_at, event_name, channel, event_id, page_path, source, campaign, ad, ad_id,
            event_detail, estimate_id, capi_status
       FROM pixel_events WHERE created_at >= ${since}
       ORDER BY created_at DESC LIMIT 200`
  ).all();
  const outcome = await env2.DB.prepare(
    `SELECT COUNT(*) inquiries,
            SUM(CASE WHEN ContactedAt <> '' OR Status IN ('\uC0C1\uB2F4\uC911','\uACAC\uC801\uC644\uB8CC','\uACC4\uC57D\uC644\uB8CC','\uC804\uD654\uC0C1\uB2F4 \uD6C4 \uBBF8\uC9C4\uD589','\uC804\uD654\uC0C1\uB2F4 \uD6C4 \uBBF8\uD305\uC608\uC57D','\uC804\uD654\uC0C1\uB2F4 \uD6C4 \uB300\uAE30\uC911') THEN 1 ELSE 0 END) contacted,
            SUM(CASE WHEN Status='\uC804\uD654\uC0C1\uB2F4 \uD6C4 \uBBF8\uD305\uC608\uC57D' THEN 1 ELSE 0 END) meetings,
            SUM(CASE WHEN Status IN ('\uACAC\uC801\uC644\uB8CC','\uACC4\uC57D\uC644\uB8CC') THEN 1 ELSE 0 END) quoted,
            SUM(CASE WHEN Status='\uACC4\uC57D\uC644\uB8CC' THEN 1 ELSE 0 END) contracted,
            SUM(CASE WHEN Status='\uACC4\uC57D\uC644\uB8CC' THEN COALESCE(NULLIF(ContractAmount,0), EstimateAmount, 0) ELSE 0 END) contract_value
       FROM Estimates
       WHERE SubmittedAt >= ${since} AND Status NOT IN ('\uC791\uC131\uC911','\uC624\uB958')`
  ).first();
  const byOutcome = await env2.DB.prepare(
    `SELECT COALESCE(NULLIF(MetaAd,''), NULLIF(MetaAdId,''), NULLIF(Campaign,''), '(\uBBF8\uC9C0\uC815)') label,
            MetaAdId ad_id,
            COALESCE(NULLIF(MetaCampaign,''), NULLIF(UtmCampaign,''), NULLIF(Campaign,''), '') campaign,
            COUNT(*) inquiries,
            SUM(CASE WHEN ContactedAt <> '' OR Status IN ('\uC0C1\uB2F4\uC911','\uACAC\uC801\uC644\uB8CC','\uACC4\uC57D\uC644\uB8CC','\uC804\uD654\uC0C1\uB2F4 \uD6C4 \uBBF8\uC9C4\uD589','\uC804\uD654\uC0C1\uB2F4 \uD6C4 \uBBF8\uD305\uC608\uC57D','\uC804\uD654\uC0C1\uB2F4 \uD6C4 \uB300\uAE30\uC911') THEN 1 ELSE 0 END) contacted,
            SUM(CASE WHEN Status IN ('\uACAC\uC801\uC644\uB8CC','\uACC4\uC57D\uC644\uB8CC') THEN 1 ELSE 0 END) quoted,
            SUM(CASE WHEN Status='\uACC4\uC57D\uC644\uB8CC' THEN 1 ELSE 0 END) contracted,
            SUM(CASE WHEN Status='\uACC4\uC57D\uC644\uB8CC' THEN COALESCE(NULLIF(ContractAmount,0), EstimateAmount, 0) ELSE 0 END) contract_value
       FROM Estimates
       WHERE SubmittedAt >= ${since} AND Status NOT IN ('\uC791\uC131\uC911','\uC624\uB958')
       GROUP BY label, ad_id, campaign
       ORDER BY inquiries DESC, contract_value DESC LIMIT 30`
  ).all();
  const dailyMap = {};
  for (const r of daily.results || []) {
    const b = dailyMap[r.d] = dailyMap[r.d] || {
      date: r.d,
      pageview: 0,
      interaction: 0,
      lead: 0
    };
    if (r.event_name === "PageView") b.pageview += r.c;
    else if (r.event_name === "Lead") b.lead += r.c;
    else b.interaction += r.c;
  }
  const total = Object.values(nameCount).reduce((a, b) => a + b, 0);
  const lead = nameCount.Lead || 0;
  const leadTotal = Number(leadStat?.total || 0);
  const leadDedup = Number(leadStat?.dedup || 0);
  return jsonOk({
    days,
    kpi: {
      total,
      pageview: nameCount.PageView || 0,
      viewcontent: nameCount.ViewContent || 0,
      contact: nameCount.Contact || 0,
      cta: nameCount.InitiateCheckout || 0,
      formStart: nameCount.FormStart || 0,
      submitAttempt: nameCount.SubmitAttempt || 0,
      validationError: nameCount.ValidationError || 0,
      submitError: nameCount.SubmitError || 0,
      formSuccess: nameCount.FormSuccess || 0,
      lead,
      dedupRate: leadTotal ? Math.round(leadDedup / leadTotal * 100) : 0,
      cr: nameCount.PageView ? lead / nameCount.PageView * 100 : 0
    },
    funnel: {
      pageview: nameCount.PageView || 0,
      viewcontent: nameCount.ViewContent || 0,
      cta_contact: (nameCount.InitiateCheckout || 0) + (nameCount.Contact || 0),
      form_start: nameCount.FormStart || 0,
      submit_attempt: nameCount.SubmitAttempt || 0,
      validation_error: nameCount.ValidationError || 0,
      submit_error: nameCount.SubmitError || 0,
      form_success: nameCount.FormSuccess || 0,
      lead
    },
    daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    bySource: (bySource.results || []).map((r) => ({
      source: r.source,
      count: r.c
    })),
    byAd: (byAd.results || []).map((r) => ({
      label: r.label || "(\uBBF8\uC9C0\uC815)",
      ad_id: r.ad_id || "",
      campaign: r.campaign || "",
      total: r.total,
      leads: r.leads
    })),
    match: {
      rows: (matchRows.results || []).map((r) => {
        const fields = String(r.matched_fields || "");
        return {
          channel: r.channel || "",
          capiStatus: r.capi_status || "",
          fields,
          signals: fields && fields !== "(\uC5C6\uC74C)" ? fields.split(",").length : 0,
          count: Number(r.n || 0)
        };
      }),
      tracked: Number(leadReconcile?.tracked || 0),
      recorded: Number(leadReconcile?.recorded || 0),
      missing: Math.max(
        0,
        Number(leadReconcile?.recorded || 0) - Number(leadReconcile?.tracked || 0)
      )
    },
    outcome: {
      inquiries: Number(outcome?.inquiries || 0),
      contacted: Number(outcome?.contacted || 0),
      meetings: Number(outcome?.meetings || 0),
      quoted: Number(outcome?.quoted || 0),
      contracted: Number(outcome?.contracted || 0),
      contractValue: Number(outcome?.contract_value || 0)
    },
    byOutcome: (byOutcome.results || []).map((r) => ({
      label: r.label || "(\uBBF8\uC9C0\uC815)",
      ad_id: r.ad_id || "",
      campaign: r.campaign || "",
      inquiries: Number(r.inquiries || 0),
      contacted: Number(r.contacted || 0),
      quoted: Number(r.quoted || 0),
      contracted: Number(r.contracted || 0),
      contractValue: Number(r.contract_value || 0)
    })),
    items: items.results || []
  });
}
__name(handlePixelEventsAdmin, "handlePixelEventsAdmin");

// src/lib/meta-capi.js
var API_VERSION = "v21.0";
function logLead(env2, info3, capiStatus, matched) {
  return logPixelEvent(env2, {
    event_name: "Lead",
    ga4_name: info3.gaName || "generate_lead",
    channel: info3.channel || (capiStatus === "skipped" ? "pixel" : "both"),
    event_id: info3.eventId || "",
    page_path: info3.pagePath || "/estimates",
    source: info3.source || "",
    session_id: info3.sessionId || "",
    campaign: info3.campaign || "",
    adset: info3.adset || "",
    ad: info3.ad || "",
    ad_id: info3.adId || "",
    fbclid: info3.fbclid || "",
    estimate_id: info3.estimateId || "",
    capi_status: capiStatus,
    matched_fields: matched || "",
    ip: info3.ip || "",
    ua: info3.ua || ""
  });
}
__name(logLead, "logLead");
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}
__name(normEmail, "normEmail");
function normName(v) {
  return String(v || "").trim().toLowerCase().replace(/[\s.,'"-]/g, "");
}
__name(normName, "normName");
function normPhone(v) {
  const d = String(v || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("82")) return d;
  if (d.startsWith("0")) return "82" + d.slice(1);
  return d;
}
__name(normPhone, "normPhone");
async function sendMetaCapiLead(env2, ctx, info3 = {}) {
  const pixelId = String(env2.META_PIXEL_ID || "").trim();
  const token = String(env2.META_CAPI_TOKEN || "").trim();
  if (!pixelId || !token) {
    await logLead(env2, info3, "skipped", "");
    return { skipped: true };
  }
  const userData = {};
  const em = normEmail(info3.email);
  if (em) userData.em = [await sha256Hex(em)];
  const ph = normPhone(info3.phone);
  if (ph) userData.ph = [await sha256Hex(ph)];
  const fn = normName(info3.name);
  if (fn) userData.fn = [await sha256Hex(fn)];
  if (info3.externalId)
    userData.external_id = [await sha256Hex(String(info3.externalId))];
  if (info3.ip) userData.client_ip_address = info3.ip;
  if (info3.ua) userData.client_user_agent = info3.ua;
  if (info3.fbp) userData.fbp = info3.fbp;
  if (info3.fbc) userData.fbc = info3.fbc;
  const matched = Object.keys(userData).join(",");
  const actionSource = info3.actionSource || "website";
  const event = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1e3),
    action_source: actionSource,
    user_data: userData
  };
  if (actionSource === "website") {
    event.event_source_url = info3.sourceUrl || "https://day1design.co.kr/estimates";
  }
  if (info3.eventId) event.event_id = info3.eventId;
  const payload = { data: [event] };
  if (env2.META_CAPI_TEST_CODE)
    payload.test_event_code = env2.META_CAPI_TEST_CODE;
  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await logLead(env2, info3, "failed", matched);
      await notifyTelegram(
        env2,
        `[day1design/meta-capi] Lead \uC804\uC1A1 \uC2E4\uD328 ${res.status}
${body.slice(0, 200)}`
      );
      return { ok: false, status: res.status };
    }
    await logLead(env2, info3, "sent", matched);
    return { ok: true };
  } catch (e) {
    await logLead(env2, info3, "failed", matched);
    await notifyTelegram(
      env2,
      `[day1design/meta-capi] \uC608\uC678
${(e?.message || "").slice(0, 200)}`
    );
    return { ok: false, error: e?.message };
  }
}
__name(sendMetaCapiLead, "sendMetaCapiLead");

// src/lib/email.js
function uniqueList(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}
__name(uniqueList, "uniqueList");
function base64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
}
__name(base64Utf8, "base64Utf8");
function base64UrlUtf8(value) {
  return base64Utf8(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlUtf8, "base64UrlUtf8");
function encodeHeader(value) {
  return `=?UTF-8?B?${base64Utf8(value)}?=`;
}
__name(encodeHeader, "encodeHeader");
function safeHeaderAddress(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}
__name(safeHeaderAddress, "safeHeaderAddress");
function htmlToText(value) {
  return String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
__name(htmlToText, "htmlToText");
async function gmailAccessToken(env2) {
  if (!env2.GMAIL_CLIENT_ID || !env2.GMAIL_CLIENT_SECRET || !env2.GMAIL_REFRESH_TOKEN) {
    return null;
  }
  const body = new URLSearchParams({
    client_id: env2.GMAIL_CLIENT_ID,
    client_secret: env2.GMAIL_CLIENT_SECRET,
    refresh_token: env2.GMAIL_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token || null;
}
__name(gmailAccessToken, "gmailAccessToken");
function isEmailConfigured(env2) {
  return Boolean(
    env2.GMAIL_CLIENT_ID && env2.GMAIL_CLIENT_SECRET && env2.GMAIL_REFRESH_TOKEN && env2.GMAIL_USER
  );
}
__name(isEmailConfigured, "isEmailConfigured");
async function sendEmail(env2, { to, subject, text, html } = {}) {
  if (!isEmailConfigured(env2)) return;
  try {
    const accessToken2 = await gmailAccessToken(env2);
    if (!accessToken2) return;
    const from = String(env2.GMAIL_USER).trim();
    const recipients = uniqueList(Array.isArray(to) ? to : [to]);
    if (!recipients.length) return;
    const bodyText = text || htmlToText(html);
    const safeSubject = encodeHeader(subject || "DAYONE \uC54C\uB9BC");
    const boundary = `dayone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const headerLines = [
      `From: DAYONE DESIGN <${safeHeaderAddress(from)}>`,
      `To: ${recipients.map(safeHeaderAddress).join(", ")}`,
      `Subject: ${safeSubject}`,
      "MIME-Version: 1.0"
    ];
    const raw = html ? [
      ...headerLines,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      bodyText,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      `--${boundary}--`
    ].join("\r\n") : [
      ...headerLines,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      bodyText
    ].join("\r\n");
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken2}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ raw: base64UrlUtf8(raw) })
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gmail send ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.error("email:", e);
  }
}
__name(sendEmail, "sendEmail");
async function notifyEmail(env2, { subject, text, html } = {}) {
  return sendEmail(env2, {
    to: [env2.GMAIL_NOTIFY_TO, env2.NOTIFY_EMAIL_TO, env2.GMAIL_USER],
    subject,
    text,
    html
  });
}
__name(notifyEmail, "notifyEmail");

// src/lib/sens.js
var SENS_BASE = "https://sens.apigw.ntruss.com";
var SMS_BYTE_LIMIT = 90;
async function fetchWithTimeout(url, init, timeoutMs = 15e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
__name(fetchWithTimeout, "fetchWithTimeout");
function utf8ByteLength(s2) {
  return new TextEncoder().encode(String(s2 || "")).length;
}
__name(utf8ByteLength, "utf8ByteLength");
function pickSmsType(content) {
  return utf8ByteLength(content) <= SMS_BYTE_LIMIT ? "SMS" : "LMS";
}
__name(pickSmsType, "pickSmsType");
function normalizePhone(p) {
  return String(p || "").replace(/\D/g, "");
}
__name(normalizePhone, "normalizePhone");
async function hmacSha256Base64(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  let bin = "";
  const view = new Uint8Array(sig);
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return btoa(bin);
}
__name(hmacSha256Base64, "hmacSha256Base64");
function buildSignature({ method, url, timestamp, accessKey, secretKey }) {
  const message = `${method} ${url}
${timestamp}
${accessKey}`;
  return hmacSha256Base64(secretKey, message);
}
__name(buildSignature, "buildSignature");
function readSensEnv(env2) {
  return {
    accessKey: String(env2.NCP_SENS_ACCESS_KEY || "").trim(),
    secretKey: String(env2.NCP_SENS_SECRET_KEY || "").trim(),
    serviceId: String(env2.NCP_SENS_SERVICE_ID || "").trim(),
    from: normalizePhone(env2.NCP_SENS_FROM_NUMBER)
  };
}
__name(readSensEnv, "readSensEnv");
async function sendNcpSens(env2, { to, content, subject, type: forcedType = "auto" } = {}) {
  const { accessKey, secretKey, serviceId, from } = readSensEnv(env2);
  const cleanTo = normalizePhone(to);
  if (!accessKey || !secretKey || !serviceId) {
    return { ok: false, skipped: true, reason: "sens-env-missing" };
  }
  if (!from) {
    return { ok: false, skipped: true, reason: "from-number-not-registered" };
  }
  if (!cleanTo) {
    return { ok: false, skipped: true, reason: "invalid-to" };
  }
  if (!content) {
    return { ok: false, skipped: true, reason: "empty-content" };
  }
  const path = `/sms/v2/services/${serviceId}/messages`;
  const timestamp = String(Date.now());
  const signature = await buildSignature({
    method: "POST",
    url: path,
    timestamp,
    accessKey,
    secretKey
  });
  const type = forcedType === "LMS" || forcedType === "SMS" ? forcedType : pickSmsType(content);
  const payload = {
    type,
    contentType: "COMM",
    countryCode: "82",
    from,
    content,
    messages: [{ to: cleanTo }]
  };
  if (type === "LMS" && subject) {
    payload.subject = String(subject).slice(0, 40);
  }
  const res = await fetchWithTimeout(`${SENS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": accessKey,
      "x-ncp-apigw-signature-v2": signature
    },
    body: JSON.stringify(payload)
  }, 15e3);
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
  }
  return {
    ok: res.ok,
    status: res.status,
    body: bodyText.slice(0, 500),
    type
  };
}
__name(sendNcpSens, "sendNcpSens");
var CUSTOMER_SMS_SUBJECT = "[\uB370\uC774\uC6D0\uB514\uC790\uC778] \uC0C1\uB2F4 \uC811\uC218 \uD655\uC778";
var ADDRESS_BLOCK = [
  "[\uB370\uC774\uC6D0 \uC0AC\uBB34\uC2E4 \uC8FC\uC18C]",
  "\uAC15\uB0A8\uBCF8\uC810 : \uAC15\uB0A8\uAD6C \uB17C\uD604\uB85C 562 \uC5ED\uC0BC\uB3D9 \uB3D9\uADF9\uBE4C\uB529 2\uCE35(\uAC74\uBB3C \uAE30\uACC4\uC2DD \uC8FC\uCC28 \uAC00\uB2A5 -\uBB34\uB8CC)",
  "\uD310\uAD50\uC810 : \uBD84\uB2F9\uAD6C \uD310\uAD50\uACF5\uC6D0\uB85C1\uAE38 22-1, 1\uCE35(\uAC74\uBB3C \uC55E \uC8FC\uCC28\uAC00\uB2A5)",
  "https://naver.me/FpwVn9Ta"
].join("\n");
var CHANNEL_INTRO = {
  homepage: [
    "\uD648\uD398\uC774\uC9C0\uC758 \uACAC\uC801\uBB38\uC758 \uBA54\uB274\uB97C \uD1B5\uD574",
    "\uC791\uC131\uD574\uC8FC\uC2E0 \uC591\uC2DD\uC774 \uC815\uC0C1\uC801\uC73C\uB85C",
    "\uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
  ],
  instagram: [
    "\uC778\uC2A4\uD0C0\uADF8\uB7A8 \uC7A0\uC7AC\uACE0\uAC1D \uC591\uC2DD\uD3FC\uC744 \uD1B5\uD574",
    "\uC791\uC131\uD574\uC8FC\uC2E0 \uC0C1\uB2F4\uBB38\uC758\uAC00 \uC815\uC0C1\uC801\uC73C\uB85C",
    "\uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
  ],
  facebook: [
    "\uD398\uC774\uC2A4\uBD81 \uC7A0\uC7AC\uACE0\uAC1D \uC591\uC2DD\uD3FC\uC744 \uD1B5\uD574",
    "\uC791\uC131\uD574\uC8FC\uC2E0 \uC0C1\uB2F4\uBB38\uC758\uAC00 \uC815\uC0C1\uC801\uC73C\uB85C",
    "\uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
  ]
};
function buildCustomerSms(channel2 = "homepage") {
  const intro = CHANNEL_INTRO[channel2] || CHANNEL_INTRO.homepage;
  return [
    "\u203B\u203B\uC0C1\uB2F4 \uC811\uC218 \uD655\uC778\u203B\u203B",
    "\uC548\uB155\uD558\uC138\uC694 \uACE0\uAC1D\uB2D8,",
    "[\uB370\uC774\uC6D0\uB514\uC790\uC778]\uC785\uB2C8\uB2E4.",
    "",
    ...intro,
    "",
    "\uC811\uC218 \uBB38\uC758\uB97C \uD655\uC778\uD558\uB294\uB300\uB85C \uB2F4\uB2F9 \uB9E4\uB2C8\uC800\uAC00 \uACE0\uAC1D\uB2D8\uAED8",
    "\uC5F0\uB77D\uB4DC\uB824 \uC804\uD654\uC0C1\uB2F4\uC744 \uC9C4\uD589\uD560 \uC608\uC815\uC785\uB2C8\uB2E4.",
    "",
    "\uAC10\uC0AC\uD569\uB2C8\uB2E4.",
    "",
    ADDRESS_BLOCK,
    "",
    "***\uD648\uD398\uC774\uC9C0 \uC548\uB0B4***",
    "https://day1design.co.kr/"
  ].join("\n");
}
__name(buildCustomerSms, "buildCustomerSms");

// src/lib/intake-log.js
function maskName(name) {
  const s2 = String(name || "").trim();
  if (!s2) return "";
  if (s2.length === 1) return s2;
  return s2[0] + "\u25CB".repeat(s2.length - 1);
}
__name(maskName, "maskName");
function maskPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 7) return d ? d.slice(0, 3) + "****" : "";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}
__name(maskPhone, "maskPhone");
function overallOf(steps) {
  const vals = Object.values(steps || {});
  if (vals.includes("fail")) return "fail";
  if (vals.includes("skip")) return "warn";
  return "ok";
}
__name(overallOf, "overallOf");
async function logIntakeEvent(services, ev = {}) {
  try {
    const steps = ev.steps || {};
    await services.intakeEvents.create({
      At: ev.at || (/* @__PURE__ */ new Date()).toISOString(),
      Channel: String(ev.channel || ""),
      Source: String(ev.source || ""),
      Branch: String(ev.branch || ""),
      RefName: maskName(ev.name),
      RefPhone: maskPhone(ev.phone),
      Geo: String(ev.geo || ""),
      EstimateId: String(ev.estimateId || ""),
      Steps: JSON.stringify(steps),
      Overall: ev.overall || overallOf(steps),
      IP: String(ev.ip || "")
    });
  } catch {
  }
}
__name(logIntakeEvent, "logIntakeEvent");

// src/lib/audit-log.js
function randomId2() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `aud_${t}${r}`;
}
__name(randomId2, "randomId");
function clientIPFrom(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}
__name(clientIPFrom, "clientIPFrom");
function uaFrom(request) {
  return (request.headers.get("user-agent") || "").slice(0, 240);
}
__name(uaFrom, "uaFrom");
function urlMeta(request) {
  try {
    const u = new URL(request.url);
    return { path: u.pathname, method: request.method || "GET" };
  } catch {
    return { path: "", method: request.method || "GET" };
  }
}
__name(urlMeta, "urlMeta");
async function writeAuditLog(env2, request, log3 = {}) {
  if (!env2?.DB) return;
  try {
    const id2 = randomId2();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const meta = request ? urlMeta(request) : { path: "", method: "" };
    const ip = request ? clientIPFrom(request) : "";
    const ua = request ? uaFrom(request) : "";
    const severity = log3.severity || "info";
    const message = String(log3.message || "").slice(0, 480);
    let payloadKey = "";
    if (log3.payload && env2.IMAGES) {
      try {
        const key = `audit/${createdAt.slice(0, 10)}/${id2}.json`;
        await env2.IMAGES.put(key, JSON.stringify(log3.payload), {
          httpMetadata: { contentType: "application/json; charset=utf-8" }
        });
        payloadKey = key;
      } catch {
      }
    }
    await env2.DB.prepare(
      `INSERT INTO AdminAuditLogs (
         id, Type, Severity, Path, Method, Status, IP, UA, Username, Message, PayloadKey, CreatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id2,
      String(log3.type || "").slice(0, 60),
      severity,
      meta.path.slice(0, 240),
      meta.method.slice(0, 16),
      Number(log3.status || 0) | 0,
      ip.slice(0, 64),
      ua,
      String(log3.username || "").slice(0, 80),
      message,
      payloadKey,
      createdAt
    ).run();
  } catch {
  }
}
__name(writeAuditLog, "writeAuditLog");
function queueAudit(ctx, env2, request, log3) {
  if (!ctx?.waitUntil) return;
  ctx.waitUntil(writeAuditLog(env2, request, log3));
}
__name(queueAudit, "queueAudit");

// src/lib/sheets.js
var TIMEOUT_MS = 8e3;
var LEAD_SHEET_HEADER = [
  "\uC811\uC218\uC2DC\uAC04",
  // A — ISO UTC (기존 행과 동일 포맷)
  "\uCEA0\uD398\uC778",
  // B
  "\uD50C\uB7AB\uD3FC",
  // C — 기존 표기 유지: ig / fb
  "\uC9C0\uC5ED",
  // D
  "\uC774\uB984",
  // E
  "\uC5F0\uB77D\uCC98",
  // F
  "\uACF5\uAC04\uC720\uD615",
  // G
  "\uBA74\uC801",
  // H
  "\uAC00\uC6A9\uC608\uC0B0",
  // I
  "\uC2DC\uACF5\uC608\uC815\uC77C",
  // J
  "\uC0C1\uB2F4\uB0B4\uC6A9",
  // K
  "\uBA54\uC77C\uBC1C\uC1A1",
  // L — Make 시절 컬럼. 워커는 채우지 않는다(발송 결과는 접수관리/작동로그).
  "\uCD9C\uCC98",
  // M — homepage / meta
  "\uC774\uBA54\uC77C",
  // N
  "\uC811\uC218ID"
  // O — D1 Estimates.id (어드민 대조용)
];
function platformCode(platform2) {
  const v = String(platform2 || "").toLowerCase();
  if (v === "instagram" || v === "ig") return "ig";
  if (v === "facebook" || v === "fb") return "fb";
  return v;
}
__name(platformCode, "platformCode");
function sheetsRefreshToken(env2) {
  return env2.GOOGLE_SHEETS_REFRESH_TOKEN || env2.GOOGLE_REFRESH_TOKEN || "";
}
__name(sheetsRefreshToken, "sheetsRefreshToken");
function sheetsClient(env2) {
  return {
    id: env2.GOOGLE_SHEETS_CLIENT_ID || env2.GOOGLE_CLIENT_ID || "",
    secret: env2.GOOGLE_SHEETS_CLIENT_SECRET || env2.GOOGLE_CLIENT_SECRET || ""
  };
}
__name(sheetsClient, "sheetsClient");
function isSheetEnabled(env2) {
  const v = String(env2?.LEADS_SHEET_ENABLED ?? "1").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}
__name(isSheetEnabled, "isSheetEnabled");
function isSheetConfigured(env2) {
  const client = env2 ? sheetsClient(env2) : { id: "", secret: "" };
  return Boolean(
    env2 && isSheetEnabled(env2) && env2.LEADS_SHEET_ID && client.id && client.secret && sheetsRefreshToken(env2)
  );
}
__name(isSheetConfigured, "isSheetConfigured");
function toSheetStamp(iso2) {
  const ms = Date.parse(String(iso2 || ""));
  return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
}
__name(toSheetStamp, "toSheetStamp");
function buildLeadRow(lead = {}) {
  const cell = /* @__PURE__ */ __name((v) => String(v ?? "").replace(/\r/g, "").slice(0, 2e3), "cell");
  return [
    toSheetStamp(lead.submittedAt),
    cell(lead.campaign),
    platformCode(lead.platform),
    cell(lead.address),
    cell(lead.name),
    cell(lead.phone),
    cell(lead.spaceType),
    cell(lead.spaceSize),
    cell(lead.budget),
    cell(lead.schedule),
    cell(lead.detail),
    "",
    // 메일발송 — Make 시절 컬럼. append 시점엔 발송 결과를 모르므로 비운다.
    cell(lead.source),
    cell(lead.email),
    cell(lead.id)
  ];
}
__name(buildLeadRow, "buildLeadRow");
async function accessToken(env2, fetchImpl) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: sheetsClient(env2).id,
      client_secret: sheetsClient(env2).secret,
      refresh_token: sheetsRefreshToken(env2),
      grant_type: "refresh_token"
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `sheets_oauth_${res.status}${body?.error ? `_${body.error}` : ""}`
    );
  }
  return body.access_token;
}
__name(accessToken, "accessToken");
async function firstSheetTitle(env2, token, fetchImpl) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    env2.LEADS_SHEET_ID
  )}?fields=sheets.properties.title`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = await res.json().catch(() => ({}));
  const title2 = body?.sheets?.[0]?.properties?.title;
  if (!res.ok || !title2) throw new Error(`sheets_meta_${res.status}`);
  return title2;
}
__name(firstSheetTitle, "firstSheetTitle");
async function appendValues(env2, token, tab, values, fetchImpl) {
  const range = `${tab}!A:${String.fromCharCode(64 + LEAD_SHEET_HEADER.length)}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    env2.LEADS_SHEET_ID
  )}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ values }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`sheets_append_${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return true;
}
__name(appendValues, "appendValues");
async function appendLeadToSheet(env2, lead, { fetchImpl = fetch } = {}) {
  if (!isSheetEnabled(env2)) return { skipped: true, reason: "disabled" };
  if (!isSheetConfigured(env2)) return { skipped: true, reason: "unconfigured" };
  const token = await accessToken(env2, fetchImpl);
  const values = [buildLeadRow(lead)];
  const tab = String(env2.LEADS_SHEET_TAB || "\uACE0\uAC1D\uC815\uBCF4").trim();
  try {
    await appendValues(env2, token, tab, values, fetchImpl);
  } catch (e) {
    if (e.status !== 400) throw e;
    const resolved = await firstSheetTitle(env2, token, fetchImpl);
    await appendValues(env2, token, resolved, values, fetchImpl);
  }
  return { ok: true };
}
__name(appendLeadToSheet, "appendLeadToSheet");

// src/lib/edge-cache.js
function cacheKey(namespace) {
  return new Request(
    `https://cache.internal/day1design/${encodeURIComponent(namespace)}`,
    { method: "GET" }
  );
}
__name(cacheKey, "cacheKey");
async function edgeCacheGet(namespace) {
  try {
    const res = await caches.default.match(cacheKey(namespace));
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}
__name(edgeCacheGet, "edgeCacheGet");
async function edgeCachePut(namespace, data, ttlSeconds = 30, ctx) {
  try {
    const res = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${ttlSeconds}`
      }
    });
    const task = caches.default.put(cacheKey(namespace), res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  } catch {
  }
}
__name(edgeCachePut, "edgeCachePut");
var SWR_KEEP_SECONDS = 24 * 60 * 60;
async function edgeCacheGetSwr(namespace, freshSeconds) {
  try {
    const res = await caches.default.match(cacheKey(namespace));
    if (!res) return null;
    const body = await res.json();
    if (!body || typeof body.__cachedAt !== "number") return null;
    const ageSec = (Date.now() - body.__cachedAt) / 1e3;
    return { data: body.data, fresh: ageSec <= freshSeconds, ageSec };
  } catch {
    return null;
  }
}
__name(edgeCacheGetSwr, "edgeCacheGetSwr");
async function edgeCachePutSwr(namespace, data, ctx, keepSeconds = SWR_KEEP_SECONDS) {
  try {
    const res = new Response(JSON.stringify({ __cachedAt: Date.now(), data }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${keepSeconds}`
      }
    });
    const task = caches.default.put(cacheKey(namespace), res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  } catch {
  }
}
__name(edgeCachePutSwr, "edgeCachePutSwr");
async function edgeCacheDelete(namespace, ctx) {
  try {
    const task = caches.default.delete(cacheKey(namespace));
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    await task;
  } catch {
  }
}
__name(edgeCacheDelete, "edgeCacheDelete");
async function edgeCacheDeleteMany(namespaces, ctx) {
  try {
    const tasks = namespaces.map((ns) => caches.default.delete(cacheKey(ns)));
    const all = Promise.allSettled(tasks);
    if (ctx && ctx.waitUntil) ctx.waitUntil(all);
    await all;
  } catch {
  }
}
__name(edgeCacheDeleteMany, "edgeCacheDeleteMany");

// src/lib/estimate-archive.js
var RAW_MAX = 4e3;
var DETAIL_MAX = 400;
async function archiveAttemptToR2(env2, ctx, { ip, ua, fields, outcome, error: error3, rawText } = {}) {
  if (!env2 || !env2.IMAGES) return;
  try {
    const at = /* @__PURE__ */ new Date();
    const y = at.getUTCFullYear();
    const m = String(at.getUTCMonth() + 1).padStart(2, "0");
    const d = String(at.getUTCDate()).padStart(2, "0");
    const ts = at.toISOString().replace(/[:.]/g, "-");
    const safeIp = String(ip || "unknown").replace(/[^A-Za-z0-9.:_-]/g, "_");
    const key = `estimates-attempts/${y}/${m}/${d}/${ts}-${safeIp}-${outcome}.json`;
    const archive = {
      at: at.toISOString(),
      ip: ip || "",
      ua: ua || "",
      outcome,
      error: error3 || "",
      fields: fields || null,
      rawText: rawText ? String(rawText).slice(0, RAW_MAX) : ""
    };
    const task = Promise.resolve(
      env2.IMAGES.put(key, JSON.stringify(archive, null, 2), {
        httpMetadata: { contentType: "application/json; charset=utf-8" }
      })
    ).catch(() => {
    });
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  } catch {
  }
}
__name(archiveAttemptToR2, "archiveAttemptToR2");
function looksHuman({ name, phone } = {}) {
  const n = String(name || "").trim();
  const p = String(phone || "").replace(/\D/g, "");
  const namey = n.length >= 2 && !/(https?:\/\/|www\.)/i.test(n);
  const phoney = p.length >= 9 && p.length <= 11;
  return namey || phoney;
}
__name(looksHuman, "looksHuman");
async function recordRejectToD1(services, ctx, {
  name,
  phone,
  email,
  fields = {},
  ip,
  outcome,
  error: error3,
  source = "homepage",
  // 출처별 추가 컬럼(예: Meta 리드의 MetaLeadId/Platform/Campaign).
  // MetaLeadId 를 같이 남기면 같은 리드가 재전송돼도 '오류' 카드가 한 장만 생긴다.
  extra = {}
} = {}) {
  if (!services || !services.estimates) return;
  const run = (async () => {
    try {
      await services.estimates.create({
        ...extra,
        Name: String(name || "").slice(0, 50),
        Phone: String(phone || "").slice(0, 30),
        Email: String(email || "").slice(0, 100),
        SpaceType: fields.space_type || "",
        SpaceSize: fields.space_size || "",
        Postcode: fields.postcode || "",
        Address: fields.address || "",
        AddressDetail: fields.address_detail || "",
        Schedule: fields.schedule || "",
        Referral: fields.referral || "",
        Branch: fields.branch || "",
        Detail: `[\uC624\uB958:${outcome}${error3 ? ` ${error3}` : ""}] ${String(
          fields.detail || ""
        ).slice(0, DETAIL_MAX)}`,
        Status: "\uC624\uB958",
        SubmittedAt: (/* @__PURE__ */ new Date()).toISOString(),
        IP: ip || "",
        Source: source
      });
    } catch {
    }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(run);
  else await run;
}
__name(recordRejectToD1, "recordRejectToD1");
async function notifyBlockedAttempt(env2, ctx, { ip, ua, reasonCode, name, phone } = {}) {
  const p = String(phone || "").replace(/\D/g, "");
  const tail4 = p.length >= 4 ? p.slice(-4) : "";
  const text = `[day1design/estimates] \uCC28\uB2E8\uAC10\uC9C0
\uC0AC\uC720: ${reasonCode || "-"}
IP: ${ip || "-"}
\uC774\uB984: ${String(name || "").slice(0, 40) || "-"}
\uC5F0\uB77D\uCC98: ****${tail4}
UA: ${String(ua || "").slice(0, 120)}`;
  const task = Promise.resolve(notifyTelegram(env2, text)).catch(() => {
  });
  if (ctx && ctx.waitUntil) ctx.waitUntil(task);
  else await task;
}
__name(notifyBlockedAttempt, "notifyBlockedAttempt");
async function captureRejectedSubmission(request, env2, services, ctx, { outcome = "origin_denied", error: error3 = "" } = {}) {
  try {
    const ip = clientIP(request);
    const ua = request.headers.get("user-agent") || "";
    const f = {};
    let rawText = "";
    try {
      const form = await request.clone().formData();
      for (const [k, v] of form.entries()) if (typeof v === "string") f[k] = v;
    } catch {
      try {
        rawText = await request.clone().text();
      } catch {
      }
    }
    const hp = f._hp ?? f.website ?? "";
    await archiveAttemptToR2(env2, ctx, {
      ip,
      ua,
      fields: Object.keys(f).length ? f : null,
      outcome,
      error: error3,
      rawText
    });
    if (hp === "" && looksHuman({ name: f.name, phone: f.phone })) {
      await recordRejectToD1(services, ctx, {
        name: f.name,
        phone: f.phone,
        email: f.email,
        fields: f,
        ip,
        outcome,
        error: error3
      });
      await notifyBlockedAttempt(env2, ctx, {
        ip,
        ua,
        reasonCode: `${outcome}${error3 ? `(${error3})` : ""}`,
        name: f.name,
        phone: f.phone
      });
    }
  } catch {
  }
}
__name(captureRejectedSubmission, "captureRejectedSubmission");

// src/lib/crm-analytics.js
var MAX_WINDOW_DAYS = 366;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function dateRange(startDate, endDate) {
  if (!DATE_RE.test(String(startDate)) || !DATE_RE.test(String(endDate))) {
    throw new Error("analytics_invalid_date_range");
  }
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const startCheck = Number.isFinite(start) ? new Date(start).toISOString().slice(0, 10) : "";
  const endCheck = Number.isFinite(end) ? new Date(end).toISOString().slice(0, 10) : "";
  const days = Math.floor((end - start) / 864e5) + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || startCheck !== startDate || endCheck !== endDate || days < 1 || days > MAX_WINDOW_DAYS) {
    throw new Error("analytics_date_window_exceeded");
  }
  const startUtc = new Date(Date.parse(`${startDate}T00:00:00+09:00`)).toISOString();
  const endExclusiveUtc = new Date(Date.parse(`${endDate}T00:00:00+09:00`) + 864e5).toISOString();
  return { startDate, endDate, days, startUtc, endExclusiveUtc };
}
__name(dateRange, "dateRange");
var CRM_ANALYTICS_CONTRACT = Object.freeze({ maxWindowDays: MAX_WINDOW_DAYS, schedule: "10:00 Asia/Seoul", idempotencyKey: "crm-briefing:YYYY-MM-DD:10:00:Asia/Seoul" });

// src/lib/crm-notifications.js
var NOTIFICATION_TYPES = Object.freeze({
  NEW_CUSTOMER: "new_customer",
  VISIT_REMINDER: "visit_reminder",
  MEASUREMENT_REMINDER: "measurement_reminder",
  STAFF_MESSAGE: "staff_message"
});
var REMINDER_LEAD_MS = 3 * 60 * 60 * 1e3;
var INTERNAL_TYPES = new Set(Object.values(NOTIFICATION_TYPES));
function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}
__name(requiredString, "requiredString");
function isoDate(value, name) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError(`${name} must be a date`);
  return parsed;
}
__name(isoDate, "isoDate");
var TEMPLATE_COPY = Object.freeze({
  visit: {
    draft: "{{name}}\uB2D8, {{date}} {{time}}\uC5D0 {{location}} \uBC29\uBB38 \uC77C\uC815\uC774 \uC608\uC815\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uC8FC\uC18C: {{address}}",
    approved: "{{name}}\uB2D8, {{date}} {{time}} {{location}} \uBC29\uBB38 \uC77C\uC815\uC785\uB2C8\uB2E4. \uC8FC\uC18C: {{address}}"
  },
  measurement: {
    draft: "{{name}}\uB2D8, {{date}} {{time}}\uC5D0 {{location}} \uC2E4\uCE21 \uC77C\uC815\uC774 \uC608\uC815\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uC8FC\uC18C: {{address}}",
    approved: "{{name}}\uB2D8, {{date}} {{time}} {{location}} \uC2E4\uCE21 \uC77C\uC815\uC785\uB2C8\uB2E4. \uC8FC\uC18C: {{address}}"
  }
});
function buildInternalNotification({ tenantId, type, actorId, audience, payload, createdAt = /* @__PURE__ */ new Date() }) {
  const id2 = requiredString(tenantId, "tenantId");
  if (!INTERNAL_TYPES.has(type)) throw new TypeError("unsupported internal notification type");
  if (!Array.isArray(audience)) throw new TypeError("audience must be a snapshotted array");
  return {
    tenantId: id2,
    type,
    actorId: requiredString(actorId, "actorId"),
    audience: audience.filter((recipient) => recipient.tenantId === id2).map((recipient) => ({ ...recipient })),
    payload: payload && typeof payload === "object" ? { ...payload } : {},
    createdAt: isoDate(createdAt, "createdAt").toISOString()
  };
}
__name(buildInternalNotification, "buildInternalNotification");
var APPOINTMENT_APP_REMINDER_OFFSETS_HOURS = Object.freeze([24, 2]);

// src/lib/crm-automation.js
var iso = /* @__PURE__ */ __name((value = Date.now()) => new Date(value).toISOString(), "iso");
var id = /* @__PURE__ */ __name((prefix) => `${prefix}_${crypto.randomUUID()}`, "id");
var json2 = /* @__PURE__ */ __name((value) => JSON.stringify(value && typeof value === "object" ? value : {}), "json");
function requireDb(db) {
  if (!db?.prepare) throw new TypeError("automation_db_required");
  return db;
}
__name(requireDb, "requireDb");
async function createNewCustomerNotification(db, { tenantId, actorId, estimateId, payload = {}, createdAt = /* @__PURE__ */ new Date() } = {}) {
  requireDb(db);
  if (!tenantId || !actorId || !estimateId) throw new TypeError("new_customer_input_required");
  let source;
  try {
    source = await db.prepare("SELECT id,Name,Phone,Email,Address,Branch,EstimateAmount,Detail,Source,MetaLeadId,CrmTenantId FROM Estimates WHERE id=? AND CrmTenantId=?").bind(estimateId, tenantId).first();
  } catch {
    source = await db.prepare("SELECT id,Name,Phone,Email,Address,EstimateAmount,CrmTenantId FROM Estimates WHERE id=? AND CrmTenantId=?").bind(estimateId, tenantId).first();
  }
  if (!source) return { created: false, reason: "estimate_not_found" };
  const actor = await db.prepare("SELECT id FROM CrmUsers WHERE id=? AND tenant_id=? AND role='owner' AND active=1").bind(actorId, tenantId).first();
  const tenant = await db.prepare("SELECT id FROM CrmTenants WHERE id=? AND suspended=0").bind(tenantId).first();
  if (!actor || !tenant) return { created: false, reason: "tenant_or_actor_inactive" };
  const eventKey = `new_customer:${tenantId}:${estimateId}`;
  const existing = await db.prepare("SELECT id FROM CrmNotifications WHERE event_key=?").bind(eventKey).first();
  if (existing) {
    const current = await db.prepare("SELECT payload_json FROM CrmNotifications WHERE id=? AND tenant_id=?").bind(existing.id, tenantId).first();
    let currentPayload = {};
    try {
      currentPayload = JSON.parse(current?.payload_json || "{}");
    } catch {
    }
    const enriched = { ...currentPayload };
    for (const [key, value] of Object.entries(payload)) {
      if (value !== void 0 && value !== null && String(value).trim() !== "") enriched[key] = value;
    }
    if (JSON.stringify(enriched) !== JSON.stringify(currentPayload)) {
      await db.prepare("UPDATE CrmNotifications SET payload_json=? WHERE id=? AND tenant_id=? AND event_key=?").bind(json2(enriched), existing.id, tenantId, eventKey).run();
      return { created: false, updated: true, reason: "already_created", id: existing.id };
    }
    return { created: false, reason: "already_created", id: existing.id };
  }
  const members = (await db.prepare(`SELECT id,tenant_id,email,role,active FROM CrmUsers WHERE tenant_id=? AND active=1 AND role IN ('owner','staff') ORDER BY id LIMIT 101`).bind(tenantId).all()).results || [];
  if (members.length > 100) throw new Error("notification_audience_too_large");
  const audience = members;
  if (!audience.length) return { created: false, reason: "no_active_recipients" };
  const sourceLabel = source.Source || (source.MetaLeadId ? "meta" : "homepage");
  const amount = Number(source.EstimateAmount || 0);
  const detailBudget = String(source.Detail || "").match(/예산\s*[:：]?\s*([0-9][0-9,]*(?:\s*[만천억]?원)?)/i)?.[1]?.replace(/\s+/g, "") || "";
  const notificationId = id("crm_ntf");
  const at = iso(createdAt);
  const notification = buildInternalNotification({ tenantId, type: "new_customer", actorId, audience, payload: { estimate_id: estimateId, source: sourceLabel, meta_lead_id: source.MetaLeadId || "", name: source.Name || "", phone: source.Phone || "", email: source.Email || "", address: source.Address || "", branch: source.Branch || "", detail: source.Detail || "", budget: amount > 0 ? String(amount) : detailBudget, ...payload }, createdAt: at });
  const statements = [db.prepare("INSERT OR IGNORE INTO CrmNotifications(id,tenant_id,type,actor_id,payload_json,created_at,event_key) VALUES(?,?,?,?,?,?,?)").bind(notificationId, tenantId, notification.type, actorId, json2(notification.payload), at, eventKey)];
  statements.push(db.prepare("INSERT OR IGNORE INTO CrmNotificationRecipients(notification_id,tenant_id,recipient_id,created_at) SELECT ?,?,value,? FROM json_each(?) WHERE EXISTS (SELECT 1 FROM CrmNotifications WHERE id=? AND tenant_id=?)").bind(notificationId, tenantId, at, json2(audience.map((member) => member.id)), notificationId, tenantId));
  await db.batch(statements);
  return { created: true, id: notificationId, recipients: audience.length };
}
__name(createNewCustomerNotification, "createNewCustomerNotification");
async function ensureNewCustomerNotification(db, { tenantId, estimateId, payload = {}, createdAt = /* @__PURE__ */ new Date() } = {}) {
  requireDb(db);
  const owner = await db.prepare("SELECT id FROM CrmUsers WHERE tenant_id=? AND role='owner' AND active=1 ORDER BY id LIMIT 1").bind(tenantId).first();
  if (!owner) return { created: false, reason: "no_active_owner" };
  const result = await createNewCustomerNotification(db, { tenantId, actorId: owner.id, estimateId, payload, createdAt });
  return result;
}
__name(ensureNewCustomerNotification, "ensureNewCustomerNotification");

// src/routes/estimates.js
var CACHE_TTL = 30;
var ESTIMATE_RATE_LIMIT_PER_HOUR = 60;
function listCacheNs(status) {
  return `estimates:list:${status || "all"}`;
}
__name(listCacheNs, "listCacheNs");
var CALENDAR_CACHE_TTL = 60;
var CALENDAR_PAGE_SIZE = 200;
var CALENDAR_MAX_PAGE_SIZE = 500;
var CALENDAR_CACHE_PREFIX = "estimates:calendar";
function calendarCacheNs(from, to, limit) {
  return `${CALENDAR_CACHE_PREFIX}:${from}:${to}:${limit}`;
}
__name(calendarCacheNs, "calendarCacheNs");
var MAX_FILE_BYTES = 10 * 1024 * 1024;
var ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream"
];
var SOURCE_LABELS = {
  homepage: "Homepage",
  instagram_official: "IG\uC624\uD53C\uC15C",
  instagram_mkt: "IG\uB9C8\uCF00\uD305",
  meta: "Meta",
  google: "Google",
  naver: "Naver",
  youtube: "YouTube",
  kakao: "Kakao",
  referral: "Referral",
  other: "Other"
};
function sanitizeText(value, max = 120) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ").slice(0, max);
}
__name(sanitizeText, "sanitizeText");
function normalizeEstimateAttribution(fields) {
  const raw = [
    fields.source,
    fields.platform,
    fields.campaign,
    fields.utm_source,
    fields.utm_medium
  ].filter(Boolean).join(" ").normalize("NFC").toLowerCase();
  let source = "homepage";
  if (/(instagram-official|인스타그램 오피셜)/.test(raw)) {
    source = "instagram_official";
  } else if (/(instagram-marketing|인스타그램 마케팅)/.test(raw)) {
    source = "instagram_mkt";
  } else if (/(facebook|instagram|meta|fbclid|fb\.|ig\.|threads|메타|페이스북|페북|인스타)/.test(
    raw
  )) {
    source = "meta";
  } else if (/(youtube|youtu\.be|유튜브)/.test(raw)) {
    source = "youtube";
  } else if (/(naver|nclid|네이버)/.test(raw)) {
    source = "naver";
  } else if (/(google|gclid|doubleclick|adwords|구글)/.test(raw)) {
    source = "google";
  } else if (/(kakao|daum|tistory|카카오|카톡|다음)/.test(raw)) {
    source = "kakao";
  } else if (/(referral|social|search)/.test(raw)) {
    source = "referral";
  } else if (raw && !/(homepage|direct)/.test(raw)) {
    source = "other";
  }
  return {
    source,
    platform: SOURCE_LABELS[source],
    campaign: sanitizeText(fields.campaign || fields.utm_campaign || "", 160)
  };
}
__name(normalizeEstimateAttribution, "normalizeEstimateAttribution");
var VISIT_GAP_MS = 30 * 60 * 1e3;
async function fetchFirstTouch(env2, sessionId) {
  const empty = {
    source: "",
    platform: "",
    campaign: "",
    referrer: "",
    refPath: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    inflowApp: ""
  };
  if (!sessionId || !env2?.DB) return empty;
  try {
    const recent = await env2.DB.prepare(
      `SELECT Referrer, RefPath, UtmSource, UtmMedium, UtmCampaign, InflowApp, CreatedAt
       FROM HeatmapEvents
       WHERE SessionId = ? AND EventType = 'page_view'
       ORDER BY CreatedAt DESC
       LIMIT 200`
    ).bind(sessionId).all();
    const rows = recent?.results || [];
    if (!rows.length) return empty;
    const visitDesc = [];
    let prevTs = null;
    for (const r of rows) {
      const ts = Date.parse(r.CreatedAt || "");
      if (!Number.isFinite(ts)) continue;
      if (prevTs !== null && prevTs - ts > VISIT_GAP_MS) break;
      visitDesc.push(r);
      prevTs = ts;
    }
    const visitAsc = visitDesc.reverse();
    const row = visitAsc.find(
      (r) => String(r.Referrer || "") !== "" || String(r.UtmSource || "") !== ""
    ) || visitAsc[0];
    if (!row) return empty;
    const norm = normalizeEstimateAttribution({
      utm_source: row.UtmSource || "",
      utm_medium: row.UtmMedium || "",
      campaign: row.UtmCampaign || "",
      source: row.Referrer || ""
    });
    const inflowApp = String(row.InflowApp || "") || String(
      visitAsc.find((r) => String(r.InflowApp || "") !== "")?.InflowApp || ""
    );
    return {
      source: norm.source,
      platform: norm.platform,
      campaign: norm.campaign,
      referrer: String(row.Referrer || ""),
      refPath: String(row.RefPath || ""),
      utmSource: String(row.UtmSource || ""),
      utmMedium: String(row.UtmMedium || ""),
      utmCampaign: String(row.UtmCampaign || ""),
      inflowApp
    };
  } catch {
    return empty;
  }
}
__name(fetchFirstTouch, "fetchFirstTouch");
function textValue(value, fallback = "\u2014") {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}
__name(textValue, "textValue");
function htmlValue(value, fallback = "\u2014") {
  return escapeHtml(textValue(value, fallback));
}
__name(htmlValue, "htmlValue");
function htmlMultiline(value, fallback = "\uC791\uC131 \uB0B4\uC6A9 \uC5C6\uC74C") {
  return escapeHtml(textValue(value, fallback)).replace(/\n/g, "<br>");
}
__name(htmlMultiline, "htmlMultiline");
function compactJoin(values, separator = " ") {
  return values.map((v) => String(v || "").trim()).filter(Boolean).join(separator);
}
__name(compactJoin, "compactJoin");
function detailWithBudget(detail, budget) {
  const budgetText = sanitizeText(budget, 80);
  const detailText = String(detail || "").trim();
  return compactJoin(
    [budgetText ? `\uAC00\uC6A9\uC608\uC0B0: ${budgetText}` : "", detailText],
    "\n"
  );
}
__name(detailWithBudget, "detailWithBudget");
function formatKstMinute(value) {
  const date = value ? new Date(value) : /* @__PURE__ */ new Date();
  const safeDate = Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(safeDate);
}
__name(formatKstMinute, "formatKstMinute");
function emailShell({ eyebrow, banner, body, footer }) {
  return `
<div style="font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr>
      <td style="padding:18px 32px;font-size:15px;font-weight:300;color:#ffffff;letter-spacing:5px;text-transform:uppercase;">Day One Design</td>
      <td style="padding:18px 32px;font-size:10px;color:#666666;letter-spacing:2px;text-transform:uppercase;text-align:right;white-space:nowrap;">${escapeHtml(eyebrow)}</td>
    </tr>
  </table>
  <div style="background:#f5f0e8;border-left:3px solid #c8a96e;padding:9px 24px;font-size:12px;color:#6b5b3e;letter-spacing:.3px;">${escapeHtml(banner)}</div>
  <div style="padding:24px 28px 20px;">${body}</div>
  <div style="background:#fafafa;border-top:1px solid #f0f0f0;padding:12px 28px;text-align:center;">
    <p style="font-size:10px;color:#888888;margin:0;line-height:1.6;letter-spacing:.3px;">${escapeHtml(footer)}</p>
  </div>
</div>`.trim();
}
__name(emailShell, "emailShell");
function emailSectionLabel(label) {
  return `<p style="font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#777777;margin:0 0 10px 0;padding-bottom:7px;border-bottom:1px solid #f0f0f0;">${escapeHtml(label)}</p>`;
}
__name(emailSectionLabel, "emailSectionLabel");
function emailGridCell(label, value, width, accent = false) {
  return `
        <td width="${width}" style="background:#ffffff;padding:10px 14px;">
          <p style="font-size:9px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#888888;margin:0 0 3px 0;">${escapeHtml(label)}</p>
          <p style="font-size:13px;color:${accent ? "#c8a96e" : "#1a1a1a"};font-weight:${accent ? "500" : "400"};margin:0;">${value}</p>
        </td>`.trim();
}
__name(emailGridCell, "emailGridCell");
function internalEstimateEmailHtml(env2, details) {
  const { fields, attribution, conceptCount, planCount, submittedAt } = details;
  const receivedAt = formatKstMinute(submittedAt);
  const location = compactJoin([fields.address, fields.address_detail]) || fields.branch;
  const adminUrl = String(
    env2.ADMIN_ESTIMATES_URL || "https://admin.day1design.co.kr/estimates"
  ).trim();
  const campaign = attribution.campaign || "direct / estimate_form";
  const projectCells = [
    ["\uBA74\uC801", htmlValue(fields.space_size), false],
    ["\uC608\uC0B0", htmlValue(fields.budget), true],
    ["\uD76C\uB9DD\uC77C\uC815", htmlValue(fields.schedule), false],
    ["\uC9C0\uC810", htmlValue(fields.branch), false]
  ];
  if (fields.space_type)
    projectCells.unshift(["\uACF5\uAC04\uC720\uD615", htmlValue(fields.space_type), false]);
  if (conceptCount || planCount)
    projectCells.push([
      "\uCCA8\uBD80",
      `\uCEE8\uC149 ${conceptCount} / \uB3C4\uBA74 ${planCount}`,
      false
    ]);
  const cellWidth = `${Math.floor(100 / projectCells.length)}%`;
  const projectCellsHtml = projectCells.map(
    ([label, value, accent]) => emailGridCell(label, value, cellWidth, accent)
  ).join("\n        ");
  const body = `
    ${emailSectionLabel("Client")}
    <p style="margin:0 0 18px 0;line-height:1.4;">
      <span style="font-size:20px;font-weight:400;color:#1a1a1a;letter-spacing:.5px;">${htmlValue(fields.name)}</span>
      &nbsp;&nbsp;
      <span style="font-size:14px;color:#c8a96e;font-weight:500;letter-spacing:.5px;">${htmlValue(fields.phone)}</span>
      &nbsp;&nbsp;
      <span style="font-size:12px;color:#666666;letter-spacing:.3px;">${htmlValue(location, "\uC9C0\uC5ED \uBBF8\uC785\uB825")}</span>
    </p>

    ${emailSectionLabel("Project")}
    <table width="100%" cellpadding="0" cellspacing="1" style="background:#f0f0f0;border-radius:2px;margin-bottom:16px;">
      <tr>
        ${projectCellsHtml}
      </tr>
    </table>

    ${emailSectionLabel("Request")}
    <p style="margin:0 0 16px;color:#333333;font-size:13px;line-height:1.7;">${htmlMultiline(fields.detail)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:2px;">
      <tr>
        <td style="padding:10px 14px;">
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Platform</b>${htmlValue(attribution.platform)}</span>
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Campaign</b>${htmlValue(campaign)}</span>
        </td>
        <td style="padding:10px 14px;text-align:right;white-space:nowrap;">
          <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:8px 18px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;border-radius:2px;">\uAD00\uB9AC\uC790 \uD655\uC778</a>
        </td>
      </tr>
    </table>`;
  return emailShell({
    eyebrow: "Consultation Alert",
    banner: `\uC0C8\uB85C\uC6B4 \uC778\uD14C\uB9AC\uC5B4 \uC0C1\uB2F4 \uC2E0\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4 \u2014 ${receivedAt}`,
    body,
    footer: `\uB370\uC774\uC6D0\uB514\uC790\uC778 \uC790\uB3D9 \uC54C\uB9BC \xB7 ${env2.GMAIL_USER || "day1design.co@gmail.com"}`
  });
}
__name(internalEstimateEmailHtml, "internalEstimateEmailHtml");
function customerReceiptHtml(env2, fields, submittedAt) {
  const receivedAt = formatKstMinute(submittedAt);
  const space = compactJoin([fields.space_type, fields.space_size], " / ");
  const siteUrl = String(
    env2.PUBLIC_SITE_URL || "https://day1design.co.kr"
  ).trim();
  const body = `
    ${emailSectionLabel("Message")}
    <p style="margin:0 0 18px;font-size:20px;font-weight:400;color:#1a1a1a;letter-spacing:.2px;line-height:1.45;">\uBB38\uC758\uB97C \uB0A8\uACA8\uC8FC\uC154\uC11C \uAC10\uC0AC\uD569\uB2C8\uB2E4.</p>
    <p style="margin:0 0 16px;color:#333333;font-size:13px;line-height:1.7;">\uB2F4\uB2F9 \uB9E4\uB2C8\uC800\uAC00 \uC811\uC218 \uB0B4\uC6A9\uC744 \uD655\uC778\uD55C \uB4A4 \uC21C\uCC28\uC801\uC73C\uB85C \uC5F0\uB77D\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4. \uACF5\uC0AC \uC2DC\uC791\uC77C \uAE30\uC900 \uCD5C\uC18C 3\uAC1C\uC6D4 \uC774\uC804 \uC0C1\uB2F4\uC744 \uAD8C\uC7A5\uB4DC\uB9BD\uB2C8\uB2E4.</p>

    ${emailSectionLabel("Submitted")}
    <table width="100%" cellpadding="0" cellspacing="1" style="background:#f0f0f0;border-radius:2px;margin-bottom:16px;">
      <tr>
        ${emailGridCell("\uC131\uD568", htmlValue(fields.name), "25%")}
        ${emailGridCell("\uACF5\uAC04", htmlValue(space), "25%")}
        ${emailGridCell("\uAC00\uC6A9\uC608\uC0B0", htmlValue(fields.budget), "25%", true)}
        ${emailGridCell("\uD76C\uB9DD\uC77C\uC815", htmlValue(fields.schedule), "25%")}
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:2px;">
      <tr>
        <td style="padding:10px 14px;">
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Phone</b>070-7717-0030</span>
          <span style="display:block;color:#333333;font-size:12px;line-height:1.8;"><b style="color:#888888;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-right:6px;">Email</b>day1design.co@gmail.com</span>
        </td>
        <td style="padding:10px 14px;text-align:right;white-space:nowrap;">
          <a href="${escapeHtml(siteUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:8px 18px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;border-radius:2px;">\uD648\uD398\uC774\uC9C0 \uBCF4\uAE30</a>
        </td>
      </tr>
    </table>`;
  return emailShell({
    eyebrow: "Receipt",
    banner: `\uC0C1\uB2F4 \uC2E0\uCCAD\uC774 \uC815\uC0C1 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4 \u2014 ${receivedAt}`,
    body,
    footer: "DAYONE DESIGN \xB7 First space with Day One"
  });
}
__name(customerReceiptHtml, "customerReceiptHtml");
function customerReceiptText(fields) {
  const lines = [
    "DAYONE DESIGN \uC0C1\uB2F4 \uC2E0\uCCAD\uC774 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    "",
    "\uB2F4\uB2F9\uC790\uAC00 \uC811\uC218 \uB0B4\uC6A9\uC744 \uD655\uC778\uD55C \uB4A4 \uC21C\uCC28\uC801\uC73C\uB85C \uC5F0\uB77D\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4.",
    "",
    `\uC774\uB984: ${fields.name || "\u2014"}`,
    `\uC5F0\uB77D\uCC98: ${fields.phone || "\u2014"}`,
    `\uACF5\uAC04: ${fields.space_type || "\u2014"}${fields.space_size ? ` / ${fields.space_size}` : ""}`,
    `\uAC00\uC6A9\uC608\uC0B0: ${fields.budget || "\u2014"}`,
    `\uC9C0\uC810: ${fields.branch || "\u2014"}`,
    "",
    "\uBB38\uC758: 070-7717-0030",
    "\uBA54\uC77C: day1design.co@gmail.com"
  ];
  return lines.join("\n");
}
__name(customerReceiptText, "customerReceiptText");
function estimateRateLimitAllowlist(env2) {
  return new Set(
    String(env2.ESTIMATE_RATE_LIMIT_ALLOWLIST || "").split(",").map((ip) => ip.trim()).filter(Boolean)
  );
}
__name(estimateRateLimitAllowlist, "estimateRateLimitAllowlist");
function isWhitelistedRequest(env2, { ip, name, phone }) {
  if (ip && estimateRateLimitAllowlist(env2).has(ip)) return true;
  const names = String(env2.ESTIMATE_ALLOWLIST_NAMES || "").split(",").map((s2) => s2.trim()).filter(Boolean);
  const normName2 = String(name || "").trim();
  if (normName2 && names.some((n) => normName2.includes(n))) return true;
  const normPhone2 = String(phone || "").replace(/\D/g, "");
  const phones = new Set(
    String(env2.ESTIMATE_ALLOWLIST_PHONES || "").split(",").map((s2) => s2.replace(/\D/g, "").trim()).filter(Boolean)
  );
  if (normPhone2 && phones.has(normPhone2)) return true;
  return false;
}
__name(isWhitelistedRequest, "isWhitelistedRequest");
async function handleEstimates(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/estimates/, "") || "/";
  if (path === "/" && request.method === "POST") {
    return submitEstimate(request, env2, ctx, services);
  }
  if (path === "/" && request.method === "GET") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return listEstimates(request, env2, ctx, services);
  }
  if (path === "/calendar" && request.method === "GET") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return listConsultCalendar(request, env2, ctx);
  }
  const idMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (idMatch) {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    const id2 = idMatch[1];
    if (request.method === "PATCH")
      return patchEstimate(request, env2, id2, ctx, services);
    if (request.method === "DELETE")
      return deleteEstimate(env2, id2, ctx, services);
  }
  const visitHistoryMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/visit-history$/);
  if (visitHistoryMatch && request.method === "GET") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return getVisitHistory(env2, visitHistoryMatch[1], services);
  }
  return jsonError(404, "Not Found");
}
__name(handleEstimates, "handleEstimates");
async function getVisitHistory(env2, id2, services) {
  if (!/^rec[a-zA-Z0-9]{14}$/.test(id2)) return jsonError(400, "Invalid id");
  let record;
  try {
    record = await services.estimates.get(id2);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    return jsonError(500, "Lookup failed");
  }
  const sessionId = String(record?.fields?.SessionId || "");
  if (!sessionId) {
    return jsonOk({ sessionId: "", events: [] });
  }
  try {
    const res = await env2.DB.prepare(
      `SELECT Page, EventType, Device, Referrer, UtmSource, UtmMedium, UtmCampaign,
              Country, City, CreatedAt
       FROM HeatmapEvents
       WHERE SessionId = ? AND EventType = 'page_view'
       ORDER BY CreatedAt ASC
       LIMIT 200`
    ).bind(sessionId).all();
    const events = (res.results || []).map((r) => ({
      page: r.Page,
      device: r.Device,
      referrer: r.Referrer || "",
      utmSource: r.UtmSource || "",
      utmMedium: r.UtmMedium || "",
      utmCampaign: r.UtmCampaign || "",
      country: r.Country || "",
      city: r.City || "",
      createdAt: r.CreatedAt
    }));
    return jsonOk({ sessionId, events });
  } catch {
    return jsonOk({ sessionId, events: [] });
  }
}
__name(getVisitHistory, "getVisitHistory");
async function listConsultCalendar(request, env2, ctx) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const isIso = /* @__PURE__ */ __name((s2) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s2), "isIso");
  if (!isIso(from) || !isIso(to)) return jsonError(400, "Invalid range");
  if (from >= to) return jsonError(400, "Invalid range");
  const cursor = url.searchParams.get("cursor") || "";
  if (cursor && !isIso(cursor)) return jsonError(400, "Invalid cursor");
  const limitRaw = Number(url.searchParams.get("limit") || CALENDAR_PAGE_SIZE);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), CALENDAR_MAX_PAGE_SIZE) : CALENDAR_PAGE_SIZE;
  const start = cursor > from ? cursor : from;
  const fresh = url.searchParams.get("fresh") === "1";
  const ns = calendarCacheNs(start, to, limit);
  if (!fresh) {
    const cached = await edgeCacheGet(ns);
    if (cached) return jsonOk(cached);
  }
  try {
    const res = await env2.DB.prepare(
      `SELECT id AS Id, Name, Phone, Status, Assignee, ConsultAt, ConsultBranch,
              ConsultCancelledAt, Branch, SpaceType, SpaceSize, Address,
              AddressDetail, Source
       FROM Estimates
       WHERE ConsultAt >= ? AND ConsultAt < ?
       ORDER BY ConsultAt ASC
       LIMIT ?`
    ).bind(start, to, limit + 1).all();
    const rows = res.results || [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const records = page.map((r) => ({
      id: r.Id,
      name: r.Name || "",
      phone: r.Phone || "",
      status: r.Status || "",
      assignee: r.Assignee || "",
      consultAt: r.ConsultAt || "",
      // 표시 지점은 ConsultBranch 다. Branch 는 접수 때 고른 희망 지점이라
      // 실제 상담 지점과 다를 수 있다(마이그 0041 주석).
      consultBranch: r.ConsultBranch || "",
      // 취소해도 일정은 지우지 않는다. 값이 있으면 취소된 예약이고 캘린더에는
      // '취소' 로 남는다(마이그 0043).
      consultCancelledAt: r.ConsultCancelledAt || "",
      branch: r.Branch || "",
      spaceType: r.SpaceType || "",
      spaceSize: r.SpaceSize || "",
      address: [r.Address || "", r.AddressDetail || ""].filter(Boolean).join(" "),
      source: r.Source || ""
    }));
    const nextCursor = hasMore && records.length ? records[records.length - 1].consultAt : "";
    const payload = { records, nextCursor, hasMore };
    await edgeCachePut(ns, payload, CALENDAR_CACHE_TTL, ctx);
    return jsonOk(payload);
  } catch {
    return jsonError(500, "Calendar lookup failed");
  }
}
__name(listConsultCalendar, "listConsultCalendar");
async function deleteEstimate(env2, id2, ctx, services) {
  if (!/^rec[a-zA-Z0-9]{14}$/.test(id2)) {
    return jsonError(400, "Invalid id");
  }
  let existing;
  try {
    existing = await services.estimates.get(id2);
    await services.estimates.delete(id2);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    ctx.waitUntil(
      notifyTelegram(
        env2,
        `[day1design/estimates] DELETE \uC2E4\uD328
id: ${id2}
${(e.message || "").slice(0, 200)}`
      )
    );
    return jsonError(500, "Delete failed");
  }
  if (existing?.fields?.ConsultAt) {
    notifyConsult(
      env2,
      ctx,
      consultNotifyText(
        "deleted",
        existing.fields,
        {
          at: existing.fields.ConsultAt,
          branch: existing.fields.ConsultBranch || ""
        },
        env2,
        id2
      )
    );
  }
  const fileUrls = [
    ...safeJsonParse(existing?.fields?.ConceptFiles),
    ...safeJsonParse(existing?.fields?.FloorPlans)
  ];
  if (fileUrls.length && services.media?.deleteMany) {
    ctx.waitUntil(services.media.deleteMany(fileUrls));
  }
  await edgeCacheDeleteMany(
    [
      listCacheNs(null),
      listCacheNs("New"),
      listCacheNs("InProgress"),
      listCacheNs("Done"),
      listCacheNs("Cancelled")
    ],
    ctx
  );
  return jsonOk({ deleted: true, id: id2 });
}
__name(deleteEstimate, "deleteEstimate");
async function submitEstimate(request, env2, ctx, services) {
  const ip = clientIP(request);
  const ua = request.headers.get("user-agent") || "";
  let rawBackup = "";
  try {
    rawBackup = await request.clone().text();
  } catch {
  }
  if (!estimateRateLimitAllowlist(env2).has(ip)) {
    const rl = await rateLimit(
      `estimate-submit-v2:${ip}`,
      ESTIMATE_RATE_LIMIT_PER_HOUR
    );
    if (!rl.allowed) {
      ctx.waitUntil(
        notifyTelegram(
          env2,
          `[day1design/estimates] rate-limit \uCD08\uACFC
IP: ${ip} (${rl.count}\uD68C)`
        )
      );
      await archiveAttemptToR2(env2, ctx, {
        ip,
        ua,
        outcome: "rate_limited",
        error: `count=${rl.count}`,
        rawText: rawBackup
      });
      return jsonError(429, "Too many requests");
    }
  }
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    await archiveAttemptToR2(env2, ctx, {
      ip,
      ua,
      outcome: "parse_failed",
      error: e?.message || "parse",
      rawText: rawBackup
    });
    ctx.waitUntil(
      notifyTelegram(
        env2,
        `[day1design/estimates] formData \uD30C\uC2F1 \uC2E4\uD328
IP: ${ip}
${(e?.message || "").slice(0, 200)}`
      )
    );
    return jsonError(400, "Invalid form data");
  }
  const fields = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") fields[k] = v;
  }
  fields.space_type = sanitizeText(fields.space_type || "", 50);
  fields.space_size = sanitizeText(fields.space_size || "", 50);
  fields.postcode = sanitizeText(fields.postcode || "", 20);
  fields.address = sanitizeText(fields.address || "", 160);
  fields.address_detail = sanitizeText(fields.address_detail || "", 120);
  fields.schedule = sanitizeText(fields.schedule || "", 80);
  fields.referral = sanitizeText(fields.referral || "", 50);
  fields.branch = sanitizeText(fields.branch || "", 50);
  fields.budget = sanitizeText(fields.budget || "", 80);
  const isTesterBypass = isWhitelistedRequest(env2, {
    ip,
    name: fields.name,
    phone: fields.phone
  });
  const sig = botSignals(fields);
  const phoneOk = isValidPhone(fields.phone || "");
  const nameOk = !!(fields.name && fields.name.trim().length >= 2);
  const urlInjected = hasUrl(fields.name) || isLinkSpam(fields.detail);
  const humanShape = looksHuman({ name: fields.name, phone: fields.phone }) && phoneOk;
  if (!sig.honeypotFilled && sig.tooFast && !isTesterBypass) {
    await archiveAttemptToR2(env2, ctx, {
      ip,
      ua,
      fields,
      outcome: "bot_too_fast",
      error: "ts<3s",
      rawText: rawBackup
    });
    return jsonError(429, "Please try again");
  }
  let autofillHoneypot = false;
  if (sig.honeypotFilled) {
    const realBot = sig.tooFast || urlInjected || !phoneOk && !nameOk;
    if (realBot || !humanShape) {
      await archiveAttemptToR2(env2, ctx, {
        ip,
        ua,
        fields,
        outcome: "honeypot_bot",
        error: `hp${sig.tooFast ? "+fast" : ""}${urlInjected ? "+url" : ""}${!phoneOk && !nameOk ? "+broken" : ""}`,
        rawText: rawBackup
      });
      return jsonOk({ queued: true });
    }
    autofillHoneypot = true;
  }
  const isExitGuard = fields.form_type === "exit_guard";
  const leadKey = sanitizeText(fields.lead_key || "", 40);
  const errors = [];
  if (!fields.name || fields.name.length > 50) errors.push("name");
  if (!isValidPhone(fields.phone || "")) errors.push("phone");
  if (fields.email && !isValidEmail(fields.email)) errors.push("email");
  if (fields.privacy_agreed !== "true") errors.push("privacy_agreed");
  if (!isExitGuard) {
    if (!fields.space_size) errors.push("space_size");
    if (!fields.address) errors.push("address");
    if (!fields.schedule) errors.push("schedule");
    if (!fields.branch) errors.push("branch");
    if (!fields.budget) errors.push("budget");
  }
  if ((fields.detail || "").length > 2e3) errors.push("detail-too-long");
  if (hasUrl(fields.name)) errors.push("url-in-name");
  if (isLinkSpam(fields.detail)) errors.push("link-spam");
  if (errors.length) {
    await archiveAttemptToR2(env2, ctx, {
      ip,
      ua,
      fields,
      outcome: "validation_failed",
      error: errors.join(","),
      rawText: rawBackup
    });
    await recordRejectToD1(services, ctx, {
      name: fields.name,
      phone: fields.phone,
      email: fields.email,
      fields,
      ip,
      outcome: "validation_failed",
      error: errors.join(",")
    });
    if (looksHuman({ name: fields.name, phone: fields.phone })) {
      await notifyBlockedAttempt(env2, ctx, {
        ip,
        ua,
        reasonCode: `validation_failed(${errors.join(",")})`,
        name: fields.name,
        phone: fields.phone
      });
    }
    return jsonError(400, "Validation failed", { errors });
  }
  const attribution = normalizeEstimateAttribution(fields);
  const detail = isExitGuard ? "\uC774\uD0C8 \uBC29\uC9C0 \uD31D\uC5C5 \uC811\uC218 \xB7 \uC774\uB984\xB7\uC5F0\uB77D\uCC98\uB9CC \uC785\uB825\uB428 (\uC0C1\uC138 \uD56D\uBAA9 \uBBF8\uC791\uC131)" : detailWithBudget(fields.detail, fields.budget);
  await archiveAttemptToR2(env2, ctx, {
    ip,
    ua,
    fields,
    outcome: autofillHoneypot ? "accepted_autofill" : "accepted",
    rawText: rawBackup
  });
  const folder = `estimates/${datePrefix()}-${randomId()}`;
  let conceptUrls;
  let planUrls;
  try {
    conceptUrls = await uploadField(
      form,
      "concept_files",
      folder,
      "concept",
      services,
      { allowDocuments: false }
    );
    planUrls = await uploadField(
      form,
      "floor_plans",
      folder,
      "plan",
      services,
      { allowDocuments: true }
    );
  } catch (e) {
    await archiveAttemptToR2(env2, ctx, {
      ip,
      ua,
      fields,
      outcome: "upload_failed",
      error: e?.message || "",
      rawText: rawBackup
    });
    ctx.waitUntil(
      notifyTelegram(
        env2,
        `[day1design/estimates] \uD30C\uC77C \uC5C5\uB85C\uB4DC \uC2E4\uD328
IP: ${ip}
${(e?.message || "").slice(0, 200)}`
      )
    );
    if (e.status) return jsonError(e.status, e.message);
    throw e;
  }
  const submittedAt = fields.submittedAt || (/* @__PURE__ */ new Date()).toISOString();
  const sessionId = sanitizeText(fields.session_id, 64);
  const firstTouch = await fetchFirstTouch(env2, sessionId);
  const issuedLeadKey = isExitGuard ? leadKey || `${datePrefix()}-${randomId()}` : leadKey;
  let promoteId = "";
  if (leadKey) {
    try {
      const found = await services.estimates.listAll({
        where: { LeadKey: leadKey }
      });
      if (found.length) promoteId = found[0].id;
    } catch {
    }
  }
  const createPayload = {
    Name: fields.name,
    Phone: fields.phone,
    Email: fields.email || "",
    SpaceType: fields.space_type || "",
    SpaceSize: fields.space_size || "",
    Postcode: fields.postcode || "",
    Address: fields.address || "",
    AddressDetail: fields.address_detail || "",
    Schedule: fields.schedule || "",
    Referral: fields.referral || "",
    Branch: fields.branch || "",
    Detail: detail,
    PrivacyAgreed: true,
    ConceptFiles: JSON.stringify(conceptUrls),
    FloorPlans: JSON.stringify(planUrls),
    MetaFieldData: JSON.stringify(serializeHomepageAnswers(fields).map(({ question, answer, field }) => ({ q: question, a: answer, f: field }))),
    SubmittedAt: submittedAt,
    // 팝업 접수는 아직 완성된 문의가 아니다. '작성중' 으로 두어 접수관리 기본
    // 목록에서 빠지게 하고, 견적 폼을 마치면 같은 레코드가 '접수대기' 로 승격된다.
    Status: isExitGuard ? "\uC791\uC131\uC911" : "\uC811\uC218\uB300\uAE30",
    LeadKey: issuedLeadKey,
    FormType: isExitGuard ? "exit_guard" : leadKey ? "exit_guard" : "",
    IP: ip,
    Source: attribution.source,
    Platform: attribution.platform,
    Campaign: attribution.campaign,
    UtmSource: fields.utm_source || "",
    UtmMedium: fields.utm_medium || "",
    UtmCampaign: fields.utm_campaign || "",
    MetaCampaign: fields._fb_campaign || "",
    MetaCampaignId: fields._fb_campaign_id || "",
    MetaAdset: fields._fb_adset || "",
    MetaAdsetId: fields._fb_adset_id || "",
    MetaAd: fields._fb_ad || "",
    MetaAdId: fields._fb_adid || "",
    Fbclid: fields._fbclid || "",
    Fbp: fields._fbp || "",
    Fbc: fields._fbc || "",
    SessionId: sessionId,
    FirstSource: firstTouch.source,
    FirstPlatform: firstTouch.platform,
    FirstCampaign: firstTouch.campaign,
    FirstReferrer: firstTouch.referrer,
    FirstRefPath: firstTouch.refPath,
    FirstUtmSource: firstTouch.utmSource,
    FirstUtmMedium: firstTouch.utmMedium,
    FirstUtmCampaign: firstTouch.utmCampaign,
    // 방문 이력에 단서가 없으면 접수 폼이 보낸 값을 폴백으로 쓴다(첫 페이지 즉시 접수).
    FirstInflowApp: firstTouch.inflowApp || safeInflowApp(fields.inflow_app)
  };
  const saveRecord = /* @__PURE__ */ __name(() => promoteId ? services.estimates.update(promoteId, createPayload) : services.estimates.create(createPayload), "saveRecord");
  let record;
  try {
    record = await saveRecord();
  } catch (dbErr1) {
    try {
      record = await saveRecord();
    } catch (dbErr2) {
      await archiveAttemptToR2(env2, ctx, {
        ip,
        ua,
        fields: { ...fields, conceptUrls, planUrls },
        outcome: "d1_failed",
        error: dbErr2 && dbErr2.message || dbErr1 && dbErr1.message || "",
        rawText: rawBackup
      });
      ctx.waitUntil(
        notifyTelegram(
          env2,
          `[day1design/estimates] D1 \uC800\uC7A5 \uC2E4\uD328 (R2\uC5D0 \uBCF5\uAD6C\uAC00\uB2A5)
IP: ${ip}
Name: ${(fields.name || "").slice(0, 40)}
Phone: ${(fields.phone || "").slice(0, 20)}
${(dbErr2 && dbErr2.message || "").slice(0, 200)}`
        )
      );
      return jsonError(500, "Save failed, please retry");
    }
  }
  fields.detail = detail;
  if (autofillHoneypot) {
    const hpPhone = String(fields.phone || "").replace(/\D/g, "");
    ctx.waitUntil(
      notifyTelegram(
        env2,
        `[day1design/estimates] \uC790\uB3D9\uC644\uC131 \uD5C8\uB2C8\uD31F \uAC10\uC9C0\u2192\uC815\uC0C1\uC811\uC218 \uCC98\uB9AC
IP: ${ip}
\uC774\uB984: ${(fields.name || "").slice(0, 40)}
\uC5F0\uB77D\uCC98: ****${hpPhone.length >= 4 ? hpPhone.slice(-4) : ""}`
      )
    );
  }
  if (isExitGuard) {
    const guardPhone = String(fields.phone || "").replace(/\D/g, "");
    ctx.waitUntil(
      Promise.allSettled([
        notifyTelegram(
          env2,
          `[day1design/estimates] \uC774\uD0C8 \uD31D\uC5C5 \uC811\uC218 (\uC791\uC131\uC911)
\uC774\uB984: ${escapeHtml(fields.name)}
\uC5F0\uB77D\uCC98: ${escapeHtml(fields.phone)}
\uCD9C\uCC98: ${escapeHtml(attribution.platform)}
\u203B \uACAC\uC801 \uD3FC \uC644\uC8FC \uC2DC \uAC19\uC740 \uCE74\uB4DC\uAC00 '\uC811\uC218\uB300\uAE30' \uB85C \uC2B9\uACA9\uB429\uB2C8\uB2E4.`
        ),
        logIntakeEvent(services, {
          channel: "exit_guard",
          source: attribution.source,
          name: fields.name,
          phone: fields.phone,
          geo: String(
            request.cf?.city || request.cf?.region || request.cf?.country || ""
          ),
          estimateId: record.id,
          steps: { d1: "ok", stage: "\uC791\uC131\uC911", phone4: guardPhone.slice(-4) },
          ip
        })
      ])
    );
    return jsonOk({ id: record.id, leadKey: issuedLeadKey, received: true });
  }
  const addressLine = compactJoin([fields.address, fields.address_detail]);
  const appNotification = ensureNewCustomerNotification(env2.DB, {
    tenantId: "day1design",
    estimateId: record.id,
    payload: { region: addressLine, available_budget: fields.budget || "" },
    createdAt: submittedAt
  }).catch(() => null);
  const notificationLines = [
    `[day1design/estimates] \uC0C8 \uC0C1\uB2F4\uC2E0\uCCAD${promoteId ? " (\uC774\uD0C8\uD31D\uC5C5 \uACBD\uC720)" : ""}`,
    `\uC774\uB984: ${escapeHtml(fields.name)}`,
    `\uC5F0\uB77D\uCC98: ${escapeHtml(fields.phone)}`
  ];
  if (fields.email)
    notificationLines.push(`\uC774\uBA54\uC77C: ${escapeHtml(fields.email)}`);
  notificationLines.push(
    `\uD3C9\uD615\uB300: ${escapeHtml(fields.space_size)}`,
    `\uC9C0\uC810: ${escapeHtml(fields.branch)}`,
    `\uAC00\uC6A9\uC608\uC0B0: ${escapeHtml(fields.budget)}`,
    `\uD76C\uB9DD\uC77C\uC815: ${escapeHtml(fields.schedule)}`
  );
  if (addressLine) notificationLines.push(`\uC8FC\uC18C: ${escapeHtml(addressLine)}`);
  notificationLines.push(
    `\uCD9C\uCC98: ${escapeHtml(attribution.platform)}${attribution.campaign ? ` / ${escapeHtml(attribution.campaign)}` : ""}`
  );
  if (conceptUrls.length || planUrls.length) {
    notificationLines.push(
      `\uD30C\uC77C: \uCEE8\uC149 ${conceptUrls.length} / \uD3C9\uBA74\uB3C4 ${planUrls.length}`
    );
  }
  const notificationText = notificationLines.join("\n");
  const steps = { d1: "ok" };
  const notifyTasks = [
    notifyTelegram(env2, notificationText).then(() => {
      steps.telegram = "ok";
    }).catch(() => {
      steps.telegram = "fail";
    }),
    notifyEmail(env2, {
      subject: "[DAYONE] \uC0C8 \uC0C1\uB2F4\uC2E0\uCCAD",
      text: notificationText,
      html: internalEstimateEmailHtml(env2, {
        fields,
        attribution,
        conceptCount: conceptUrls.length,
        planCount: planUrls.length,
        submittedAt
      })
    }).then(() => {
      steps.email = "ok";
    }).catch(() => {
      steps.email = "fail";
    })
  ];
  if (fields.email) {
    notifyTasks.push(
      sendEmail(env2, {
        to: fields.email,
        subject: "[DAYONE DESIGN] \uACAC\uC801\uBB38\uC758\uAC00 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
        text: customerReceiptText(fields),
        html: customerReceiptHtml(env2, fields, submittedAt)
      }).then(() => {
        steps.emailCustomer = "ok";
      }).catch(() => {
        steps.emailCustomer = "fail";
      })
    );
  } else {
    steps.emailCustomer = "skip";
  }
  notifyTasks.push(
    // NCP SENS LMS — env/발신번호 미설정 시 sens.js 가 자동 skip
    sendNcpSens(env2, {
      to: fields.phone,
      subject: CUSTOMER_SMS_SUBJECT,
      content: buildCustomerSms("homepage")
    }).then((r) => {
      steps.lms = r.ok ? "ok" : r.skipped ? "skip" : "fail";
      if (!r.ok && !r.skipped) {
        return notifyTelegram(
          env2,
          `[day1design/estimates] SENS \uBC1C\uC1A1 \uC2E4\uD328
phone: ${escapeHtml(fields.phone)}
status: ${r.status || "-"}
body: ${escapeHtml((r.body || "").slice(0, 200))}`
        );
      }
    }).catch(() => {
      steps.lms = "fail";
    })
  );
  notifyTasks.push(
    sendMetaCapiLead(env2, ctx, {
      eventId: fields._fb_event_id,
      email: fields.email,
      phone: fields.phone,
      name: fields.name,
      externalId: record.id,
      ip,
      ua: request.headers.get("user-agent") || "",
      fbp: fields._fbp,
      fbc: fields._fbc,
      source: attribution.source,
      sessionId,
      pagePath: "/estimates",
      campaign: fields._fb_campaign || fields.campaign || "",
      adset: fields._fb_adset || "",
      ad: fields._fb_ad || "",
      adId: fields._fb_adid || "",
      fbclid: fields._fbclid || "",
      estimateId: record.id
    }).then(() => {
      steps.capi = "ok";
    }).catch(() => {
      steps.capi = "fail";
    })
  );
  notifyTasks.push(
    appendLeadToSheet(env2, {
      submittedAt,
      name: fields.name,
      phone: fields.phone,
      email: fields.email || "",
      source: attribution.source,
      platform: attribution.platform,
      campaign: attribution.campaign,
      address: addressLine,
      spaceType: fields.space_type || "",
      spaceSize: fields.space_size || "",
      schedule: fields.schedule || "",
      budget: fields.budget || "",
      branch: fields.branch || "",
      detail,
      status: "\uC811\uC218\uB300\uAE30",
      id: record.id
    }).then((r) => {
      steps.sheet = r?.skipped ? "skip" : "ok";
    }).catch((e) => {
      steps.sheet = "fail";
      return notifyTelegram(
        env2,
        `[day1design/estimates] \uAD6C\uAE00\uC2DC\uD2B8 \uAE30\uB85D \uC2E4\uD328
\uC774\uB984: ${escapeHtml(fields.name)}
\uC0AC\uC720: ${escapeHtml((e?.message || "").slice(0, 200))}`
      );
    })
  );
  ctx.waitUntil(
    Promise.allSettled([...notifyTasks, appNotification]).then(
      () => logIntakeEvent(services, {
        channel: "homepage",
        source: "homepage",
        branch: fields.branch,
        name: fields.name,
        phone: fields.phone,
        geo: String(
          request.cf?.city || request.cf?.region || request.cf?.country || ""
        ),
        estimateId: record.id,
        steps,
        ip
      })
    )
  );
  await edgeCacheDeleteMany(
    [listCacheNs(null), listCacheNs("\uC811\uC218\uB300\uAE30"), listCacheNs("New")],
    ctx
  );
  return jsonOk({ id: record.id, received: true });
}
__name(submitEstimate, "submitEstimate");
async function uploadField(form, fieldName, folder, prefix, services, policy) {
  const files = form.getAll(fieldName).filter((f) => typeof f !== "string");
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f || !f.size) continue;
    if (f.size > MAX_FILE_BYTES) {
      const err = new Error("File too large");
      err.status = 413;
      throw err;
    }
    assertUploadPolicy(f, policy);
    const isImage = isImageUpload(f);
    const ct = isImage ? "image/webp" : f.type || "application/octet-stream";
    if (!isImage && !ALLOWED_DOCUMENT_TYPES.includes(ct)) {
      const err = new Error("Unsupported file type");
      err.status = 415;
      throw err;
    }
    const ext = fileExt(f.name) || "bin";
    const key = `${folder}/${prefix}-${String(i + 1).padStart(3, "0")}-${safeFileName(f.name.replace(/\.[^.]+$/, ""))}.${ext}`;
    const url = await services.media.upload(key, await f.arrayBuffer(), {
      contentType: ct
    });
    urls.push(url);
  }
  return urls;
}
__name(uploadField, "uploadField");
async function listEstimates(request, env2, ctx, services) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const ns = listCacheNs(status);
  const cached = await edgeCacheGet(ns);
  if (cached) return jsonOk(cached);
  const where = status ? { Status: status } : void 0;
  const all = await services.estimates.listAll({
    where,
    sort: [{ field: "SubmittedAt", direction: "desc" }]
  });
  const records = status ? all : all.filter((r) => r.fields.Status !== "\uC791\uC131\uC911");
  const payload = {
    records: records.map((r) => ({
      id: r.id,
      ...r.fields,
      ConceptFiles: safeJsonParse(r.fields.ConceptFiles),
      FloorPlans: safeJsonParse(r.fields.FloorPlans)
    }))
  };
  await edgeCachePut(ns, payload, CACHE_TTL, ctx);
  return jsonOk(payload);
}
__name(listEstimates, "listEstimates");
function notifyConsult(env2, ctx, text) {
  const botToken = String(env2.CALENDAR_BOT_TOKEN || "").trim();
  const chatId = String(env2.CALENDAR_CHAT_ID || "").trim();
  if (!botToken || !chatId) return;
  const p = notifyTelegram(env2, text, { botToken, chatId });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p);
}
__name(notifyConsult, "notifyConsult");
var KST_OFFSET_MS = 9 * 3600 * 1e3;
var KST_DOW = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"];
function fmtConsultKst(iso2) {
  const t = Date.parse(iso2);
  if (!iso2 || Number.isNaN(t)) return String(iso2 || "");
  const d = new Date(t + KST_OFFSET_MS);
  const p = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "p");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}(${KST_DOW[d.getUTCDay()]}) ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
__name(fmtConsultKst, "fmtConsultKst");
function ddayLabel(iso2) {
  const t = Date.parse(iso2);
  if (!iso2 || Number.isNaN(t)) return "";
  const dayOf = /* @__PURE__ */ __name((ms) => Math.floor((ms + KST_OFFSET_MS) / 864e5), "dayOf");
  const diff = dayOf(t) - dayOf(Date.now());
  if (diff === 0) return "\uC624\uB298";
  return diff > 0 ? `${diff}\uC77C \uB4A4` : `${-diff}\uC77C \uC804`;
}
__name(ddayLabel, "ddayLabel");
function adminBase(env2) {
  const first2 = String(env2?.ADMIN_ORIGINS || "").split(",").map((s2) => s2.trim()).filter(Boolean)[0];
  return (first2 || "https://admin.day1design.co.kr").replace(/\/$/, "");
}
__name(adminBase, "adminBase");
function consultLinkTargets(env2, iso2, id2) {
  const base = adminBase(env2);
  const out = {};
  const t = Date.parse(iso2);
  if (iso2 && !Number.isNaN(t)) {
    const d = new Date(t + KST_OFFSET_MS);
    const p = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "p");
    const ymd = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
    out.calendar = `${base}/calendar?date=${ymd}`;
  }
  if (id2 && /^rec[a-zA-Z0-9]{14}$/.test(id2)) {
    out.detail = `${base}/estimates?id=${id2}`;
  }
  return out;
}
__name(consultLinkTargets, "consultLinkTargets");
function consultLinkLines(env2, iso2, id2) {
  const t = consultLinkTargets(env2, iso2, id2);
  const out = [];
  if (t.calendar)
    out.push(`\u{1F517} <a href="${t.calendar}">\uC0C1\uB2F4 \uCE98\uB9B0\uB354\uC5D0\uC11C \uBCF4\uAE30</a>`);
  if (t.detail) out.push(`\u{1F4CB} <a href="${t.detail}">\uC811\uC218 \uC0C1\uC138 \uBCF4\uAE30</a>`);
  return out;
}
__name(consultLinkLines, "consultLinkLines");
function consultLinkLine(env2, iso2, id2) {
  const t = consultLinkTargets(env2, iso2, id2);
  const out = [];
  if (t.calendar) out.push(`<a href="${t.calendar}">\u{1F517} \uCE98\uB9B0\uB354</a>`);
  if (t.detail) out.push(`<a href="${t.detail}">\u{1F4CB} \uC811\uC218 \uC0C1\uC138</a>`);
  return out.join(" \xB7 ");
}
__name(consultLinkLine, "consultLinkLine");
function consultNotifyText(kind, fields, prev, env2, id2) {
  const f = fields || {};
  const at = /* @__PURE__ */ __name((iso2, branch) => `${fmtConsultKst(iso2)}${branch ? ` \xB7 ${escapeHtml(branch)}` : ""}`, "at");
  const lines = [];
  if (kind === "created") {
    lines.push("[day1design/consult] \uC0C1\uB2F4 \uC608\uC57D");
    lines.push(
      `\u{1F4C5} ${at(f.ConsultAt, f.ConsultBranch)} \xB7 ${ddayLabel(f.ConsultAt)}`
    );
  } else if (kind === "moved") {
    lines.push("[day1design/consult] \uC0C1\uB2F4 \uC608\uC57D \uBCC0\uACBD");
    lines.push(`\uC774\uC804 ${at(prev.at, prev.branch)}`);
    lines.push(
      `\uBCC0\uACBD ${at(f.ConsultAt, f.ConsultBranch)} \xB7 ${ddayLabel(f.ConsultAt)}`
    );
  } else if (kind === "restored") {
    lines.push("[day1design/consult] \uC0C1\uB2F4 \uC608\uC57D \uB418\uC0B4\uB9BC");
    lines.push(
      `\u{1F4C5} ${at(f.ConsultAt, f.ConsultBranch)} \xB7 ${ddayLabel(f.ConsultAt)}`
    );
  } else if (kind === "cancelled") {
    lines.push("[day1design/consult] \uC0C1\uB2F4 \uC608\uC57D \uCDE8\uC18C");
    lines.push(
      `\u{1F4C5} ${at(f.ConsultAt || prev.at, f.ConsultBranch || prev.branch)}`
    );
    lines.push("\uCE98\uB9B0\uB354\uC5D0\uB294 \uCDE8\uC18C\uB85C \uB0A8\uC2B5\uB2C8\uB2E4");
  } else if (kind === "deleted") {
    lines.push("[day1design/consult] \uC0C1\uB2F4 \uC608\uC57D \uCDE8\uC18C (\uC811\uC218 \uC0AD\uC81C)");
    lines.push(`\u{1F4C5} ${at(prev.at, prev.branch)}`);
    lines.push("\uC811\uC218\uAC00 \uC9C0\uC6CC\uC838 \uCE98\uB9B0\uB354\uC5D0\uC11C\uB3C4 \uC0AC\uB77C\uC9D1\uB2C8\uB2E4");
  } else {
    lines.push("[day1design/consult] \uC0C1\uB2F4 \uC608\uC57D \uC77C\uC2DC \uC0AD\uC81C");
    lines.push(`\u{1F4C5} ${at(prev.at, prev.branch)}`);
  }
  lines.push(
    `\u{1F64D} ${escapeHtml(f.Name || "")} \xB7 ${escapeHtml(f.Phone || "")}`.trimEnd()
  );
  const space = [f.SpaceType, f.SpaceSize].filter(Boolean).join(" ");
  const detail = [space, f.Address, f.AddressDetail].filter(Boolean).join(" \xB7 ");
  if (detail) lines.push(`\u{1F3E0} ${escapeHtml(detail)}`);
  if (f.Assignee) lines.push(`\u{1F464} \uB2F4\uB2F9 ${escapeHtml(f.Assignee)}`);
  if (kind !== "deleted") {
    lines.push(...consultLinkLines(env2, f.ConsultAt || prev.at, id2));
  }
  return lines.join("\n");
}
__name(consultNotifyText, "consultNotifyText");
var REMIND_WINDOW_MS = 25 * 3600 * 1e3;
var REMIND_RULES = [
  { key: "1d", column: "ConsultRemind1dAt", beforeMs: 24 * 3600 * 1e3 },
  { key: "2h", column: "ConsultRemind2hAt", beforeMs: 2 * 3600 * 1e3 }
];
async function runConsultReminders(env2, nowMs = Date.now()) {
  if (!env2?.DB) return { sent: 0, checked: 0 };
  const botToken = String(env2.CALENDAR_BOT_TOKEN || "").trim();
  const chatId = String(env2.CALENDAR_CHAT_ID || "").trim();
  if (!botToken || !chatId)
    return { sent: 0, checked: 0, skipped: "no-config" };
  const nowIso3 = new Date(nowMs).toISOString();
  const untilIso = new Date(nowMs + REMIND_WINDOW_MS).toISOString();
  let rows = [];
  try {
    const res = await env2.DB.prepare(
      `SELECT id, Name, Phone, Assignee, Status, ConsultAt, ConsultBranch,
              SpaceType, SpaceSize, Address, AddressDetail,
              ConsultRemind1dAt, ConsultRemind2hAt
         FROM Estimates
        WHERE ConsultAt >= ? AND ConsultAt <= ?
          AND COALESCE(ConsultCancelledAt, '') = ''
        ORDER BY ConsultAt ASC
        LIMIT 100`
    ).bind(nowIso3, untilIso).all();
    rows = res.results || [];
  } catch {
    return { sent: 0, checked: 0, error: "query" };
  }
  let sent = 0;
  for (const r of rows) {
    const at = Date.parse(r.ConsultAt);
    if (Number.isNaN(at)) continue;
    for (const rule of REMIND_RULES) {
      if (String(r[rule.column] || "")) continue;
      if (nowMs < at - rule.beforeMs) continue;
      const text = consultRemindText(rule.key, r, env2);
      try {
        await notifyTelegram(env2, text, { botToken, chatId });
        await env2.DB.prepare(
          `UPDATE Estimates SET ${rule.column} = ? WHERE id = ?`
        ).bind(nowIso3, r.id).run();
        sent++;
      } catch {
      }
    }
  }
  return { sent, checked: rows.length };
}
__name(runConsultReminders, "runConsultReminders");
function consultRemindText(key, r, env2) {
  const kind = key === "1d" ? "\uB0B4\uC77C \uC0C1\uB2F4" : "2\uC2DC\uAC04 \uB4A4 \uC0C1\uB2F4";
  const branch = r.ConsultBranch ? ` \xB7 ${escapeHtml(r.ConsultBranch)}` : "";
  const who = [
    escapeHtml(r.Name || ""),
    escapeHtml(r.Phone || ""),
    r.Assignee ? `\uB2F4\uB2F9 ${escapeHtml(r.Assignee)}` : ""
  ].filter(Boolean).join(" \xB7 ");
  const lines = [
    `[day1design/consult] \u23F0 \uB9AC\uB9C8\uC778\uB4DC \u2014 ${kind}`,
    `\u{1F4C5} ${fmtConsultKst(r.ConsultAt)}${branch}`
  ];
  if (who) lines.push(`\u{1F64D} ${who}`);
  const link = consultLinkLine(env2, r.ConsultAt, r.id);
  if (link) lines.push(link);
  return lines.join("\n");
}
__name(consultRemindText, "consultRemindText");
async function patchEstimate(request, env2, id2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const allowed = [
    // 상담 관리
    "Status",
    "Assignee",
    "ContactedAt",
    "ConsultAt",
    "ConsultBranch",
    "ConsultCancelledAt",
    "ContractAt",
    "ContractOwner",
    "ContractAmount",
    "Memo",
    "EstimateAmount",
    // 고객 정보 (관리자 확인 후 수정)
    "Name",
    "Phone",
    "Email",
    "SpaceType",
    "SpaceSize",
    "Postcode",
    "Address",
    "AddressDetail",
    "Schedule",
    "Detail",
    "Referral",
    "Branch"
  ];
  const fields = {};
  for (const k of allowed) if (k in body) fields[k] = body[k];
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");
  if ("ConsultAt" in fields) {
    fields.ConsultRemind1dAt = "";
    fields.ConsultRemind2hAt = "";
  }
  const touchesConsult = "ConsultAt" in fields || "ConsultBranch" in fields || "ConsultCancelledAt" in fields;
  let before = null;
  if (touchesConsult) {
    try {
      before = await services.estimates.get(id2);
    } catch {
      before = null;
    }
  }
  let record;
  try {
    record = await services.estimates.update(id2, fields);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    throw e;
  }
  await edgeCacheDeleteMany(
    [
      listCacheNs(null),
      listCacheNs("New"),
      listCacheNs("InProgress"),
      listCacheNs("Done"),
      listCacheNs("Cancelled")
    ],
    ctx
  );
  if (touchesConsult && before) {
    const prevAt = String(before.fields?.ConsultAt || "");
    const prevBranch = String(before.fields?.ConsultBranch || "");
    const prevCancel = String(before.fields?.ConsultCancelledAt || "");
    const nextAt = String(record.fields?.ConsultAt || "");
    const nextBranch = String(record.fields?.ConsultBranch || "");
    const nextCancel = String(record.fields?.ConsultCancelledAt || "");
    let kind = "";
    if (!prevCancel && nextCancel) {
      kind = "cancelled";
    } else if (prevCancel && !nextCancel) {
      kind = "restored";
    } else if (prevAt !== nextAt || prevBranch !== nextBranch) {
      if (!prevAt && nextAt) kind = "created";
      else if (prevAt && nextAt) kind = "moved";
      else if (prevAt && !nextAt) kind = "cleared";
    }
    if (kind) {
      notifyConsult(
        env2,
        ctx,
        consultNotifyText(
          kind,
          record.fields,
          { at: prevAt, branch: prevBranch },
          env2,
          id2
        )
      );
      queueAudit(ctx, env2, request, {
        type: `consult_${kind}`,
        severity: kind === "cancelled" ? "warn" : "info",
        status: 200,
        message: `${record.fields?.Name || ""} ${fmtConsultKst(nextAt || prevAt)}` + `${nextBranch || prevBranch ? ` \xB7 ${nextBranch || prevBranch}` : ""}`.trim(),
        payload: {
          estimateId: id2,
          kind,
          before: {
            consultAt: prevAt,
            consultBranch: prevBranch,
            cancelledAt: prevCancel
          },
          after: {
            consultAt: nextAt,
            consultBranch: nextBranch,
            cancelledAt: nextCancel
          },
          customer: {
            name: record.fields?.Name || "",
            phone: record.fields?.Phone || "",
            assignee: record.fields?.Assignee || "",
            status: record.fields?.Status || ""
          }
        }
      });
    }
  }
  return jsonOk({ id: record.id, updated: record.fields });
}
__name(patchEstimate, "patchEstimate");
function safeJsonParse(s2, fallback = []) {
  if (!s2) return fallback;
  try {
    const v = JSON.parse(s2);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
__name(safeJsonParse, "safeJsonParse");

// src/routes/hero.js
var MAX_IMG_BYTES = 10 * 1024 * 1024;
var CACHE_NS = "hero:slides";
var CACHE_TTL2 = 60;
async function handleHero(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/hero/, "");
  if (path === "/slides" && request.method === "GET") {
    return getSlides(env2, ctx, services);
  }
  if (path === "/slides" && request.method === "PUT") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return putSlides(request, env2, ctx, services);
  }
  if (path === "/upload" && request.method === "POST") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return uploadImage(request, env2, services);
  }
  return jsonError(404, "Not Found");
}
__name(handleHero, "handleHero");
async function getSlides(env2, ctx, services) {
  const hit = await edgeCacheGetSwr(CACHE_NS, CACHE_TTL2);
  if (hit?.fresh) return jsonOk(hit.data);
  try {
    const records = await services.heroSlides.listAll({
      sort: [{ field: "Order", direction: "asc" }]
    });
    const slides = records.filter((r) => r.fields.Active !== false).map((r) => ({
      id: r.id,
      image: r.fields.Image || "",
      href: r.fields.Href || "",
      alt: r.fields.Alt || "",
      order: r.fields.Order ?? 0,
      lqip: r.fields.Lqip || ""
    }));
    const payload = {
      config: { maxSlides: 10, autoPlayMs: 6e3 },
      slides
    };
    await edgeCachePutSwr(CACHE_NS, payload, ctx);
    return jsonOk(payload);
  } catch (error3) {
    if (hit) return jsonOk(hit.data);
    throw error3;
  }
}
__name(getSlides, "getSlides");
async function putSlides(request, env2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const slides = Array.isArray(body?.slides) ? body.slides : null;
  if (!slides) return jsonError(400, "slides[] required");
  if (slides.length > 10) return jsonError(400, "Max 10 slides");
  const existing = await services.heroSlides.listAll();
  const oldUrls = existing.map((r) => r.fields.Image).filter(Boolean);
  const newUrls = new Set(slides.map((s2) => s2.image).filter(Boolean));
  const orphanUrls = oldUrls.filter((u) => !newUrls.has(u));
  const newRecords = slides.filter((s2) => s2.image).map((s2, i) => ({
    Image: s2.image,
    Href: s2.href || "",
    Alt: s2.alt || "",
    Order: i,
    Active: true,
    Lqip: s2.lqip || ""
  }));
  const created = await services.heroSlides.replaceAll(newRecords);
  if (orphanUrls.length > 0) {
    const task = services.media.deleteMany(orphanUrls);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDelete(CACHE_NS, ctx);
  return jsonOk({ saved: created.length, cleaned: orphanUrls.length });
}
__name(putSlides, "putSlides");
async function uploadImage(request, env2, services) {
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return jsonError(400, "file required");
  if (file.size > MAX_IMG_BYTES) return jsonError(413, "File too large");
  try {
    assertUploadPolicy(file);
  } catch (e) {
    return jsonError(e.status || 415, e.message);
  }
  const ext = fileExt(file.name) || "webp";
  const key = `hero/${datePrefix()}-${randomId()}/${safeFileName(file.name.replace(/\.[^.]+$/, ""))}.${ext}`;
  const url = await services.media.upload(key, await file.arrayBuffer(), {
    contentType: "image/webp"
  });
  return jsonOk({ url });
}
__name(uploadImage, "uploadImage");

// src/routes/popups.js
var CACHE_NS2 = "popups:list";
var CACHE_TTL3 = 5;
var DISPLAY_MODES = /* @__PURE__ */ new Set(["parallel", "sequential"]);
var DEFAULT_MODE = "sequential";
var MODE_KEY = "popup_display_mode";
async function handlePopups(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/popups/, "") || "/";
  const method = request.method;
  if (path === "/" && method === "GET") {
    return listPublic(env2, ctx, services);
  }
  if (path === "/all" && method === "GET") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return listAll(env2, services);
  }
  if (path === "/config" && method === "PUT") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return setConfig(request, env2, ctx, services);
  }
  if (path === "/" && method === "POST") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return createPopup(request, env2, ctx, services);
  }
  const idMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (idMatch) {
    const id2 = idMatch[1];
    if (method === "PATCH") {
      if (!await verifyAdmin(request, env2))
        return jsonError(401, "Unauthorized");
      return updatePopup(request, env2, ctx, services, id2);
    }
    if (method === "DELETE") {
      if (!await verifyAdmin(request, env2))
        return jsonError(401, "Unauthorized");
      return deletePopup(env2, ctx, services, id2);
    }
  }
  return jsonError(404, "Not Found");
}
__name(handlePopups, "handlePopups");
async function getDisplayMode(services) {
  try {
    const r = await services.adminSettings.get(MODE_KEY);
    const v = r?.fields?.Value || "";
    return DISPLAY_MODES.has(v) ? v : DEFAULT_MODE;
  } catch (e) {
    if (e?.notFound) return DEFAULT_MODE;
    throw e;
  }
}
__name(getDisplayMode, "getDisplayMode");
function recordToDto(r) {
  const f = r.fields || {};
  return {
    id: r.id,
    title: f.Title || "",
    imageUrl: f.ImageUrl || "",
    alt: f.Alt || "",
    linkUrl: f.LinkUrl || "",
    widthPx: f.WidthPx ?? null,
    topPx: Number(f.TopPx) || 0,
    leftPx: Number(f.LeftPx) || 0,
    active: f.Active === true,
    order: Number(f.Order) || 0,
    createdAt: f.CreatedAt || "",
    updatedAt: f.UpdatedAt || ""
  };
}
__name(recordToDto, "recordToDto");
async function listPublic(env2, ctx, services) {
  const hit = await edgeCacheGetSwr(CACHE_NS2, CACHE_TTL3);
  if (hit?.fresh) return jsonOk(hit.data);
  try {
    const [records, displayMode] = await Promise.all([
      services.popups.listAll({ sort: [{ field: "Order", direction: "asc" }] }),
      getDisplayMode(services)
    ]);
    const popups = records.map(recordToDto).filter((p) => p.active && p.imageUrl);
    const payload = { popups, displayMode };
    await edgeCachePutSwr(CACHE_NS2, payload, ctx);
    return jsonOk(payload);
  } catch (error3) {
    if (hit) return jsonOk(hit.data);
    throw error3;
  }
}
__name(listPublic, "listPublic");
async function listAll(env2, services) {
  const [records, displayMode] = await Promise.all([
    services.popups.listAll({ sort: [{ field: "Order", direction: "asc" }] }),
    getDisplayMode(services)
  ]);
  const popups = records.map(recordToDto);
  return jsonOk({ popups, displayMode });
}
__name(listAll, "listAll");
function sanitizeBody(body, { partial = false } = {}) {
  const out = {};
  const setStr = /* @__PURE__ */ __name((key, max = 500) => {
    if (key in body) out[key] = String(body[key] || "").slice(0, max);
  }, "setStr");
  const setIntOpt = /* @__PURE__ */ __name((key) => {
    if (key in body) {
      const v = body[key];
      if (v === null || v === "" || v === void 0) {
        out[key] = null;
      } else {
        const n = Number(v);
        out[key] = Number.isFinite(n) ? Math.round(n) : null;
      }
    }
  }, "setIntOpt");
  const setIntDef = /* @__PURE__ */ __name((key, def = 0) => {
    if (key in body) {
      const n = Number(body[key]);
      out[key] = Number.isFinite(n) ? Math.round(n) : def;
    } else if (!partial) {
      out[key] = def;
    }
  }, "setIntDef");
  setStr("Title", 200);
  setStr("ImageUrl", 1e3);
  setStr("Alt", 300);
  setStr("LinkUrl", 1e3);
  setIntOpt("WidthPx");
  setIntDef("TopPx", 0);
  setIntDef("LeftPx", 0);
  if ("Active" in body) out.Active = !!body.Active;
  setIntDef("Order", 0);
  return out;
}
__name(sanitizeBody, "sanitizeBody");
async function createPopup(request, env2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  if (!body || typeof body !== "object") return jsonError(400, "Invalid body");
  if (!body.ImageUrl) return jsonError(400, "ImageUrl required");
  const fields = sanitizeBody(body);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  fields.CreatedAt = now;
  fields.UpdatedAt = now;
  if (!("Active" in fields)) fields.Active = false;
  if (!("Order" in fields)) fields.Order = 0;
  const created = await services.popups.create(fields);
  await edgeCacheDelete(CACHE_NS2, ctx);
  return jsonOk(recordToDto(created));
}
__name(createPopup, "createPopup");
async function updatePopup(request, env2, ctx, services, id2) {
  const existing = await services.popups.get(id2);
  if (!existing) return jsonError(404, "Not Found");
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = sanitizeBody(body, { partial: true });
  fields.UpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const oldUrl = existing.fields?.ImageUrl;
  const newUrl = fields.ImageUrl;
  if (newUrl && oldUrl && newUrl !== oldUrl) {
    const task = services.media.deleteMany([oldUrl]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  const updated = await services.popups.update(id2, fields);
  await edgeCacheDelete(CACHE_NS2, ctx);
  return jsonOk(recordToDto(updated));
}
__name(updatePopup, "updatePopup");
async function deletePopup(env2, ctx, services, id2) {
  let existing = null;
  try {
    existing = await services.popups.get(id2);
  } catch (e) {
    if (e?.notFound) return jsonError(404, "Not Found");
    throw e;
  }
  const url = existing?.fields?.ImageUrl;
  await services.popups.delete(id2);
  if (url) {
    const task = services.media.deleteMany([url]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDelete(CACHE_NS2, ctx);
  return jsonOk({ ok: true });
}
__name(deletePopup, "deletePopup");
async function setConfig(request, env2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const mode = String(body?.displayMode || "");
  if (!DISPLAY_MODES.has(mode))
    return jsonError(400, "displayMode must be 'parallel' or 'sequential'");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env2.DB.prepare(
    "INSERT INTO AdminSettings (id, Value, UpdatedAt) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET Value=excluded.Value, UpdatedAt=excluded.UpdatedAt"
  ).bind(MODE_KEY, mode, now).run();
  await edgeCacheDelete(CACHE_NS2, ctx);
  return jsonOk({ displayMode: mode });
}
__name(setConfig, "setConfig");

// src/routes/portfolio.js
var CACHE_NS3 = "portfolio:list";
var CACHE_TTL4 = 600;
var PAGE_SIZE_DEFAULT = 24;
var PAGE_SIZE_MAX = 60;
var CACHE_MAX_PAGES = 12;
function listCacheNs2(page, limit) {
  return `${CACHE_NS3}:p${page}:l${limit}`;
}
__name(listCacheNs2, "listCacheNs");
function listCacheNamespaces() {
  const all = [CACHE_NS3];
  for (const limit of [PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX]) {
    for (let p = 1; p <= CACHE_MAX_PAGES; p++) all.push(listCacheNs2(p, limit));
  }
  return all;
}
__name(listCacheNamespaces, "listCacheNamespaces");
async function handlePortfolio(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/portfolio/, "") || "/";
  if (path === "/" && request.method === "GET")
    return listPortfolio(request, env2, ctx, services);
  if (path === "/" && request.method === "POST") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return createProject(request, env2, ctx, services);
  }
  if (path === "/reorder" && request.method === "POST") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return reorderPortfolio(request, env2, ctx, services);
  }
  const m = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const id2 = m[1];
    if (request.method === "GET") return getProject(env2, id2, services);
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    if (request.method === "PATCH")
      return patchProject(request, env2, id2, ctx, services);
    if (request.method === "DELETE")
      return deleteProject(env2, id2, ctx, services);
  }
  return jsonError(404, "Not Found");
}
__name(handlePortfolio, "handlePortfolio");
async function reorderPortfolio(request, env2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  if (!Array.isArray(body.updates))
    return jsonError(400, "updates array required");
  const updates = body.updates.filter(
    (u) => u && typeof u.id === "string" && Number.isFinite(Number(u.order))
  ).map((u) => ({ id: u.id, value: Number(u.order) }));
  if (!updates.length) return jsonError(400, "no valid updates");
  await services.portfolio.batchUpdateColumn("Order", updates);
  await edgeCacheDeleteMany(listCacheNamespaces(), ctx);
  return jsonOk({ updated: updates.length });
}
__name(reorderPortfolio, "reorderPortfolio");
function collectUrls(record) {
  if (!record) return [];
  const out = [];
  if (record.thumbAfter) out.push(record.thumbAfter);
  if (record.thumbBefore) out.push(record.thumbBefore);
  if (Array.isArray(record.images)) out.push(...record.images.filter(Boolean));
  return out;
}
__name(collectUrls, "collectUrls");
function toClient(r) {
  const f = r.fields;
  return {
    id: r.id,
    name: f.Name || "",
    folder: f.Folder || "",
    count: f.Count || 0,
    category: f.Category || "HOUSE",
    order: f.Order ?? 0,
    rightId: f.RightId || void 0,
    rightFolder: f.RightFolder || void 0,
    rightCount: f.RightCount || void 0,
    rightName: f.RightName || void 0,
    thumbAfter: f.ThumbAfter || void 0,
    thumbBefore: f.ThumbBefore || void 0,
    images: safeJsonParse2(f.Images)
  };
}
__name(toClient, "toClient");
function withDerivedRef(client, byId) {
  if (client.rightId && byId.has(client.rightId)) {
    const tgt = byId.get(client.rightId);
    const tf = tgt.fields;
    client.rightFolder = tf.Folder || "";
    client.rightName = tf.Name || "";
    const imgs = safeJsonParse2(tf.Images);
    client.rightCount = imgs.length || tf.Count || 0;
  }
  return client;
}
__name(withDerivedRef, "withDerivedRef");
function safeJsonParse2(s2, fallback = []) {
  if (!s2) return fallback;
  try {
    const v = JSON.parse(s2);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
__name(safeJsonParse2, "safeJsonParse");
async function listPortfolio(request, env2, ctx, services) {
  const url = new URL(request.url);
  const page = Math.max(
    1,
    Math.min(parseInt(url.searchParams.get("page") || "1", 10) || 1, 200)
  );
  const limit = Math.max(
    1,
    Math.min(
      parseInt(url.searchParams.get("limit") || "", 10) || PAGE_SIZE_DEFAULT,
      PAGE_SIZE_MAX
    )
  );
  const ns = listCacheNs2(page, limit);
  const hit = await edgeCacheGetSwr(ns, CACHE_TTL4);
  if (hit?.fresh) return jsonOk(hit.data);
  try {
    const res = await services.portfolio.list({
      sort: [{ field: "Order", direction: "asc" }],
      limit: limit + 1,
      offset: (page - 1) * limit
    });
    const rows = res.records || [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const byId = new Map(pageRows.map((r) => [r.id, r]));
    const payload = {
      records: pageRows.map((r) => withDerivedRef(toClient(r), byId)),
      page,
      limit,
      hasMore
    };
    await edgeCachePutSwr(ns, payload, ctx);
    return jsonOk(payload);
  } catch (error3) {
    if (hit) return jsonOk(hit.data);
    throw error3;
  }
}
__name(listPortfolio, "listPortfolio");
async function getProject(env2, id2, services) {
  const r = await services.portfolio.get(id2);
  const client = toClient(r);
  if (client.rightId) {
    try {
      const tgt = await services.portfolio.get(client.rightId);
      const byId = /* @__PURE__ */ new Map([[tgt.id, tgt]]);
      withDerivedRef(client, byId);
    } catch {
    }
  }
  return jsonOk({ record: client });
}
__name(getProject, "getProject");
async function createProject(request, env2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields(body);
  if (!fields.Name || !fields.Folder) {
    return jsonError(400, "Name and Folder required");
  }
  const r = await services.portfolio.create(fields);
  await edgeCacheDeleteMany(listCacheNamespaces(), ctx);
  return jsonOk({ record: toClient(r) });
}
__name(createProject, "createProject");
async function patchProject(request, env2, id2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields(body);
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");
  const before = toClient(await services.portfolio.get(id2));
  const r = await services.portfolio.update(id2, fields);
  const after = toClient(r);
  const orphan = collectUrls(before).filter(
    (u) => !collectUrls(after).includes(u)
  );
  if (orphan.length > 0) {
    const task = services.media.deleteMany(orphan);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDeleteMany(listCacheNamespaces(), ctx);
  return jsonOk({ record: after, cleaned: orphan.length });
}
__name(patchProject, "patchProject");
async function deleteProject(env2, id2, ctx, services) {
  const before = toClient(await services.portfolio.get(id2));
  await services.portfolio.delete(id2);
  const urls = collectUrls(before);
  if (urls.length > 0) {
    const task = services.media.deleteMany(urls);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDeleteMany(listCacheNamespaces(), ctx);
  return jsonOk({ deleted: id2, cleaned: urls.length });
}
__name(deleteProject, "deleteProject");
function mapFields(body) {
  const out = {};
  if ("name" in body) out.Name = body.name;
  if ("folder" in body) out.Folder = body.folder;
  if ("count" in body) out.Count = Number(body.count) || 0;
  if ("category" in body) out.Category = body.category;
  if ("order" in body) out.Order = Number(body.order) || 0;
  if ("rightId" in body) out.RightId = body.rightId || "";
  if ("rightFolder" in body) out.RightFolder = body.rightFolder || "";
  if ("rightCount" in body) out.RightCount = Number(body.rightCount) || 0;
  if ("rightName" in body) out.RightName = body.rightName || "";
  if ("thumbAfter" in body) out.ThumbAfter = body.thumbAfter || "";
  if ("thumbBefore" in body) out.ThumbBefore = body.thumbBefore || "";
  if ("images" in body) {
    const arr = Array.isArray(body.images) ? body.images.filter((x) => typeof x === "string") : [];
    out.Images = JSON.stringify(arr);
    out.Count = arr.length;
  }
  return out;
}
__name(mapFields, "mapFields");

// src/routes/community.js
var CACHE_TTL5 = 60;
function listCacheNs3(board) {
  return `community:list:${board || "all"}`;
}
__name(listCacheNs3, "listCacheNs");
function postCacheNs(idx) {
  return `community:post:${idx}`;
}
__name(postCacheNs, "postCacheNs");
function extractHtmlImageUrls(html) {
  if (!html || typeof html !== "string") return [];
  const out = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}
__name(extractHtmlImageUrls, "extractHtmlImageUrls");
function collectPostUrls(post) {
  if (!post) return [];
  const out = /* @__PURE__ */ new Set();
  if (post.thumb) out.add(post.thumb);
  (post.images || []).forEach((u) => u && out.add(u));
  (post.content_blocks || []).forEach((b) => {
    if (!b) return;
    if (b.type === "image" || b.type === "gallery") {
      if (b.src) out.add(b.src);
      if (Array.isArray(b.images)) b.images.forEach((u) => u && out.add(u));
    }
  });
  extractHtmlImageUrls(post.body_html).forEach((u) => u && out.add(u));
  return [...out];
}
__name(collectPostUrls, "collectPostUrls");
async function handleCommunity(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/community/, "") || "/";
  if (path === "/" && request.method === "GET")
    return listCommunity(request, env2, ctx, services);
  if (path === "/" && request.method === "POST") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return createPost(request, env2, ctx, services);
  }
  const m = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const idx = m[1];
    if (request.method === "GET") return getPost(env2, idx, ctx, services);
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    if (request.method === "PATCH")
      return patchPost(request, env2, idx, ctx, services);
    if (request.method === "DELETE") return deletePost(env2, idx, ctx, services);
  }
  return jsonError(404, "Not Found");
}
__name(handleCommunity, "handleCommunity");
function toListClient(r) {
  const f = r.fields;
  return {
    id: r.id,
    idx: f.Idx || "",
    title: f.Title || "",
    category: f.Category || "",
    date: f.Date || "",
    board: f.Board || "Residential",
    thumb: f.Thumb || "",
    views: f.Views || 0,
    excerpt: f.Excerpt || ""
  };
}
__name(toListClient, "toListClient");
function toDetailClient(r) {
  const f = r.fields;
  return {
    id: r.id,
    idx: f.Idx || "",
    title: f.Title || "",
    category: f.Category || "",
    date: f.Date || "",
    board: f.Board || "Residential",
    thumb: f.Thumb || "",
    views: f.Views || 0,
    excerpt: f.Excerpt || "",
    body_text: f.BodyText || "",
    body_html: f.BodyHtml || "",
    images: safeJsonParse3(f.Images),
    content_blocks: safeJsonParse3(f.ContentBlocks)
  };
}
__name(toDetailClient, "toDetailClient");
async function listCommunity(request, env2, ctx, services) {
  const url = new URL(request.url);
  const board = url.searchParams.get("board");
  const ns = listCacheNs3(board);
  const hit = await edgeCacheGetSwr(ns, CACHE_TTL5);
  if (hit?.fresh) return jsonOk(hit.data);
  try {
    const where = board ? { Board: board } : void 0;
    const records = await services.community.listAll({
      where,
      sort: [{ field: "Date", direction: "desc" }]
    });
    const payload = {
      total: records.length,
      posts: records.map(toListClient)
    };
    await edgeCachePutSwr(ns, payload, ctx);
    return jsonOk(payload);
  } catch (error3) {
    if (hit) return jsonOk(hit.data);
    throw error3;
  }
}
__name(listCommunity, "listCommunity");
async function getPost(env2, idx, ctx, services) {
  const ns = postCacheNs(idx);
  const hit = await edgeCacheGetSwr(ns, CACHE_TTL5);
  if (hit?.fresh) return jsonOk(hit.data);
  try {
    const data = await services.community.list({
      where: { Idx: idx },
      pageSize: 1
    });
    const r = (data.records || [])[0];
    if (!r) return jsonError(404, "Post not found");
    const payload = { post: toDetailClient(r) };
    await edgeCachePutSwr(ns, payload, ctx);
    return jsonOk(payload);
  } catch (error3) {
    if (hit) return jsonOk(hit.data);
    throw error3;
  }
}
__name(getPost, "getPost");
async function createPost(request, env2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const fields = mapFields2(body);
  if (!fields.Idx || !fields.Title)
    return jsonError(400, "Idx and Title required");
  const r = await services.community.create(fields);
  await edgeCacheDeleteMany(
    [listCacheNs3(null), listCacheNs3("Residential"), listCacheNs3("Commercial")],
    ctx
  );
  return jsonOk({ post: toDetailClient(r) });
}
__name(createPost, "createPost");
async function patchPost(request, env2, idx, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const data = await services.community.list({
    where: { Idx: idx },
    pageSize: 1
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  const before = toDetailClient(r);
  const fields = mapFields2(body);
  if (!Object.keys(fields).length) return jsonError(400, "No fields to update");
  const updated = await services.community.update(r.id, fields);
  const after = toDetailClient(updated);
  const afterSet = new Set(collectPostUrls(after));
  const orphan = collectPostUrls(before).filter((u) => !afterSet.has(u));
  if (orphan.length > 0) {
    const task = services.media.deleteMany(orphan);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDeleteMany(
    [
      listCacheNs3(null),
      listCacheNs3("Residential"),
      listCacheNs3("Commercial"),
      postCacheNs(idx)
    ],
    ctx
  );
  return jsonOk({ post: after, cleaned: orphan.length });
}
__name(patchPost, "patchPost");
async function deletePost(env2, idx, ctx, services) {
  const data = await services.community.list({
    where: { Idx: idx },
    pageSize: 1
  });
  const r = (data.records || [])[0];
  if (!r) return jsonError(404, "Post not found");
  const before = toDetailClient(r);
  await services.community.delete(r.id);
  const urls = collectPostUrls(before);
  if (urls.length > 0) {
    const task = services.media.deleteMany(urls);
    if (ctx && ctx.waitUntil) ctx.waitUntil(task);
    else await task;
  }
  await edgeCacheDeleteMany(
    [
      listCacheNs3(null),
      listCacheNs3("Residential"),
      listCacheNs3("Commercial"),
      postCacheNs(idx)
    ],
    ctx
  );
  return jsonOk({ deleted: idx, cleaned: urls.length });
}
__name(deletePost, "deletePost");
function mapFields2(body) {
  const out = {};
  if ("idx" in body) out.Idx = String(body.idx);
  if ("title" in body) out.Title = body.title;
  if ("category" in body) out.Category = body.category;
  if ("date" in body) out.Date = body.date;
  if ("board" in body) out.Board = body.board;
  if ("thumb" in body) out.Thumb = body.thumb;
  if ("views" in body) out.Views = Number(body.views) || 0;
  if ("excerpt" in body) out.Excerpt = body.excerpt;
  if ("body_text" in body) out.BodyText = body.body_text;
  if ("body_html" in body) out.BodyHtml = body.body_html;
  if ("images" in body) out.Images = JSON.stringify(body.images || []);
  if ("content_blocks" in body)
    out.ContentBlocks = JSON.stringify(body.content_blocks || []);
  return out;
}
__name(mapFields2, "mapFields");
function safeJsonParse3(s2, fallback = []) {
  if (!s2) return fallback;
  try {
    const v = JSON.parse(s2);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
__name(safeJsonParse3, "safeJsonParse");

// src/routes/auth.js
var SESSION_TTL = 60 * 60 * 12;
var DEFAULT_ADMIN_USERNAME = "admin";
var LOGIN_FAIL_ALERT_THRESHOLD = 5;
function queueTask(ctx, task) {
  if (task && typeof task.then === "function") ctx?.waitUntil?.(task);
}
__name(queueTask, "queueTask");
async function recordLoginFailure(ip) {
  const cache = caches.default;
  const key = `https://login-fail.internal/count/${ip}`;
  const cached = await cache.match(key);
  let count3 = cached ? parseInt(await cached.text() || "0", 10) || 0 : 0;
  count3++;
  await cache.put(
    key,
    new Response(String(count3), {
      headers: { "cache-control": "max-age=3600" }
    })
  );
  return count3;
}
__name(recordLoginFailure, "recordLoginFailure");
async function maybeAlertBruteforce(env2, ip, username, count3) {
  if (count3 < LOGIN_FAIL_ALERT_THRESHOLD) return;
  const cache = caches.default;
  const alertKey = `https://login-fail.internal/alert/${ip}`;
  if (await cache.match(alertKey)) return;
  await cache.put(
    alertKey,
    new Response("1", { headers: { "cache-control": "max-age=3600" } })
  );
  await notifyInfra(
    env2,
    `<b>[day1design/auth]</b> \u{1F6A8} \uB85C\uADF8\uC778 \uC2E4\uD328 \uAE09\uC99D(\uBE0C\uB8E8\uD2B8\uD3EC\uC2A4 \uC758\uC2EC)
IP: ${escapeHtml(ip)}
\uB204\uC801 \uC2E4\uD328: ${count3}\uD68C (\uC784\uACC4 ${LOGIN_FAIL_ALERT_THRESHOLD})
\uC2DC\uB3C4 ID: <code>${escapeHtml(username || "-")}</code>`
  );
}
__name(maybeAlertBruteforce, "maybeAlertBruteforce");
async function handleAuth(request, env2, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, "");
  if (path === "/login" && request.method === "POST") {
    return loginWithPassword(request, env2, ctx);
  }
  if (path === "/logout" && request.method === "POST") {
    const res = jsonOk({ loggedIn: false });
    res.headers.append("set-cookie", clearSessionCookie());
    return res;
  }
  if (path === "/me" && request.method === "GET") {
    const ok = await verifyAdmin(request, env2);
    return jsonOk({ loggedIn: ok });
  }
  return jsonError(404, "Not Found");
}
__name(handleAuth, "handleAuth");
async function loginWithPassword(request, env2, ctx) {
  const ip = clientIP(request);
  const rl = await rateLimit(`auth-login-v2:${ip}`, 20);
  if (!rl.allowed) {
    queueTask(
      ctx,
      notifyInfra(
        env2,
        `<b>[day1design/auth]</b> \u26D4 \uB85C\uADF8\uC778 rate-limit \uCD08\uACFC
IP: ${escapeHtml(ip)} (${rl.count}\uD68C)`
      )
    );
    queueAudit(ctx, env2, request, {
      type: "rate_limit",
      severity: "warn",
      status: 429,
      message: `\uB85C\uADF8\uC778 rate-limit \uCD08\uACFC (${rl.count}\uD68C)`
    });
    return jsonError(429, "Too many requests");
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const username = String(body?.username || "").trim();
  const password = typeof body?.password === "string" ? body.password : "";
  const expectedUsername = env2.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
  const expectedPassword = env2.ADMIN_PASSWORD || "";
  if (!env2.JWT_SECRET) return jsonError(500, "JWT_SECRET not configured");
  if (!expectedPassword) return jsonError(500, "ADMIN_PASSWORD not configured");
  const ok = timingSafeEqual(username, expectedUsername) && timingSafeEqual(password, expectedPassword);
  if (!ok) {
    queueAudit(ctx, env2, request, {
      type: "login_fail",
      severity: "warn",
      status: 401,
      username,
      message: "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778 \uC2E4\uD328"
    });
    queueTask(
      ctx,
      (async () => {
        const count3 = await recordLoginFailure(ip);
        await maybeAlertBruteforce(env2, ip, username, count3);
      })()
    );
    return jsonError(401, "Invalid credentials");
  }
  const jwt = await sign(
    { sub: "admin", method: "password", username, ip },
    env2.JWT_SECRET,
    SESSION_TTL
  );
  const res = jsonOk({ loggedIn: true, token: jwt });
  res.headers.append("set-cookie", setSessionCookie(jwt));
  queueAudit(ctx, env2, request, {
    type: "login_ok",
    severity: "info",
    status: 200,
    username,
    message: "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778 \uC131\uACF5"
  });
  return res;
}
__name(loginWithPassword, "loginWithPassword");

// src/routes/upload.js
var MAX_BYTES = 10 * 1024 * 1024;
async function handleUpload(request, env2, ctx, services = createServices(env2)) {
  if (!await verifyAdmin(request, env2)) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/upload/, "");
  if (path === "/image" && request.method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string")
      return jsonError(400, "file required");
    if (file.size > MAX_BYTES) return jsonError(413, "File too large");
    try {
      assertUploadPolicy(file);
    } catch (e) {
      return jsonError(e.status || 415, e.message);
    }
    const folder = String(form.get("folder") || "uploads").replace(
      /[^\w/-]/g,
      ""
    );
    const name = String(form.get("name") || file.name);
    const ext = fileExt(name) || "bin";
    const contentType = String(file.type || "").trim() || "image/webp";
    const key = `${folder}/${datePrefix()}-${randomId()}/${safeFileName(name.replace(/\.[^.]+$/, ""))}.${ext}`;
    const uploadedUrl = await services.media.upload(
      key,
      await file.arrayBuffer(),
      { contentType }
    );
    return jsonOk({ url: uploadedUrl, key });
  }
  return jsonError(404, "Not Found");
}
__name(handleUpload, "handleUpload");

// src/routes/meta-lead.js
var MAX_BODY_CHARS = 65536;
function timingSafeEqual2(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual2, "timingSafeEqual");
async function isDuplicate(key) {
  const cache = await caches.open("meta-lead-dedup");
  return !!await cache.match(
    new Request(`https://meta-lead.internal/${encodeURIComponent(key)}`)
  );
}
__name(isDuplicate, "isDuplicate");
async function markProcessed(key) {
  const cache = await caches.open("meta-lead-dedup");
  await cache.put(
    new Request(`https://meta-lead.internal/${encodeURIComponent(key)}`),
    new Response("1", { headers: { "Cache-Control": "s-maxage=600" } })
  );
}
__name(markProcessed, "markProcessed");
function normalizePlatform(s2) {
  const v = String(s2 || "").toLowerCase();
  if (v.includes("instagram") || v === "ig") return "instagram";
  if (v.includes("facebook") || v === "fb") return "facebook";
  return "facebook";
}
__name(normalizePlatform, "normalizePlatform");
function normalizeQuestionKey(raw) {
  return String(raw ?? "").replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
__name(normalizeQuestionKey, "normalizeQuestionKey");
var FIELD_RULES = [
  ["name", ["full name", "\uC131\uD568", "\uC774\uB984", "\uD568\uC790", "\uACE0\uAC1D\uBA85", "\uC2E0\uCCAD\uC790"]],
  [
    "phone",
    [
      "phone number",
      "phone",
      "\uC5F0\uB77D\uCC98",
      "\uC804\uD654",
      "\uD734\uB300\uD3F0",
      "\uD578\uB4DC\uD3F0",
      "\uD734\uB300\uC804\uD654",
      "mobile"
    ]
  ],
  ["email", ["email", "\uC774\uBA54\uC77C", "\uBA54\uC77C"]],
  [
    "location",
    ["city", "\uC9C0\uC5ED", "\uC18C\uC7AC\uC9C0", "\uC8FC\uC18C", "\uC704\uCE58", "\uD604\uC7A5", "\uAC70\uC8FC\uC9C0", "address"]
  ],
  ["spaceType", ["\uACF5\uAC04", "\uC720\uD615", "\uC885\uB958", "\uD615\uD0DC", "\uC6A9\uB3C4"]],
  ["area", ["\uBA74\uC801", "\uD3C9\uC218", "\uD3C9\uD615", "\uADDC\uBAA8", "\uD06C\uAE30", "\uC81C\uACF1\uBBF8\uD130", "\u33A1"]],
  [
    "scheduledDate",
    [
      "\uC2DC\uACF5",
      "\uC77C\uC815",
      "\uC608\uC815",
      "\uC785\uC8FC",
      "\uCC29\uACF5",
      "\uC2DC\uC791\uC77C",
      "\uB0A0\uC9DC",
      "\uC2DC\uAE30",
      "\uC2DC\uC810",
      "\uC5B8\uC81C",
      "\uD76C\uB9DD\uC77C"
    ]
  ],
  ["budget", ["\uC608\uC0B0", "\uBE44\uC6A9", "\uAE08\uC561", "\uAC00\uACA9\uB300", "\uC5BC\uB9C8"]]
];
function serializeFormFields(pairs) {
  const items = (Array.isArray(pairs) ? pairs : []).slice(0, 40).map((p) => ({
    q: String(p?.q ?? "").slice(0, 200),
    a: String(p?.a ?? "").slice(0, 500),
    f: String(p?.f ?? "")
  }));
  return items.length ? JSON.stringify(items) : "";
}
__name(serializeFormFields, "serializeFormFields");
function fieldValueOf(field) {
  return (Array.isArray(field?.values) ? field.values : []).map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
}
__name(fieldValueOf, "fieldValueOf");
function matchStandardField(rawKey) {
  const key = normalizeQuestionKey(rawKey);
  if (!key) return "";
  const lower = String(rawKey ?? "").trim().toLowerCase();
  if (lower === "first_name" || lower === "last_name") return "name";
  const hit = FIELD_RULES.find(
    ([, tokens]) => tokens.some((t) => key.includes(t))
  );
  return hit ? hit[0] : "";
}
__name(matchStandardField, "matchStandardField");
function mapFieldData(fieldData) {
  const out = { extras: [], pairs: [] };
  const items = Array.isArray(fieldData) ? fieldData : [];
  const firstName = {};
  for (const item of items) {
    const rawKey = String(item?.name ?? "").trim();
    const rawLower = rawKey.toLowerCase();
    const value = fieldValueOf(item);
    if (!rawKey || !value) continue;
    if (rawLower === "first_name" || rawLower === "last_name") {
      firstName[rawLower] = value;
      out.pairs.push({ q: rawKey, a: value, f: "name" });
      continue;
    }
    const field = matchStandardField(rawKey);
    if (field && !out[field]) {
      out[field] = value;
      out.pairs.push({ q: rawKey, a: value, f: field });
    } else {
      out.extras.push(`${rawKey}: ${value}`);
      out.pairs.push({ q: rawKey, a: value, f: "" });
    }
  }
  if (!out.name) {
    out.name = [firstName.last_name, firstName.first_name].filter(Boolean).join(" ");
  }
  return out;
}
__name(mapFieldData, "mapFieldData");
function normalizeLeadPayload(body = {}) {
  const raw = body.fieldData || body.field_data;
  const mapped = raw ? mapFieldData(raw) : { extras: [] };
  const pick = /* @__PURE__ */ __name((...candidates) => {
    for (const c of candidates) {
      const v = String(c ?? "").trim();
      if (v) return v;
    }
    return "";
  }, "pick");
  return {
    leadId: pick(body.leadId, body.lead_id, body.id),
    name: pick(body.name, mapped.name),
    phone: pick(body.phone, mapped.phone),
    location: pick(body.location, mapped.location),
    spaceType: pick(body.spaceType, mapped.spaceType),
    area: pick(body.area, mapped.area),
    scheduledDate: pick(body.scheduledDate, mapped.scheduledDate),
    budget: pick(body.budget, mapped.budget),
    email: pick(body.email, mapped.email),
    platform: pick(body.platform),
    // Campaign 컬럼은 Make 시절부터 '광고명'이 들어와 있다(캠페인명 아님).
    // 폴링 전환으로 의미가 바뀌면 어드민 집계가 과거와 어긋나므로 광고명을 유지하고,
    // 진짜 캠페인명은 campaignName 으로 따로 받아 Detail 에 덧붙인다.
    campaign: pick(body.campaign, body.adName, body.ad_name),
    campaignName: pick(body.campaignName, body.campaign_name),
    campaignId: pick(body.campaignId, body.campaign_id),
    adsetName: pick(body.adsetName, body.adset_name),
    adsetId: pick(body.adsetId, body.adset_id),
    adId: pick(body.adId, body.ad_id),
    timestamp: pick(body.timestamp, body.createdTime, body.created_time),
    extras: mapped.extras,
    formFields: mapped.pairs
  };
}
__name(normalizeLeadPayload, "normalizeLeadPayload");
async function findByMetaLeadId(services, leadId) {
  if (!leadId) return null;
  try {
    const rows = await services.estimates.list({
      where: { MetaLeadId: leadId },
      limit: 1
    });
    return rows?.records?.[0] || null;
  } catch {
    return null;
  }
}
__name(findByMetaLeadId, "findByMetaLeadId");
async function captureInvalidLead(env2, ctx, services, { raw, lead, leadId, name, phoneDigits, reason }) {
  const summary = [
    lead.location && `\uC9C0\uC5ED: ${lead.location}`,
    lead.spaceType && `\uACF5\uAC04\uC720\uD615: ${lead.spaceType}`,
    lead.area && `\uBA74\uC801: ${lead.area}`,
    lead.scheduledDate && `\uC2DC\uACF5\uC608\uC815\uC77C: ${lead.scheduledDate}`,
    lead.budget && `\uAC00\uC6A9\uC608\uC0B0: ${lead.budget}`,
    lead.email && `\uC774\uBA54\uC77C: ${lead.email}`,
    lead.campaignName && `\uCEA0\uD398\uC778: ${lead.campaignName}`,
    ...lead.extras
  ].filter(Boolean).join("\n");
  await archiveAttemptToR2(env2, ctx, {
    ip: "",
    ua: "meta-lead-poller",
    fields: { name, phone: phoneDigits, leadId, campaign: lead.campaign },
    outcome: "meta_invalid",
    error: reason,
    rawText: raw
  });
  await recordRejectToD1(services, ctx, {
    name,
    phone: phoneDigits,
    email: lead.email,
    fields: { referral: "Meta \uAD11\uACE0", detail: summary },
    ip: "",
    outcome: "meta_invalid",
    error: reason,
    source: "meta",
    extra: {
      MetaLeadId: leadId,
      Platform: normalizePlatform(lead.platform),
      Campaign: lead.campaign.slice(0, 200),
      MetaFieldData: serializeFormFields(lead.formFields),
      SubmittedAt: lead.timestamp || (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  ctx.waitUntil(
    Promise.resolve(
      notifyTelegram(
        env2,
        `<b>[day1design/meta-lead]</b> \u26A0 <b>\uD544\uC218\uC815\uBCF4 \uC5C6\uB294 Meta \uB9AC\uB4DC</b>
\u251C \uC0AC\uC720: ${escapeHtml(reason)}
\u251C leadId: ${escapeHtml(leadId || "-")}
\u251C \uC774\uB984: ${escapeHtml(name || "-")}
\u251C \uC5F0\uB77D\uCC98: ${escapeHtml(phoneDigits || "-")}
\u2514 \uC811\uC218\uAD00\uB9AC\uC5D0 '\uC624\uB958' \uCE74\uB4DC\uB85C \uC800\uC7A5\uB428 \u2014 \uD3FC \uC9C8\uBB38 \uBB38\uAD6C \uD655\uC778 \uD544\uC694`
      )
    ).catch(() => {
    })
  );
  return jsonError(400, "Missing name or phone", { captured: true });
}
__name(captureInvalidLead, "captureInvalidLead");
function buildMetaLeadMessage({
  name,
  prettyPhone,
  location,
  spaceType,
  area,
  scheduledDate,
  budget,
  platform: platform2,
  campaign,
  extras = []
}) {
  const platformLabel = platform2 === "instagram" ? "Instagram" : "Facebook";
  const spaceLabel = (spaceType || "").replace(/_/g, " ");
  const pushBlock = /* @__PURE__ */ __name((lines, header, rows) => {
    if (rows.length === 0) return;
    lines.push("", header);
    rows.forEach((row, i) => {
      lines.push(`${i === rows.length - 1 ? "\u2514" : "\u251C"} ${row}`);
    });
  }, "pushBlock");
  const out = [];
  out.push(`<b>[day1design/meta-lead]</b> \u{1F514} <b>\uC2E0\uADDC \uC0C1\uB2F4 \uC2E0\uCCAD</b>`);
  out.push(`\u{1F535} Meta \uAD11\uACE0`);
  const customer = [
    `\uC774\uB984: ${escapeHtml(name)}`,
    `\uC5F0\uB77D\uCC98: ${escapeHtml(prettyPhone)}`
  ];
  if (location) customer.push(`\uC9C0\uC5ED: ${escapeHtml(location)}`);
  pushBlock(out, `\u{1F464} <b>\uACE0\uAC1D\uC815\uBCF4</b>`, customer);
  const space = [];
  if (spaceLabel) space.push(`\uC720\uD615: ${escapeHtml(spaceLabel)}`);
  if (area) space.push(`\uBA74\uC801: ${escapeHtml(area)}`);
  if (scheduledDate) space.push(`\uC2DC\uACF5\uC608\uC815: ${escapeHtml(scheduledDate)}`);
  if (budget) space.push(`\uAC00\uC6A9\uC608\uC0B0: ${escapeHtml(budget)}`);
  pushBlock(out, `\u{1F3D8} <b>\uACF5\uAC04/\uC77C\uC815</b>`, space);
  const extraRows = (Array.isArray(extras) ? extras : []).slice(0, 12).map((line) => escapeHtml(String(line).slice(0, 200)));
  pushBlock(out, `\u{1F4CB} <b>\uD3FC \uC751\uB2F5</b>`, extraRows);
  const ads = [`\uD50C\uB7AB\uD3FC: ${escapeHtml(platformLabel)}`];
  if (campaign) ads.push(`\uCEA0\uD398\uC778: ${escapeHtml(campaign)}`);
  pushBlock(out, `\u{1F4E2} <b>\uAD11\uACE0\uC815\uBCF4</b>`, ads);
  return out.join("\n");
}
__name(buildMetaLeadMessage, "buildMetaLeadMessage");
async function handleMetaLead(request, env2, ctx, services = createServices(env2)) {
  if (!env2.META_LEAD_SECRET) {
    return jsonError(500, "Server misconfigured");
  }
  const provided = request.headers.get("x-meta-lead-secret") || "";
  if (!timingSafeEqual2(provided, env2.META_LEAD_SECRET)) {
    return jsonError(403, "Forbidden");
  }
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return jsonError(415, "Invalid Content-Type");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return jsonError(413, "Payload too large");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "Bad Request");
  }
  const lead = normalizeLeadPayload(body);
  const leadId = lead.leadId.slice(0, 64);
  if (leadId) {
    const existing = await findByMetaLeadId(services, leadId);
    if (existing) {
      return jsonOk({ duplicate: true, id: existing.id, source: "meta" });
    }
  }
  const name = lead.name.slice(0, 50);
  const phoneDigits = lead.phone.replace(/\D/g, "");
  if (!name || !phoneDigits) {
    return await captureInvalidLead(env2, ctx, services, {
      raw,
      lead,
      leadId,
      name,
      phoneDigits,
      reason: !name && !phoneDigits ? "\uC774\uB984\xB7\uC5F0\uB77D\uCC98 \uC5C6\uC74C" : !name ? "\uC774\uB984 \uC5C6\uC74C" : "\uC5F0\uB77D\uCC98 \uC5C6\uC74C"
    });
  }
  const timestamp = lead.timestamp;
  const dedupKey = `${phoneDigits}:${timestamp || "no-ts"}`;
  if (!leadId && timestamp && await isDuplicate(dedupKey)) {
    return jsonOk({ duplicate: true });
  }
  const location = lead.location.slice(0, 100);
  const spaceType = lead.spaceType.slice(0, 40);
  const area = lead.area.slice(0, 40);
  const scheduledDate = lead.scheduledDate.slice(0, 100);
  const budget = lead.budget;
  const platform2 = normalizePlatform(lead.platform);
  const campaign = lead.campaign.slice(0, 200);
  const prettyPhone = (() => {
    const p = phoneDigits;
    if (p.length === 11)
      return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
    if (p.length === 10)
      return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
    return p;
  })();
  if (!leadId && timestamp) await markProcessed(dedupKey);
  const detailLines = [];
  if (spaceType) detailLines.push(`\uACF5\uAC04\uC720\uD615: ${spaceType}`);
  if (area) detailLines.push(`\uBA74\uC801: ${area}`);
  if (scheduledDate) detailLines.push(`\uC2DC\uACF5\uC608\uC815\uC77C: ${scheduledDate}`);
  if (budget) detailLines.push(`\uAC00\uC6A9\uC608\uC0B0: ${budget}`);
  if (lead.campaignName) detailLines.push(`\uCEA0\uD398\uC778: ${lead.campaignName}`);
  for (const extra of lead.extras) detailLines.push(extra);
  const detail = detailLines.join("\n").slice(0, 2e3);
  let recordId = null;
  let saveError = null;
  try {
    const record = await services.estimates.create({
      Name: name,
      Phone: prettyPhone,
      Email: lead.email.slice(0, 120),
      SpaceType: spaceType,
      SpaceSize: area,
      Postcode: "",
      Address: location,
      AddressDetail: "",
      Schedule: scheduledDate,
      Referral: "Meta \uAD11\uACE0",
      Branch: "",
      Detail: detail,
      PrivacyAgreed: true,
      // Meta Lead Ads 는 Facebook 이 동의 수집
      ConceptFiles: "[]",
      FloorPlans: "[]",
      SubmittedAt: timestamp || (/* @__PURE__ */ new Date()).toISOString(),
      Status: "\uC811\uC218\uB300\uAE30",
      IP: "",
      Source: "meta",
      Platform: platform2,
      Campaign: campaign,
      MetaCampaign: lead.campaignName.slice(0, 200),
      MetaCampaignId: lead.campaignId.slice(0, 64),
      MetaAdset: lead.adsetName.slice(0, 200),
      MetaAdsetId: lead.adsetId.slice(0, 64),
      MetaAd: campaign,
      MetaAdId: lead.adId.slice(0, 64),
      MetaLeadId: leadId,
      // 폼 원문 응답 전량. 상담카드가 이걸 렌더하므로 폼 질문이 바뀌어도 코드 수정이 없다.
      MetaFieldData: serializeFormFields(lead.formFields)
    });
    recordId = record.id;
  } catch (e) {
    saveError = e.message || "D1 create failed";
    if (leadId && /UNIQUE constraint failed/i.test(saveError)) {
      const existing = await findByMetaLeadId(services, leadId);
      if (existing) {
        return jsonOk({ duplicate: true, id: existing.id, source: "meta" });
      }
    }
    await archiveAttemptToR2(env2, ctx, {
      ip: "",
      ua: "meta-lead-poller",
      fields: { name, phone: phoneDigits, leadId, campaign },
      outcome: "meta_d1_failed",
      error: saveError,
      rawText: raw
    });
  }
  ctx.waitUntil(
    (async () => {
      let capiStep = "ok";
      let lmsStep = "skip";
      try {
        await sendMetaCapiLead(env2, ctx, {
          actionSource: "system_generated",
          gaName: "lead_form",
          channel: "capi",
          eventId: `meta-lead:${phoneDigits}:${timestamp || ""}`,
          phone: phoneDigits,
          // 인스턴트폼 리드는 브라우저 신호(fbp·fbc·ua)가 없어 전화번호 하나로만
          // 매칭됐다. 폼이 이미 받아둔 이름·이메일을 같이 보내 신호를 늘린다.
          name: lead.name,
          email: lead.email,
          externalId: recordId || leadId,
          source: "meta",
          campaign,
          adset: lead.adsetName,
          ad: campaign,
          adId: lead.adId,
          estimateId: recordId,
          pagePath: ""
        });
      } catch {
        capiStep = "fail";
      }
      if (recordId) {
        await ensureNewCustomerNotification(env2.DB, {
          tenantId: "day1design",
          estimateId: recordId,
          payload: { region: location, available_budget: budget },
          createdAt: timestamp || /* @__PURE__ */ new Date()
        }).catch(() => null);
        await edgeCacheDeleteMany(
          ["estimates:list:all", "estimates:list:\uC811\uC218\uB300\uAE30"],
          ctx
        );
        await notifyTelegram(
          env2,
          buildMetaLeadMessage({
            name,
            prettyPhone,
            location,
            spaceType,
            area,
            scheduledDate,
            budget,
            platform: platform2,
            campaign,
            extras: lead.extras
          })
        );
        const smsChannel = platform2 === "instagram" ? "instagram" : "facebook";
        const smsBody = buildCustomerSms(smsChannel);
        try {
          const r = await sendNcpSens(env2, {
            to: prettyPhone,
            subject: CUSTOMER_SMS_SUBJECT,
            content: smsBody
          });
          const status = r.ok ? "sent" : r.skipped ? "skipped" : "failed";
          lmsStep = r.ok ? "ok" : r.skipped ? "skip" : "fail";
          const detail2 = r.ok ? `meta-lead status=${r.status || ""}` : r.skipped ? `meta-lead reason=${r.reason || ""}` : `meta-lead status=${r.status || ""} body=${(r.body || "").slice(0, 160)}`;
          await services.smsLogs.create({
            EstimateId: recordId,
            TemplateId: "",
            ToPhone: String(prettyPhone || "").replace(/\D/g, ""),
            Subject: CUSTOMER_SMS_SUBJECT,
            Content: smsBody,
            SmsType: r.type || "LMS",
            Status: status,
            Detail: detail2.slice(0, 480),
            SentAt: (/* @__PURE__ */ new Date()).toISOString(),
            SentBy: "system:meta-lead"
          }).catch(() => {
          });
          if (!r.ok && !r.skipped) {
            await notifyTelegram(
              env2,
              `[day1design/meta-lead] LMS \uBC1C\uC1A1 \uC2E4\uD328
${escapeHtml(prettyPhone)}
${detail2.slice(0, 200)}`
            );
          }
        } catch (e) {
          lmsStep = "fail";
          await notifyTelegram(
            env2,
            `[day1design/meta-lead] LMS \uD638\uCD9C \uC608\uC678
${escapeHtml((e?.message || "").slice(0, 200))}`
          );
        }
        let emailStep = "ok";
        try {
          await notifyEmail(env2, {
            subject: "[DAYONE] \uC0C8 \uC0C1\uB2F4\uC2E0\uCCAD (Meta)",
            text: [
              `\uC774\uB984: ${name}`,
              `\uC5F0\uB77D\uCC98: ${prettyPhone}`,
              location && `\uC9C0\uC5ED: ${location}`,
              spaceType && `\uACF5\uAC04\uC720\uD615: ${spaceType}`,
              area && `\uBA74\uC801: ${area}`,
              scheduledDate && `\uC2DC\uACF5\uC608\uC815\uC77C: ${scheduledDate}`,
              budget && `\uAC00\uC6A9\uC608\uC0B0: ${budget}`,
              `\uCD9C\uCC98: Meta / ${platform2}${campaign ? ` / ${campaign}` : ""}`
            ].filter(Boolean).join("\n"),
            html: internalEstimateEmailHtml(env2, {
              fields: {
                name,
                phone: prettyPhone,
                address: location,
                address_detail: "",
                branch: "",
                space_type: spaceType,
                space_size: area,
                schedule: scheduledDate,
                budget,
                detail
              },
              attribution: { platform: platform2, campaign },
              conceptCount: 0,
              planCount: 0,
              submittedAt: timestamp || (/* @__PURE__ */ new Date()).toISOString()
            })
          });
        } catch {
          emailStep = "fail";
        }
        let sheetStep = "skip";
        try {
          const r = await appendLeadToSheet(env2, {
            submittedAt: timestamp,
            name,
            phone: prettyPhone,
            email: lead.email,
            source: "meta",
            platform: platform2,
            campaign,
            address: location,
            spaceType,
            spaceSize: area,
            schedule: scheduledDate,
            budget,
            branch: "",
            detail,
            status: "\uC811\uC218\uB300\uAE30",
            id: recordId
          });
          sheetStep = r?.skipped ? "skip" : "ok";
        } catch (e) {
          sheetStep = "fail";
          await notifyTelegram(
            env2,
            `[day1design/meta-lead] \uAD6C\uAE00\uC2DC\uD2B8 \uAE30\uB85D \uC2E4\uD328
\uC774\uB984: ${escapeHtml(name)}
\uC0AC\uC720: ${escapeHtml((e?.message || "").slice(0, 200))}`
          );
        }
        await logIntakeEvent(services, {
          channel: smsChannel,
          source: "meta",
          branch: "\uC9C0\uC810 \uBB34\uAD00",
          name,
          phone: prettyPhone,
          geo: "",
          estimateId: recordId,
          steps: {
            d1: "ok",
            telegram: "ok",
            lms: lmsStep,
            capi: capiStep,
            email: emailStep,
            sheet: sheetStep
          }
        });
      } else if (saveError) {
        await notifyTelegram(
          env2,
          `<b>[day1design/meta-lead]</b> \u26A0 <b>D1 \uC800\uC7A5 \uC2E4\uD328</b>
\u251C \uC774\uB984: ${escapeHtml(name)}
\u251C \uC804\uD654: ${escapeHtml(prettyPhone)}
\u2514 \uC5D0\uB7EC: ${escapeHtml(saveError.slice(0, 200))}`
        );
      }
    })()
  );
  if (!recordId) {
    return json({ ok: false, error: "D1 save failed" }, { status: 502 });
  }
  return jsonOk({ id: recordId, source: "meta" });
}
__name(handleMetaLead, "handleMetaLead");
async function handleMetaLeadHeartbeat(request, env2, ctx, services = createServices(env2)) {
  if (!env2.META_LEAD_SECRET) return jsonError(500, "Server misconfigured");
  const provided = request.headers.get("x-meta-lead-secret") || "";
  if (!timingSafeEqual2(provided, env2.META_LEAD_SECRET)) {
    return jsonError(403, "Forbidden");
  }
  let body = {};
  try {
    body = JSON.parse(await request.text() || "{}");
  } catch {
    return jsonError(400, "Bad Request");
  }
  const status = body.status === "fail" ? "fail" : "ok";
  const source = String(body.source || "meta-lead-poller").trim().slice(0, 40);
  const detail = String(body.detail || "").trim().slice(0, 300);
  const at = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await services.systemHeartbeats.create({
      Source: source,
      At: at,
      Status: status,
      Detail: detail
    });
  } catch (e) {
    return json(
      { ok: false, error: (e?.message || "insert failed").slice(0, 120) },
      { status: 502 }
    );
  }
  ctx.waitUntil(
    (async () => {
      try {
        await env2.DB.prepare(
          "DELETE FROM SystemHeartbeats WHERE Source = ? AND At < ?"
        ).bind(source, new Date(Date.now() - 7 * 864e5).toISOString()).run();
      } catch {
      }
      if (status === "fail") {
        await notifyInfra(
          env2,
          `<b>[day1design/${escapeHtml(source)}]</b> \u{1F534} <b>\uB9AC\uB4DC \uD3F4\uB7EC \uC2E4\uD328</b>
\u2514 ${escapeHtml(detail || "\uC0AC\uC720 \uBBF8\uAE30\uC7AC")}`
        );
      }
    })()
  );
  return jsonOk({ at, status });
}
__name(handleMetaLeadHeartbeat, "handleMetaLeadHeartbeat");
async function handleMetaFormSchema(request, env2, ctx, services = createServices(env2)) {
  if (!env2.META_LEAD_SECRET) return jsonError(500, "Server misconfigured");
  const provided = request.headers.get("x-meta-lead-secret") || "";
  if (!timingSafeEqual2(provided, env2.META_LEAD_SECRET)) {
    return jsonError(403, "Forbidden");
  }
  let body = {};
  try {
    body = JSON.parse(await request.text() || "{}");
  } catch {
    return jsonError(400, "Bad Request");
  }
  const formId = String(body.formId || "").trim().slice(0, 64);
  if (!formId) return jsonError(400, "formId required");
  const formName = String(body.formName || "").trim().slice(0, 120);
  const questions = (Array.isArray(body.questions) ? body.questions : []).map(
    (q2) => String(q2 ?? "").trim().slice(0, 200)
  ).filter(Boolean).slice(0, 60);
  if (!questions.length) return jsonError(400, "questions required");
  const mapping = {};
  for (const q2 of questions) mapping[q2] = matchStandardField(q2);
  let prevRecord = null;
  try {
    const rows = await services.metaFormSchemas.list({
      where: { FormId: formId },
      limit: 1
    });
    prevRecord = rows?.records?.[0] || null;
  } catch {
  }
  let prevQuestions = [];
  if (prevRecord) {
    try {
      const parsed = JSON.parse(prevRecord.fields?.Questions || "[]");
      if (Array.isArray(parsed)) prevQuestions = parsed.map((q2) => String(q2));
    } catch {
    }
  }
  const added = questions.filter((q2) => !prevQuestions.includes(q2));
  const removed = prevQuestions.filter((q2) => !questions.includes(q2));
  const changed = added.length > 0 || removed.length > 0;
  const first2 = !prevRecord;
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const critical = ["name", "phone"].filter((f) => !mapped.has(f));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const snapshot = {
    FormId: formId,
    FormName: formName,
    Questions: JSON.stringify(questions),
    Mapping: JSON.stringify(mapping),
    UpdatedAt: now
  };
  try {
    if (prevRecord) {
      if (changed)
        await services.metaFormSchemas.update(prevRecord.id, snapshot);
    } else {
      await services.metaFormSchemas.create(snapshot);
    }
  } catch (e) {
    return json(
      { ok: false, error: (e?.message || "snapshot failed").slice(0, 120) },
      { status: 502 }
    );
  }
  const shouldNotify = first2 ? critical.length > 0 : changed;
  if (!shouldNotify) {
    return jsonOk({
      changed: false,
      first: first2,
      formId,
      questions: questions.length
    });
  }
  const unmapped = questions.filter((q2) => !mapping[q2]);
  const lines = [
    `<b>[day1design/meta-lead]</b> \u{1F4DD} <b>\uC785\uB825\uD3FC \uC9C8\uBB38 ${first2 ? "\uD655\uC778" : "\uBCC0\uACBD \uAC10\uC9C0"}</b>`,
    `\u251C \uD3FC: ${escapeHtml(formName || "-")} (${escapeHtml(formId)})`
  ];
  if (added.length) {
    lines.push(`\u251C \uCD94\uAC00: ${escapeHtml(added.join(" / ").slice(0, 300))}`);
  }
  if (removed.length) {
    lines.push(`\u251C \uC0AD\uC81C: ${escapeHtml(removed.join(" / ").slice(0, 300))}`);
  }
  if (unmapped.length) {
    lines.push(
      `\u251C \uC694\uC57D\uD544\uB4DC \uBBF8\uB9E4\uD551: ${escapeHtml(unmapped.join(" / ").slice(0, 300))}`,
      `\u251C \u2192 \uC0C1\uB2F4\uCE74\uB4DC '\uD3FC \uC751\uB2F5'\uACFC \uC54C\uB9BC\uC5D0 \uC9C8\uBB38\xB7\uB2F5\uBCC0 \uC6D0\uBB38\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4`
    );
  }
  lines.push(
    critical.length ? `\u2514 \u{1F534} ${critical.join("\xB7")} \uC9C8\uBB38\uC744 \uBABB \uCC3E\uC558\uC2B5\uB2C8\uB2E4 \u2014 \uC774 \uD3FC \uB9AC\uB4DC\uB294 \uC804\uB7C9 '\uC624\uB958' \uCE74\uB4DC\uB85C \uC800\uC7A5\uB429\uB2C8\uB2E4. \uB9E4\uD551 \uADDC\uCE59 \uD655\uC778 \uD544\uC694` : `\u2514 \u2705 \uC774\uB984\xB7\uC5F0\uB77D\uCC98 \uB9E4\uD551 \uC815\uC0C1 \u2014 \uBCC4\uB3C4 \uC870\uCE58 \uC5C6\uC774 \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4`
  );
  ctx.waitUntil(
    Promise.resolve(notifyInfra(env2, lines.join("\n"))).catch(() => {
    })
  );
  return jsonOk({
    changed,
    first: first2,
    formId,
    added: added.length,
    removed: removed.length,
    unmapped: unmapped.length,
    critical
  });
}
__name(handleMetaFormSchema, "handleMetaFormSchema");

// src/lib/analytics-rollups.js
var KST_OFFSET_MS2 = 9 * 60 * 60 * 1e3;
var MAX_BOUND_PARAMETERS = 100;
function chunkRows(rows, columnsPerRow) {
  const size = Math.max(1, Math.floor(MAX_BOUND_PARAMETERS / columnsPerRow));
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}
__name(chunkRows, "chunkRows");
function kstKeysFromIso(iso2) {
  const time3 = Date.parse(String(iso2 || ""));
  if (!Number.isFinite(time3)) throw new Error("analytics_invalid_event_time");
  const shifted = new Date(time3 + KST_OFFSET_MS2);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const dayKey2 = `${year}-${month}-${day}`;
  return { dayKey: dayKey2, hourKey: `${dayKey2}T${hour}` };
}
__name(kstKeysFromIso, "kstKeysFromIso");
function kstRangeToUtc(startDate, endDate) {
  const startMs = Date.parse(`${startDate}T00:00:00+09:00`);
  const endMs = Date.parse(`${endDate}T00:00:00+09:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("analytics_invalid_range");
  }
  return {
    startUtc: new Date(startMs).toISOString(),
    endExclusiveUtc: new Date(endMs + 24 * 60 * 60 * 1e3).toISOString()
  };
}
__name(kstRangeToUtc, "kstRangeToUtc");
function buildAnalyticsRollupStatements(env2, events) {
  if (!env2?.DB || !Array.isArray(events)) return [];
  const validEvents = events.filter((event) => !event.isBot && event.sessionId).map((event) => ({ ...event, ...kstKeysFromIso(event.createdAt) }));
  if (!validEvents.length) return [];
  const statements = [];
  for (const rows of chunkRows(validEvents, 14)) {
    const values = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const args = rows.flatMap((event) => [
      event.id,
      event.sessionId,
      event.createdAt,
      event.dayKey,
      event.type,
      event.page,
      event.device,
      event.country,
      event.region,
      event.city,
      event.referrer,
      event.utmSource,
      event.utmMedium,
      event.utmCampaign
    ]);
    statements.push(
      env2.DB.prepare(
        `INSERT OR IGNORE INTO AnalyticsEvents (
           id, SessionId, CreatedAt, DayKey, EventType, Page, Device,
           Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
         ) VALUES ${values}`
      ).bind(...args)
    );
  }
  const pageviews = validEvents.filter((event) => event.type === "page_view");
  if (pageviews.length) {
    for (const rows of chunkRows(pageviews, 14)) {
      const values = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const args = rows.flatMap((event) => [
        event.id,
        event.sessionId,
        event.createdAt,
        event.dayKey,
        event.hourKey,
        event.page,
        event.device,
        event.country,
        event.region,
        event.city,
        event.referrer,
        event.utmSource,
        event.utmMedium,
        event.utmCampaign
      ]);
      statements.push(
        env2.DB.prepare(
          `INSERT OR IGNORE INTO AnalyticsPageViews (
             id, SessionId, CreatedAt, DayKey, HourKey, Page, Device,
             Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
           ) VALUES ${values}`
        ).bind(...args)
      );
    }
  }
  const affectedSessionDays = Array.from(
    new Map(
      validEvents.map((event) => [
        `${event.dayKey}\0${event.sessionId}`,
        [event.dayKey, event.sessionId]
      ])
    ).values()
  );
  const affectedSessionDayValues = affectedSessionDays.map(() => "(?, ?)").join(", ");
  statements.push(
    env2.DB.prepare(
      `WITH affected(DayKey, SessionId) AS (
         VALUES ${affectedSessionDayValues}
       ),
       rebuilt AS (
         SELECT
           events.DayKey,
           events.SessionId,
           MIN(events.CreatedAt) AS FirstSeenAt,
           MAX(events.CreatedAt) AS LastSeenAt,
           SUM(CASE WHEN events.EventType = 'page_view' THEN 1 ELSE 0 END) AS Pageviews,
           COUNT(*) AS EventCount,
           MAX(CASE WHEN events.Device != '' THEN events.Device ELSE '' END) AS Device,
           MAX(CASE WHEN events.Country != '' THEN events.Country ELSE '' END) AS Country,
           MAX(CASE WHEN events.Region != '' THEN events.Region ELSE '' END) AS Region,
           MAX(CASE WHEN events.City != '' THEN events.City ELSE '' END) AS City,
           MAX(CASE WHEN events.Referrer != '' THEN events.Referrer ELSE '' END) AS Referrer,
           MAX(CASE WHEN events.UtmSource != '' THEN events.UtmSource ELSE '' END) AS UtmSource,
           MAX(CASE WHEN events.UtmMedium != '' THEN events.UtmMedium ELSE '' END) AS UtmMedium,
           MAX(CASE WHEN events.UtmCampaign != '' THEN events.UtmCampaign ELSE '' END) AS UtmCampaign
         FROM AnalyticsEvents events
         JOIN affected
           ON affected.DayKey = events.DayKey
          AND affected.SessionId = events.SessionId
         GROUP BY events.DayKey, events.SessionId
       )
       INSERT INTO AnalyticsSessionDays (
         DayKey, SessionId, FirstSeenAt, LastSeenAt, Pageviews, EventCount,
         Device, Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
       )
       SELECT
         DayKey, SessionId, FirstSeenAt, LastSeenAt, Pageviews, EventCount,
         Device, Country, Region, City, Referrer, UtmSource, UtmMedium, UtmCampaign
       FROM rebuilt
       WHERE true
       ON CONFLICT(DayKey, SessionId) DO UPDATE SET
         FirstSeenAt = excluded.FirstSeenAt,
         LastSeenAt = excluded.LastSeenAt,
         Pageviews = excluded.Pageviews,
         EventCount = excluded.EventCount,
         Device = excluded.Device,
         Country = excluded.Country,
         Region = excluded.Region,
         City = excluded.City,
         Referrer = excluded.Referrer,
         UtmSource = excluded.UtmSource,
         UtmMedium = excluded.UtmMedium,
         UtmCampaign = excluded.UtmCampaign`
    ).bind(...affectedSessionDays.flat())
  );
  const affectedSessions = Array.from(
    new Set(validEvents.map((event) => event.sessionId))
  );
  const affectedSessionValues = affectedSessions.map(() => "(?)").join(", ");
  statements.push(
    env2.DB.prepare(
      `WITH affected(SessionId) AS (
         VALUES ${affectedSessionValues}
       ),
       rebuilt AS (
         SELECT
           session_days.SessionId,
           MIN(session_days.FirstSeenAt) AS FirstSeenAt,
           MAX(session_days.LastSeenAt) AS LastSeenAt,
           MIN(CASE WHEN session_days.Pageviews > 0 THEN session_days.DayKey END) AS FirstDayKey,
           MAX(CASE WHEN session_days.Pageviews > 0 THEN session_days.DayKey END) AS LastDayKey,
           SUM(CASE WHEN session_days.Pageviews > 0 THEN 1 ELSE 0 END) AS ActiveDayCount,
           SUM(session_days.Pageviews) AS TotalPageviews
         FROM AnalyticsSessionDays session_days
         JOIN affected USING (SessionId)
         GROUP BY session_days.SessionId
         HAVING SUM(session_days.Pageviews) > 0
       )
       INSERT INTO AnalyticsSessions (
         SessionId, FirstSeenAt, LastSeenAt, FirstDayKey, LastDayKey,
         ActiveDayCount, TotalPageviews
       )
       SELECT
         SessionId, FirstSeenAt, LastSeenAt, FirstDayKey, LastDayKey,
         ActiveDayCount, TotalPageviews
       FROM rebuilt
       WHERE true
       ON CONFLICT(SessionId) DO UPDATE SET
         FirstSeenAt = excluded.FirstSeenAt,
         LastSeenAt = excluded.LastSeenAt,
         FirstDayKey = excluded.FirstDayKey,
         LastDayKey = excluded.LastDayKey,
         ActiveDayCount = excluded.ActiveDayCount,
         TotalPageviews = excluded.TotalPageviews`
    ).bind(...affectedSessions)
  );
  return statements;
}
__name(buildAnalyticsRollupStatements, "buildAnalyticsRollupStatements");

// src/lib/crm-traffic-summary.js
var ALLOWED_TENANT = "day1design";
var GA4_SOURCE_KIND = "ga4";
var MAX_LEGACY_PAYLOAD_BYTES = 512 * 1024;
async function queryRun(statement, ...bindings) {
  if (typeof statement.run === "function" && typeof statement.first !== "function") return statement.run(...bindings);
  if (typeof statement.bind === "function") statement = statement.bind(...bindings);
  if (typeof statement.run === "function") return statement.run();
  throw new Error("traffic_query_run_unsupported");
}
__name(queryRun, "queryRun");
function validPropertyId(value) {
  return /^\d{4,20}$/.test(String(value || ""));
}
__name(validPropertyId, "validPropertyId");
async function persistCrmGa4Snapshot(db, { tenantId, propertyId, startDate, endDate, summary, createdAt = (/* @__PURE__ */ new Date()).toISOString(), id: id2 = "" } = {}) {
  if (String(tenantId) !== ALLOWED_TENANT) throw new Error("ga4_snapshot_tenant_not_authorized");
  if (!validPropertyId(propertyId)) throw new Error("ga4_snapshot_property_invalid");
  dateRange(startDate, endDate);
  if (!summary || typeof summary !== "object") throw new Error("ga4_snapshot_summary_required");
  const payload = JSON.stringify({ tenant_id: ALLOWED_TENANT, source_kind: GA4_SOURCE_KIND, source_id: String(propertyId), summary });
  const recordId = String(id2 || `${ALLOWED_TENANT}:${propertyId}:${startDate}:${endDate}:${createdAt}`);
  await queryRun(db.prepare(`
    INSERT INTO CrmGa4AnalyticsSnapshots(id,tenant_id,source_kind,source_id,start_date,end_date,payload_json,created_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(tenant_id,source_kind,source_id,start_date,end_date) DO UPDATE SET payload_json=excluded.payload_json,created_at=excluded.created_at
  `), recordId, ALLOWED_TENANT, GA4_SOURCE_KIND, String(propertyId), startDate, endDate, payload, createdAt);
  return { id: recordId, tenant_id: ALLOWED_TENANT, source_kind: GA4_SOURCE_KIND, source_id: String(propertyId), startDate, endDate, createdAt };
}
__name(persistCrmGa4Snapshot, "persistCrmGa4Snapshot");
var CRM_TRAFFIC_SUMMARY_CONTRACT = Object.freeze({
  tenant: ALLOWED_TENANT,
  source: "tenant/date-indexed HeatmapEvents",
  ga4Fields: "null_until_authorized_snapshot",
  visitorHistory: "null_until_tenant_scoped_history_mapping"
});

// src/routes/analytics.js
var SOURCE = "google";
var SELF_SOURCE = "self";
async function persistCrmGa4Binding(env2, range, payload) {
  if (!env2?.DB || !env2.GA4_PROPERTY_ID || !payload?.summary) return null;
  try {
    return await persistCrmGa4Snapshot(env2.DB, {
      tenantId: "day1design",
      propertyId: env2.GA4_PROPERTY_ID,
      startDate: range.startDate,
      endDate: range.endDate,
      summary: payload.summary
    });
  } catch {
    return null;
  }
}
__name(persistCrmGa4Binding, "persistCrmGa4Binding");
var SELF_CACHE_VERSION = "v6";
var SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1e3;
var EXTERNAL_FETCH_TIMEOUT_MS = 4500;
var DEFAULT_SITE_URL = "https://day1design.co.kr/";
var VISIT_TRACK_RATE_LIMIT_PER_HOUR = 240;
var VISITOR_LOCATION_LIMIT = 5;
var VISITOR_DETAIL_MONTH_LIMIT = 36;
var VISITOR_DETAIL_DAY_LIMIT = 370;
var VISITOR_DETAIL_EVENT_LIMIT = 80;
var KST_OFFSET_MS3 = 9 * 60 * 60 * 1e3;
var SOURCE_CHANNELS = {
  instagram_ad: "[AD]IG",
  instagram_official: "IG\uC624\uD53C\uC15C",
  instagram_mkt: "IG\uB9C8\uCF00\uD305",
  instagram: "IG",
  facebook_ad: "[AD]FB",
  facebook: "FB",
  threads: "Threads",
  meta_ad: "[AD]Meta",
  meta: "Meta",
  google: "Google",
  naver: "Naver",
  youtube: "YouTube",
  kakao: "Kakao",
  ai: "AI \uAC80\uC0C9",
  search: "\uAC80\uC0C9(\uAE30\uD0C0)",
  community: "\uCEE4\uBBA4\uB2C8\uD2F0",
  recruit: "\uCC44\uC6A9\uC0AC\uC774\uD2B8",
  social: "Social",
  internal: "\uB0B4\uBD80\xB7\uD14C\uC2A4\uD2B8",
  referral: "\uC678\uBD80\uC720\uC785",
  direct: "Direct",
  other: "Other"
};
async function handleAnalytics(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/analytics/, "") || "/";
  if (path === "/visit") {
    if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
    return trackVisitor(request, env2, ctx, services);
  }
  if (path === "/visitor-locations" && request.method === "GET") {
    if (!await verifyAdmin(request, env2)) {
      return jsonError(401, "Unauthorized");
    }
    return getVisitorLocations(request, env2);
  }
  if (path === "/visitor-locations/detail" && request.method === "GET") {
    if (!await verifyAdmin(request, env2)) {
      return jsonError(401, "Unauthorized");
    }
    return getVisitorLocationDetail(request, env2);
  }
  if (path === "/summary" && request.method === "GET") {
    if (!await verifyAdmin(request, env2)) {
      return jsonError(401, "Unauthorized");
    }
    return getSummary(request, env2, services, ctx);
  }
  if (path === "/target" && (request.method === "GET" || request.method === "PUT")) {
    if (!await verifyAdmin(request, env2)) {
      return jsonError(401, "Unauthorized");
    }
    return handleTarget(request, services);
  }
  if (path === "/funnel" && request.method === "GET") {
    if (!await verifyAdmin(request, env2)) {
      return jsonError(401, "Unauthorized");
    }
    return getFunnel(request, env2);
  }
  if (path === "/search-keywords" && request.method === "GET") {
    if (!await verifyAdmin(request, env2)) {
      return jsonError(401, "Unauthorized");
    }
    return getSearchKeywords(request, env2);
  }
  return jsonError(404, "Not Found");
}
__name(handleAnalytics, "handleAnalytics");
var SEARCH_QUERY_KEYS = ["query", "q", "search_query", "keyword", "wd"];
function parseSearchKeyword(refPath) {
  const raw = String(refPath || "");
  const qs = raw.indexOf("?");
  if (qs < 0) return "";
  let params;
  try {
    params = new URLSearchParams(raw.slice(qs + 1));
  } catch {
    return "";
  }
  for (const key of SEARCH_QUERY_KEYS) {
    const value = (params.get(key) || "").trim();
    if (value) return value.replace(/[\r\n\t]+/g, " ").slice(0, 80);
  }
  return "";
}
__name(parseSearchKeyword, "parseSearchKeyword");
function keywordEngine(host) {
  const h = String(host || "").toLowerCase();
  if (h.includes("naver")) return "naver";
  if (h.includes("google")) return "google";
  if (h.includes("daum") || h.includes("kakao")) return "daum";
  if (h.includes("bing")) return "bing";
  return "other";
}
__name(keywordEngine, "keywordEngine");
async function getSearchKeywords(request, env2) {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1),
    365
  );
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const visitRows = await env2.DB.prepare(
    `SELECT Referrer, RefPath, COUNT(*) AS n
       FROM HeatmapEvents
      WHERE EventType = 'page_view'
        AND IsBot = 0
        AND RefPath LIKE '%?%'
        AND CreatedAt >= ?
      GROUP BY Referrer, RefPath`
  ).bind(since).all().catch(() => ({ results: [] }));
  const leadRows = await env2.DB.prepare(
    `SELECT FirstReferrer, FirstRefPath, COUNT(*) AS n
       FROM Estimates
      WHERE FirstRefPath LIKE '%?%'
        AND SubmittedAt >= ?
      GROUP BY FirstReferrer, FirstRefPath`
  ).bind(since).all().catch(() => ({ results: [] }));
  const map = /* @__PURE__ */ new Map();
  const add = /* @__PURE__ */ __name((host, refPath, count3, field) => {
    const keyword = parseSearchKeyword(refPath);
    if (!keyword) return;
    const engine = keywordEngine(host);
    const mapKey = `${engine}\0${keyword}`;
    const entry = map.get(mapKey) || { keyword, engine, visits: 0, leads: 0 };
    entry[field] += Number(count3) || 0;
    map.set(mapKey, entry);
  }, "add");
  for (const row of visitRows?.results || []) {
    add(row.Referrer, row.RefPath, row.n, "visits");
  }
  for (const row of leadRows?.results || []) {
    add(row.FirstReferrer, row.FirstRefPath, row.n, "leads");
  }
  const keywords = [...map.values()].sort((a, b) => b.visits - a.visits || b.leads - a.leads).slice(0, 50);
  return jsonOk({
    days,
    since,
    // 어드민은 total 이 0 이면 카드를 그리지 않는다 (빈 표 방지)
    total: keywords.length,
    keywords
  });
}
__name(getSearchKeywords, "getSearchKeywords");
async function getFunnel(request, env2) {
  const range = resolveRange(new URL(request.url));
  const startDate = range.startDate;
  const endDate = range.endDate;
  const result = {
    range,
    firstPages: [],
    secondPages: [],
    touches: 0,
    submissions: 0,
    conversionRate: 0
  };
  try {
    const stage1 = await env2.DB.prepare(
      `WITH first_event AS (
         SELECT SessionId, Page,
                ROW_NUMBER() OVER (
                  PARTITION BY SessionId
                  ORDER BY CreatedAt ASC, id ASC
                ) AS rn
         FROM AnalyticsPageViews
         WHERE DayKey BETWEEN ? AND ?
       )
       SELECT Page, COUNT(*) AS Cnt
       FROM first_event
       WHERE rn = 1
       GROUP BY Page
       ORDER BY Cnt DESC
       LIMIT 5`
    ).bind(startDate, endDate).all();
    const stage2 = await env2.DB.prepare(
      `WITH ordered AS (
         SELECT SessionId, Page,
                ROW_NUMBER() OVER (
                  PARTITION BY SessionId
                  ORDER BY CreatedAt ASC, id ASC
                ) AS rn
         FROM AnalyticsPageViews
         WHERE DayKey BETWEEN ? AND ?
       )
       SELECT Page, COUNT(*) AS Cnt
       FROM ordered
       WHERE rn = 2
       GROUP BY Page
       ORDER BY Cnt DESC
       LIMIT 5`
    ).bind(startDate, endDate).all();
    const touchesRow = await env2.DB.prepare(
      `SELECT COUNT(DISTINCT SessionId) AS Cnt
       FROM AnalyticsSessionDays
       WHERE DayKey BETWEEN ? AND ?
         AND Pageviews > 0`
    ).bind(startDate, endDate).first();
    const { startUtc, endExclusiveUtc } = kstRangeToUtc(startDate, endDate);
    const subsRow = await env2.DB.prepare(
      `SELECT COUNT(*) AS Cnt FROM Estimates
       WHERE SubmittedAt >= ?
         AND SubmittedAt < ?`
    ).bind(startUtc, endExclusiveUtc).first();
    const touches = Number(touchesRow?.Cnt || 0);
    const submissions = Number(subsRow?.Cnt || 0);
    const total1 = (stage1.results || []).reduce(
      (a, b) => a + Number(b.Cnt || 0),
      0
    );
    const total2 = (stage2.results || []).reduce(
      (a, b) => a + Number(b.Cnt || 0),
      0
    );
    result.firstPages = (stage1.results || []).map((r) => ({
      page: String(r.Page || "/"),
      count: Number(r.Cnt || 0),
      pct: total1 > 0 ? Number(r.Cnt || 0) / total1 : 0
    }));
    result.secondPages = (stage2.results || []).map((r) => ({
      page: String(r.Page || "/"),
      count: Number(r.Cnt || 0),
      pct: total2 > 0 ? Number(r.Cnt || 0) / total2 : 0
    }));
    result.touches = touches;
    result.submissions = submissions;
    result.conversionRate = touches > 0 ? submissions / touches : 0;
  } catch (e) {
  }
  return jsonOk(result);
}
__name(getFunnel, "getFunnel");
async function handleTarget(request, services) {
  if (!services.adminSettings) return jsonError(500, "Settings unavailable");
  if (request.method === "GET") {
    const url = new URL(request.url);
    const raw = url.searchParams.get("month") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const monthKey2 = normalizeMonthKey(raw);
    if (!monthKey2) return jsonError(400, "Invalid month");
    return jsonOk(await readTargetSetting(services, monthKey2));
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const monthKey = normalizeMonthKey(body?.monthKey || body?.month);
  if (!monthKey) return jsonError(400, "Invalid month");
  const manual = Boolean(body?.manual);
  const rawValue = Number(body?.value || 0);
  const value = Math.max(0, Math.min(1e5, Math.round(rawValue)));
  const payload = {
    monthKey,
    manual,
    value,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const id2 = targetSettingId(monthKey);
  const fields = {
    Value: JSON.stringify(payload),
    UpdatedAt: payload.updatedAt
  };
  try {
    await services.adminSettings.update(id2, fields);
  } catch (e) {
    if (!e?.notFound) throw e;
    await services.adminSettings.create({ __id: id2, ...fields });
  }
  return jsonOk(payload);
}
__name(handleTarget, "handleTarget");
async function readTargetSetting(services, monthKey) {
  try {
    const record = await services.adminSettings.get(targetSettingId(monthKey));
    const value = JSON.parse(record.fields?.Value || "{}");
    return {
      monthKey,
      manual: Boolean(value.manual),
      value: Math.max(0, Math.round(Number(value.value || 0))),
      updatedAt: value.updatedAt || record.fields?.UpdatedAt || null
    };
  } catch (e) {
    if (!e?.notFound) throw e;
    return { monthKey, manual: false, value: 0, updatedAt: null };
  }
}
__name(readTargetSetting, "readTargetSetting");
function targetSettingId(monthKey) {
  return `analytics-target:${monthKey}`;
}
__name(targetSettingId, "targetSettingId");
function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : "";
}
__name(normalizeMonthKey, "normalizeMonthKey");
async function trackVisitor(request, env2, ctx, services) {
  if (!validateContentType(request, "application/json")) {
    return jsonError(415, "Unsupported Media Type");
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const ip = primaryIp(clientIP(request));
  const limit = await visitorTrackLimit(ip);
  if (!limit.allowed) {
    return jsonOk({ tracked: false, limited: true });
  }
  try {
    const event = await buildVisitorEvent(request, env2, body, ip);
    if (isSkippableVisitPath(event.path)) {
      return jsonOk({ tracked: false, skipped: true });
    }
    const stored = await writeVisitorD1(env2, event);
    if (stored) archiveVisitorEvent(ctx, services, event);
    return jsonOk({ tracked: Boolean(stored) });
  } catch (e) {
    console.warn("[analytics/visit] tracking skipped:", e?.message || e);
    return jsonOk({ tracked: false });
  }
}
__name(trackVisitor, "trackVisitor");
async function visitorTrackLimit(ip) {
  try {
    return await rateLimit(
      `analytics-visit:${ip || "unknown"}`,
      VISIT_TRACK_RATE_LIMIT_PER_HOUR
    );
  } catch {
    return { allowed: true, count: 0 };
  }
}
__name(visitorTrackLimit, "visitorTrackLimit");
async function buildVisitorEvent(request, env2, body, ip) {
  const now = /* @__PURE__ */ new Date();
  const { dayKey: eventDayKey, hourKey } = kstKeys(now);
  const cf = request.cf || {};
  const country = cleanGeo(cf.country || request.headers.get("cf-ipcountry"));
  const region = cleanGeo(cf.region || cf.regionCode);
  const city = cleanGeo(cf.city);
  const timezone = cleanGeo(cf.timezone) || "Asia/Seoul";
  const locationKey = [country, region, city].map((value) => value.toLowerCase()).filter(Boolean).join("|") || "unknown";
  const path = safeText(body?.path || "/", 240);
  const rawR2Key = `analytics/ip-checks/${eventDayKey}/${hourKey.slice(11)}-${Date.now()}-${randomId(10)}.json`;
  const salt = env2.IP_HASH_SALT || env2.JWT_SECRET || "";
  return {
    id: `vst${Date.now().toString(36)}${randomId(10)}`,
    eventAt: now.toISOString(),
    dayKey: eventDayKey,
    hourKey,
    ipHash: await hashText(`${salt}:${ip}`),
    ipPrefix: maskIp(ip),
    country,
    region,
    city,
    timezone,
    latitude: cleanGeo(cf.latitude),
    longitude: cleanGeo(cf.longitude),
    locationKey,
    path,
    referrerHost: referrerHost(body?.referrer || ""),
    userAgentHash: await hashText(request.headers.get("user-agent") || ""),
    rawR2Key,
    createdAt: now.toISOString()
  };
}
__name(buildVisitorEvent, "buildVisitorEvent");
function primaryIp(value) {
  return String(value || "").split(",")[0].trim().slice(0, 80);
}
__name(primaryIp, "primaryIp");
function cleanGeo(value) {
  return safeText(value, 80);
}
__name(cleanGeo, "cleanGeo");
function safeText(value, max = 120) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ").slice(0, max);
}
__name(safeText, "safeText");
function referrerHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return safeText(new URL(raw).hostname, 120);
  } catch {
    return "";
  }
}
__name(referrerHost, "referrerHost");
function isSkippableVisitPath(path) {
  const p = String(path || "").toLowerCase();
  return p.startsWith("/admin") || p.startsWith("/api") || /\.(css|js|png|jpe?g|webp|gif|svg|ico|woff2?)$/.test(p);
}
__name(isSkippableVisitPath, "isSkippableVisitPath");
function kstKeys(date) {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS3);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  return { dayKey: day, hourKey: `${day}T${h}` };
}
__name(kstKeys, "kstKeys");
async function hashText(value) {
  const input = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(hashText, "hashText");
function maskIp(ip) {
  const text = primaryIp(ip);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (text.includes(":")) {
    const parts = text.split(":").filter(Boolean).slice(0, 4);
    return parts.length ? `${parts.join(":")}::/64` : "";
  }
  return "";
}
__name(maskIp, "maskIp");
async function writeVisitorD1(env2, event) {
  if (!env2.DB) return false;
  const existing = await env2.DB.prepare(
    `SELECT 1 FROM VisitorLocationIpHourly
       WHERE HourKey = ? AND LocationKey = ? AND IpHash = ?
       LIMIT 1`
  ).bind(event.hourKey, event.locationKey, event.ipHash).first();
  const uniqueDelta = existing ? 0 : 1;
  await env2.DB.prepare(
    `INSERT INTO VisitorIpEvents (
        id, EventAt, DayKey, HourKey, IpHash, IpPrefix, Country, Region, City,
        Timezone, Latitude, Longitude, LocationKey, Path, ReferrerHost,
        UserAgentHash, RawR2Key, CreatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.id,
    event.eventAt,
    event.dayKey,
    event.hourKey,
    event.ipHash,
    event.ipPrefix,
    event.country,
    event.region,
    event.city,
    event.timezone,
    event.latitude,
    event.longitude,
    event.locationKey,
    event.path,
    event.referrerHost,
    event.userAgentHash,
    event.rawR2Key,
    event.createdAt
  ).run();
  if (!existing) {
    await env2.DB.prepare(
      `INSERT INTO VisitorLocationIpHourly
          (HourKey, LocationKey, IpHash, SeenAt)
         VALUES (?, ?, ?, ?)`
    ).bind(event.hourKey, event.locationKey, event.ipHash, event.createdAt).run();
  }
  await env2.DB.prepare(
    `INSERT INTO VisitorLocationHourly (
        HourKey, LocationKey, DayKey, Country, Region, City, Timezone,
        Visits, UniqueIps, UpdatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(HourKey, LocationKey) DO UPDATE SET
        Visits = Visits + 1,
        UniqueIps = UniqueIps + excluded.UniqueIps,
        UpdatedAt = excluded.UpdatedAt`
  ).bind(
    event.hourKey,
    event.locationKey,
    event.dayKey,
    event.country,
    event.region,
    event.city,
    event.timezone,
    uniqueDelta,
    event.createdAt
  ).run();
  return true;
}
__name(writeVisitorD1, "writeVisitorD1");
function archiveVisitorEvent(ctx, services, event) {
  if (!services?.analyticsRaw) return;
  const payload = {
    eventAt: event.eventAt,
    dayKey: event.dayKey,
    hourKey: event.hourKey,
    ipHash: event.ipHash,
    ipPrefix: event.ipPrefix,
    location: {
      country: event.country,
      region: event.region,
      city: event.city,
      timezone: event.timezone,
      latitude: event.latitude,
      longitude: event.longitude
    },
    path: event.path,
    referrerHost: event.referrerHost,
    userAgentHash: event.userAgentHash
  };
  const task = services.analyticsRaw.putJson(event.rawR2Key, payload).catch(
    (e) => console.warn("[analytics/visit] R2 archive skipped:", e?.message || e)
  );
  if (ctx?.waitUntil) ctx.waitUntil(task);
}
__name(archiveVisitorEvent, "archiveVisitorEvent");
async function getVisitorLocations(request, env2) {
  const range = resolveRange(new URL(request.url));
  const storage = { d1: Boolean(env2.DB), r2: Boolean(env2.IMAGES) };
  if (!env2.DB) {
    return jsonOk({ range, storage, configured: false, topLocations: [] });
  }
  try {
    const result = await env2.DB.prepare(
      `SELECT
          LocationKey,
          MAX(Country) AS Country,
          MAX(Region) AS Region,
          MAX(City) AS City,
          MAX(Timezone) AS Timezone,
          SUM(Visits) AS Visits,
          SUM(UniqueIps) AS UniqueIps,
          MAX(UpdatedAt) AS LastSeenAt
        FROM VisitorLocationHourly
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY LocationKey
        ORDER BY Visits DESC, UniqueIps DESC, LastSeenAt DESC
        LIMIT ?`
    ).bind(range.startDate, range.endDate, VISITOR_LOCATION_LIMIT).all();
    const rows = result.results || [];
    const topLocations = await Promise.all(
      rows.slice(0, VISITOR_LOCATION_LIMIT).map(async (row) => {
        const peak = await visitorLocationPeak(env2, range, row.LocationKey);
        return {
          key: row.LocationKey,
          name: visitorLocationName(row),
          country: row.Country || "",
          region: row.Region || "",
          city: row.City || "",
          timezone: row.Timezone || "",
          visits: Number(row.Visits || 0),
          uniqueIps: Number(row.UniqueIps || 0),
          lastSeenAt: row.LastSeenAt || "",
          peakHour: peak.hour,
          peakHourLabel: peak.label,
          peakHourVisits: peak.visits
        };
      })
    );
    return jsonOk({ range, storage, configured: true, topLocations });
  } catch (e) {
    if (isMissingVisitorTable(e)) {
      return jsonOk({ range, storage, configured: false, topLocations: [] });
    }
    throw e;
  }
}
__name(getVisitorLocations, "getVisitorLocations");
async function getVisitorLocationDetail(request, env2) {
  const range = resolveRange(new URL(request.url));
  const storage = { d1: Boolean(env2.DB), r2: Boolean(env2.IMAGES) };
  const empty = {
    range,
    storage,
    configured: Boolean(env2.DB),
    cumulative: {
      visits: 0,
      uniqueIps: 0,
      locations: 0,
      firstSeenAt: "",
      lastSeenAt: ""
    },
    topLocations: [],
    months: [],
    recentEvents: [],
    limits: {
      months: VISITOR_DETAIL_MONTH_LIMIT,
      days: VISITOR_DETAIL_DAY_LIMIT,
      events: VISITOR_DETAIL_EVENT_LIMIT
    }
  };
  if (!env2.DB) return jsonOk({ ...empty, configured: false });
  try {
    const cumulative = await env2.DB.prepare(
      `SELECT
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          COUNT(DISTINCT LocationKey) AS Locations,
          MIN(EventAt) AS FirstSeenAt,
          MAX(EventAt) AS LastSeenAt
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?`
    ).bind(range.startDate, range.endDate).first();
    const top = await env2.DB.prepare(
      `SELECT
          LocationKey,
          MAX(Country) AS Country,
          MAX(Region) AS Region,
          MAX(City) AS City,
          MAX(Timezone) AS Timezone,
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          MAX(EventAt) AS LastSeenAt
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY LocationKey
        ORDER BY Visits DESC, UniqueIps DESC, LastSeenAt DESC
        LIMIT ?`
    ).bind(range.startDate, range.endDate, VISITOR_LOCATION_LIMIT).all();
    const monthly = await env2.DB.prepare(
      `SELECT
          substr(DayKey, 1, 7) AS MonthKey,
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          COUNT(DISTINCT LocationKey) AS Locations
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY substr(DayKey, 1, 7)
        ORDER BY MonthKey DESC
        LIMIT ?`
    ).bind(range.startDate, range.endDate, VISITOR_DETAIL_MONTH_LIMIT).all();
    const dayRows = await env2.DB.prepare(
      `SELECT
          substr(DayKey, 1, 7) AS MonthKey,
          DayKey,
          COUNT(*) AS Visits,
          COUNT(DISTINCT IpHash) AS UniqueIps,
          COUNT(DISTINCT LocationKey) AS Locations
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        GROUP BY DayKey
        ORDER BY DayKey DESC
        LIMIT ?`
    ).bind(range.startDate, range.endDate, VISITOR_DETAIL_DAY_LIMIT).all();
    const recent = await env2.DB.prepare(
      `SELECT
          EventAt,
          DayKey,
          HourKey,
          IpPrefix,
          Country,
          Region,
          City,
          Timezone,
          LocationKey,
          Path,
          ReferrerHost
        FROM VisitorIpEvents
        WHERE DayKey >= ? AND DayKey <= ?
        ORDER BY EventAt DESC
        LIMIT ?`
    ).bind(range.startDate, range.endDate, VISITOR_DETAIL_EVENT_LIMIT).all();
    return jsonOk({
      ...empty,
      configured: true,
      cumulative: {
        visits: Number(cumulative?.Visits || 0),
        uniqueIps: Number(cumulative?.UniqueIps || 0),
        locations: Number(cumulative?.Locations || 0),
        firstSeenAt: cumulative?.FirstSeenAt || "",
        lastSeenAt: cumulative?.LastSeenAt || ""
      },
      topLocations: (top.results || []).map((row) => ({
        key: row.LocationKey,
        name: visitorLocationName(row),
        country: row.Country || "",
        region: row.Region || "",
        city: row.City || "",
        timezone: row.Timezone || "",
        visits: Number(row.Visits || 0),
        uniqueIps: Number(row.UniqueIps || 0),
        lastSeenAt: row.LastSeenAt || ""
      })),
      months: groupVisitorDetailDays(
        dayRows.results || [],
        monthly.results || []
      ),
      recentEvents: (recent.results || []).map((row) => ({
        eventAt: row.EventAt || "",
        dayKey: row.DayKey || "",
        hourKey: row.HourKey || "",
        ipPrefix: row.IpPrefix || "",
        location: visitorLocationName(row),
        country: row.Country || "",
        region: row.Region || "",
        city: row.City || "",
        timezone: row.Timezone || "",
        path: row.Path || "",
        referrerHost: row.ReferrerHost || ""
      }))
    });
  } catch (e) {
    if (isMissingVisitorTable(e)) {
      return jsonOk({ ...empty, configured: false });
    }
    throw e;
  }
}
__name(getVisitorLocationDetail, "getVisitorLocationDetail");
function groupVisitorDetailDays(dayRows, monthRows = []) {
  const months = /* @__PURE__ */ new Map();
  for (const row of monthRows) {
    const monthKey = row.MonthKey || "";
    if (!monthKey) continue;
    months.set(monthKey, {
      monthKey,
      visits: Number(row.Visits || 0),
      uniqueIps: Number(row.UniqueIps || 0),
      locations: Number(row.Locations || 0),
      days: []
    });
  }
  for (const row of dayRows) {
    const monthKey = row.MonthKey || String(row.DayKey || "").slice(0, 7);
    if (!monthKey) continue;
    const month = months.get(monthKey) || {
      monthKey,
      visits: 0,
      uniqueIps: 0,
      locations: 0,
      days: []
    };
    const day = {
      date: row.DayKey || "",
      visits: Number(row.Visits || 0),
      uniqueIps: Number(row.UniqueIps || 0),
      locations: Number(row.Locations || 0)
    };
    if (!monthRows.length) {
      month.visits += day.visits;
      month.uniqueIps += day.uniqueIps;
      month.locations = Math.max(month.locations, day.locations);
    }
    month.days.push(day);
    months.set(monthKey, month);
  }
  return Array.from(months.values());
}
__name(groupVisitorDetailDays, "groupVisitorDetailDays");
async function visitorLocationPeak(env2, range, locationKey) {
  const row = await env2.DB.prepare(
    `SELECT substr(HourKey, 12, 2) AS Hour, SUM(Visits) AS Visits
       FROM VisitorLocationHourly
       WHERE DayKey >= ? AND DayKey <= ? AND LocationKey = ?
       GROUP BY substr(HourKey, 12, 2)
       ORDER BY Visits DESC, Hour ASC
       LIMIT 1`
  ).bind(range.startDate, range.endDate, locationKey).first();
  const hour = row?.Hour || "";
  return {
    hour,
    label: hour ? `${Number(hour)}\uC2DC` : "",
    visits: Number(row?.Visits || 0)
  };
}
__name(visitorLocationPeak, "visitorLocationPeak");
function visitorLocationName(row) {
  const city = row.City || "";
  const region = row.Region || "";
  const country = row.Country || "";
  if (city && region && city !== region) return `${city} \xB7 ${region}`;
  return city || region || country || "\uC704\uCE58 \uBBF8\uD655\uC778";
}
__name(visitorLocationName, "visitorLocationName");
function isMissingVisitorTable(error3) {
  return /no such table|VisitorLocationHourly|VisitorIpEvents/i.test(
    String(error3?.message || "")
  );
}
__name(isMissingVisitorTable, "isMissingVisitorTable");
async function getSummary(request, env2, services, ctx) {
  const url = new URL(request.url);
  const range = resolveRange(url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  let latest = null;
  let snapshotReadError = "";
  try {
    latest = await latestSnapshot(services, range);
  } catch (error3) {
    snapshotReadError = safeErrorCode(error3);
  }
  const selfResult = await fetchSelfStats(env2, services, range, ctx, {
    forceRefresh,
    mode: forceRefresh ? "manual" : "request"
  });
  const selfStats = selfResult.data;
  const mergeWithSelf = /* @__PURE__ */ __name((base, extra = {}) => ({
    ...base,
    ok: true,
    summary: {
      ...base.summary || {},
      // visitors / pageviews / avgDuration / bounceRate 는 GA4 본연 값 그대로 —
      // 자체측정 터치와 의미가 달라 머지 금지. (옛 사고: GA4 lag 우회한다고
      // self.touches 를 visitors 로 덮어써서 두 메트릭이 한 값으로 합쳐졌던 것 분리.)
      // 자체측정 카드(touches / newVisitors / returningVisitors) 는 self 그대로.
      touches: selfStats.touches,
      newVisitors: selfStats.newVisitors,
      returningVisitors: selfStats.returningVisitors
    },
    trend: selfStats.trend && selfStats.trend.length ? selfStats.trend : base.trend || [],
    sources: selfStats.sources && selfStats.sources.length ? selfStats.sources : reclassifySources(base.sources),
    self: selfStats,
    freshness: {
      ...base.freshness || {},
      snapshotRead: {
        state: snapshotReadError ? "error" : latest ? "ready" : "empty",
        createdAt: latest?.createdAt || "",
        errorCode: snapshotReadError
      },
      self: {
        state: selfResult.state,
        createdAt: selfResult.createdAt || "",
        stale: Boolean(selfResult.stale),
        errorCode: selfResult.errorCode || ""
      }
    },
    ...extra
  }), "mergeWithSelf");
  if (!forceRefresh && latest && !isExpired(latest.createdAt)) {
    const cached = latest.payload || {};
    return jsonOk(
      mergeWithSelf(cached, { persisted: latest.persisted, cached: true })
    );
  }
  if (!forceRefresh && latest && ctx?.waitUntil) {
    ctx.waitUntil(
      (async () => {
        try {
          const fresh2 = await collectGoogleSummary(env2, range);
          if (fresh2.ok) {
            await persistSnapshot(services, range, fresh2);
          }
        } catch {
        }
      })()
    );
    return jsonOk(
      mergeWithSelf(latest.payload || {}, {
        persisted: latest.persisted,
        cached: true,
        stale: true,
        revalidating: true
      })
    );
  }
  const fresh = await collectGoogleSummary(env2, range);
  if (!fresh.ok) {
    if (latest) {
      const cached = latest.payload || {};
      return jsonOk(
        mergeWithSelf(cached, {
          persisted: latest.persisted,
          cached: true,
          stale: true,
          errors: fresh.errors
        })
      );
    }
    return jsonOk(mergeWithSelf(fresh, { cached: false }));
  }
  let persisted = null;
  await persistCrmGa4Binding(env2, range, fresh);
  try {
    persisted = await persistSnapshot(services, range, fresh);
    if (persisted.archiveError) {
      fresh.errors.push({
        source: "snapshot_archive",
        code: persisted.archiveError
      });
    }
  } catch (error3) {
    fresh.errors.push({
      source: "snapshot",
      code: safeErrorCode(error3)
    });
  }
  return jsonOk(mergeWithSelf(fresh, { persisted, cached: false }));
}
__name(getSummary, "getSummary");
function emptySelfStats() {
  return {
    // 이 값이 SELF_CACHE_VERSION 과 다른 스냅샷은 읽지 않고 다시 계산한다.
    cacheVersion: SELF_CACHE_VERSION,
    touches: 0,
    pageviews: 0,
    newVisitors: 0,
    returningVisitors: 0,
    avgPageviewsPerSession: 0,
    avgDwellSec: 0,
    peakHour: null,
    devices: { pc: 0, mobile: 0 },
    topLocations: [],
    submissions: 0,
    conversionRate: 0,
    trend: [],
    sources: []
  };
}
__name(emptySelfStats, "emptySelfStats");
function selfStatsTtlSeconds(range) {
  if (range.key === "today") return 60;
  if (range.key === "7") return 300;
  if (range.key === "30") return 900;
  if (range.key === "all") return 21600;
  return 3600;
}
__name(selfStatsTtlSeconds, "selfStatsTtlSeconds");
function selfSnapshotData(snapshot) {
  const payload = snapshot?.payload || {};
  const data = payload.self || payload.data || null;
  if (!data || data.cacheVersion !== SELF_CACHE_VERSION) return null;
  return data;
}
__name(selfSnapshotData, "selfSnapshotData");
async function cacheSelfStats(range, result) {
  const cache = caches.default;
  const key = `https://selfstats.internal/${SELF_CACHE_VERSION}/${encodeURIComponent(range.key)}/${encodeURIComponent(range.startDate)}/${encodeURIComponent(range.endDate)}`;
  const ttl = selfStatsTtlSeconds(range);
  try {
    await cache.put(
      key,
      new Response(JSON.stringify(result), {
        headers: {
          "content-type": "application/json",
          "cache-control": `max-age=${ttl}`
        }
      })
    );
  } catch {
  }
}
__name(cacheSelfStats, "cacheSelfStats");
async function readCachedSelfStats(range) {
  const cache = caches.default;
  const key = `https://selfstats.internal/${SELF_CACHE_VERSION}/${encodeURIComponent(range.key)}/${encodeURIComponent(range.startDate)}/${encodeURIComponent(range.endDate)}`;
  try {
    const hit = await cache.match(key);
    return hit ? await hit.json() : null;
  } catch {
  }
  return null;
}
__name(readCachedSelfStats, "readCachedSelfStats");
async function fetchSelfStats(env2, services, range, ctx, { forceRefresh = false, mode = "request" } = {}) {
  if (!forceRefresh) {
    const cached = await readCachedSelfStats(range);
    if (cached?.data) return cached;
  }
  let latest = null;
  try {
    latest = await latestSnapshot(services, range, SELF_SOURCE);
  } catch {
  }
  const latestData = selfSnapshotData(latest);
  const ttlMs = selfStatsTtlSeconds(range) * 1e3;
  const latestAge = Date.now() - Date.parse(latest?.createdAt || "");
  if (!forceRefresh && latestData && Number.isFinite(latestAge) && latestAge <= ttlMs) {
    const result = {
      data: latestData,
      state: "snapshot",
      createdAt: latest.createdAt,
      stale: false,
      errorCode: ""
    };
    await cacheSelfStats(range, result);
    return result;
  }
  if (!forceRefresh && latestData && ctx?.waitUntil) {
    ctx.waitUntil(
      refreshSelfStats(env2, services, range, "swr").catch(() => null)
    );
    const result = {
      data: latestData,
      state: "snapshot",
      createdAt: latest.createdAt,
      stale: true,
      errorCode: ""
    };
    await cacheSelfStats(range, result);
    return result;
  }
  try {
    return await refreshSelfStats(env2, services, range, mode);
  } catch (error3) {
    const fallback = {
      data: latestData || emptySelfStats(),
      state: latestData ? "snapshot" : "error",
      createdAt: latest?.createdAt || "",
      stale: Boolean(latestData),
      errorCode: safeErrorCode(error3)
    };
    if (latestData) await cacheSelfStats(range, fallback);
    return fallback;
  }
}
__name(fetchSelfStats, "fetchSelfStats");
async function refreshSelfStats(env2, services, range, mode) {
  const startedAt = Date.now();
  try {
    const data = await computeSelfStats(env2, range);
    const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
    let persisted = null;
    let persistError = "";
    let persistState = "";
    try {
      persisted = await persistSnapshot(
        services,
        range,
        {
          ok: true,
          source: SELF_SOURCE,
          range,
          fetchedAt,
          self: data
        },
        SELF_SOURCE
      );
      if (persisted.archiveError) {
        persistError = persisted.archiveError;
        persistState = "fresh_archive_failed";
      }
    } catch (error3) {
      persistError = safeErrorCode(error3);
      persistState = "fresh_unpersisted";
    }
    await recordAnalyticsRefresh(env2, {
      range,
      mode,
      source: SELF_SOURCE,
      state: persistState || "success",
      durationMs: Date.now() - startedAt,
      snapshotId: persisted?.id || "",
      errorCode: persistError
    });
    const result = {
      data,
      state: persistState || "fresh",
      createdAt: fetchedAt,
      stale: false,
      errorCode: persistError
    };
    await cacheSelfStats(range, result);
    return result;
  } catch (error3) {
    await recordAnalyticsRefresh(env2, {
      range,
      mode,
      source: SELF_SOURCE,
      state: "error",
      durationMs: Date.now() - startedAt,
      snapshotId: "",
      errorCode: safeErrorCode(error3)
    });
    throw error3;
  }
}
__name(refreshSelfStats, "refreshSelfStats");
async function computeSelfStats(env2, range) {
  const startDate = range.startDate;
  const endDate = range.endDate;
  const result = emptySelfStats();
  if (!env2?.DB) throw new Error("analytics_db_unavailable");
  const summaryRow = await env2.DB.prepare(
    `WITH active AS (
       SELECT SessionId, SUM(Pageviews) AS Pageviews
       FROM AnalyticsSessionDays
       WHERE DayKey BETWEEN ? AND ?
         AND Pageviews > 0
       GROUP BY SessionId
     )
     SELECT
       COUNT(*) AS Touches,
       COALESCE(SUM(active.Pageviews), 0) AS Pageviews,
       COALESCE(SUM(CASE WHEN sessions.ActiveDayCount > 1 THEN 1 ELSE 0 END), 0) AS ReturningVisitors
     FROM active
     JOIN AnalyticsSessions sessions USING (SessionId)`
  ).bind(startDate, endDate).first();
  result.touches = Number(summaryRow?.Touches || 0);
  result.pageviews = Number(summaryRow?.Pageviews || 0);
  result.returningVisitors = Number(summaryRow?.ReturningVisitors || 0);
  result.newVisitors = Math.max(0, result.touches - result.returningVisitors);
  result.avgPageviewsPerSession = result.touches > 0 ? result.pageviews / result.touches : 0;
  const dwellRow = await env2.DB.prepare(
    `SELECT AVG(
       (julianday(LastSeenAt) - julianday(FirstSeenAt)) * 86400
     ) AS AvgDwell
     FROM AnalyticsSessionDays
     WHERE DayKey BETWEEN ? AND ?
       AND Pageviews > 0
       AND EventCount > 1`
  ).bind(startDate, endDate).first();
  result.avgDwellSec = Number(dwellRow?.AvgDwell || 0);
  const peakRow = await env2.DB.prepare(
    `SELECT substr(HourKey, 12, 2) AS Hour, COUNT(*) AS Cnt
     FROM AnalyticsPageViews
     WHERE DayKey BETWEEN ? AND ?
     GROUP BY Hour
     ORDER BY Cnt DESC
     LIMIT 1`
  ).bind(startDate, endDate).first();
  if (peakRow?.Hour) result.peakHour = parseInt(peakRow.Hour, 10);
  const deviceRows = await env2.DB.prepare(
    `WITH ranked AS (
       SELECT
         Device,
         ROW_NUMBER() OVER (
           PARTITION BY SessionId
           ORDER BY CASE WHEN Device <> '' THEN 0 ELSE 1 END, CreatedAt, id
         ) AS rn
       FROM AnalyticsPageViews
       WHERE DayKey BETWEEN ? AND ?
     )
     SELECT Device, COUNT(*) AS Cnt
     FROM ranked
     WHERE rn = 1
     GROUP BY Device`
  ).bind(startDate, endDate).all();
  for (const row of deviceRows.results || []) {
    if (row.Device === "pc" || row.Device === "mobile") {
      result.devices[row.Device] = Number(row.Cnt || 0);
    }
  }
  const locationRows = await env2.DB.prepare(
    `WITH ranked AS (
       SELECT
         COALESCE(NULLIF(City, ''), 'Unknown') AS City,
         COALESCE(NULLIF(Country, ''), '') AS Country,
         ROW_NUMBER() OVER (
           PARTITION BY SessionId
           ORDER BY CASE WHEN City <> '' THEN 0 ELSE 1 END, CreatedAt, id
         ) AS rn
       FROM AnalyticsPageViews
       WHERE DayKey BETWEEN ? AND ?
     )
     SELECT City, Country, COUNT(*) AS Cnt
     FROM ranked
     WHERE rn = 1
     GROUP BY City, Country
     ORDER BY Cnt DESC
     LIMIT 5`
  ).bind(startDate, endDate).all();
  result.topLocations = (locationRows.results || []).map((row) => ({
    city: String(row.City || "Unknown"),
    country: String(row.Country || ""),
    sessions: Number(row.Cnt || 0)
  }));
  const { startUtc, endExclusiveUtc } = kstRangeToUtc(startDate, endDate);
  const submissionRow = await env2.DB.prepare(
    `SELECT COUNT(*) AS Cnt
     FROM Estimates
     WHERE SubmittedAt >= ?
       AND SubmittedAt < ?`
  ).bind(startUtc, endExclusiveUtc).first();
  result.submissions = Number(submissionRow?.Cnt || 0);
  result.conversionRate = result.touches > 0 ? result.submissions / result.touches : 0;
  const sourceRows = await env2.DB.prepare(
    `WITH ranked AS (
       SELECT
         SessionId,
         COALESCE(NULLIF(UtmSource, ''), '(none)') AS src,
         COALESCE(NULLIF(UtmMedium, ''), '') AS med,
         COALESCE(NULLIF(Referrer, ''), '') AS ref,
         ROW_NUMBER() OVER (
           PARTITION BY SessionId
           ORDER BY
             CASE WHEN UtmSource <> '' OR Referrer <> '' THEN 0 ELSE 1 END,
             CreatedAt,
             id
         ) AS rn
       FROM AnalyticsPageViews
       WHERE DayKey BETWEEN ? AND ?
     ),
     session_pageviews AS (
       SELECT SessionId, COUNT(*) AS Pageviews
       FROM AnalyticsPageViews
       WHERE DayKey BETWEEN ? AND ?
       GROUP BY SessionId
     )
     SELECT
       ranked.src AS src,
       ranked.med AS med,
       ranked.ref AS ref,
       COUNT(*) AS Visitors,
       COALESCE(SUM(session_pageviews.Pageviews), 0) AS Pageviews
     FROM ranked
     LEFT JOIN session_pageviews
       ON session_pageviews.SessionId = ranked.SessionId
     WHERE ranked.rn = 1
     GROUP BY ranked.src, ranked.med, ranked.ref`
  ).bind(startDate, endDate, startDate, endDate).all();
  const sourceMetricRows = (sourceRows.results || []).map((row) => {
    const source = row.src === "(none)" && row.ref ? row.ref : row.src;
    return {
      dimensionValues: [
        { value: String(source || "") },
        { value: String(row.med || "") },
        { value: "" }
      ],
      // 자체 측정은 SessionId(30일 localStorage UUID) 하나가 곧 방문자 한 명이라
      // sessions 와 activeUsers 가 같은 값이다. 페이지뷰는 세 번째 지표로 따로 넘긴다.
      metricValues: [
        { value: String(row.Visitors || 0) },
        { value: String(row.Visitors || 0) },
        { value: String(row.Pageviews || 0) }
      ]
    };
  });
  result.sources = aggregateTrafficSources(sourceMetricRows);
  const trendRows = await env2.DB.prepare(
    `SELECT
       DayKey AS d,
       COUNT(*) AS Visitors,
       SUM(Pageviews) AS Pageviews
     FROM AnalyticsSessionDays
     WHERE DayKey BETWEEN ? AND ?
       AND Pageviews > 0
     GROUP BY DayKey
     ORDER BY DayKey ASC`
  ).bind(startDate, endDate).all();
  result.trend = (trendRows.results || []).map((row) => ({
    date: String(row.d),
    visitors: Number(row.Visitors || 0),
    pageviews: Number(row.Pageviews || 0)
  }));
  return result;
}
__name(computeSelfStats, "computeSelfStats");
function kstToday() {
  const now = /* @__PURE__ */ new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1e3;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  return new Date(Date.UTC(y, m, d));
}
__name(kstToday, "kstToday");
function resolveRange(url) {
  const key = url.searchParams.get("range") || "30";
  const today = kstToday();
  let start = new Date(today);
  let end = endOfDay(today);
  let rangeKey = key;
  if (key === "today") {
  } else if (key === "7" || key === "30") {
    const days = Number(key);
    start.setDate(start.getDate() - (days - 1));
  } else if (key === "cur-month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (key === "prev-month") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
  } else if (key === "all") {
    start = new Date(2020, 0, 1);
  } else if (key === "custom") {
    const qsStart = parseDateParam(url.searchParams.get("start"));
    const qsEnd = parseDateParam(url.searchParams.get("end"));
    start = qsStart || today;
    end = endOfDay(qsEnd || today);
  } else {
    rangeKey = "30";
    start.setDate(start.getDate() - 29);
  }
  return {
    key: rangeKey,
    startDate: dayKey(start),
    endDate: dayKey(end)
  };
}
__name(resolveRange, "resolveRange");
function parseDateParam(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00`);
  return Number.isNaN(+date) ? null : startOfDay(date);
}
__name(parseDateParam, "parseDateParam");
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
__name(startOfDay, "startOfDay");
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
__name(endOfDay, "endOfDay");
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
__name(dayKey, "dayKey");
function isExpired(iso2) {
  const t = Date.parse(iso2 || "");
  return !t || Date.now() - t > SNAPSHOT_TTL_MS;
}
__name(isExpired, "isExpired");
async function latestSnapshot(services, range, source = SOURCE) {
  if (!services.analyticsSnapshots) return null;
  const result = await services.analyticsSnapshots.list({
    where: {
      RangeKey: range.key,
      StartDate: range.startDate,
      EndDate: range.endDate,
      Source: source
    },
    sort: [{ field: "CreatedAt", direction: "desc" }],
    limit: 1
  });
  const record = result.records?.[0];
  if (!record) return null;
  return snapshotFromRecord(record);
}
__name(latestSnapshot, "latestSnapshot");
function snapshotFromRecord(record) {
  let payload = {};
  try {
    payload = JSON.parse(record.fields.Payload || "{}");
  } catch {
  }
  return {
    payload,
    createdAt: record.fields.CreatedAt,
    persisted: {
      id: record.id,
      createdAt: record.fields.CreatedAt,
      rawR2Key: record.fields.RawR2Key || ""
    }
  };
}
__name(snapshotFromRecord, "snapshotFromRecord");
async function runScheduledAnalyticsSnapshot(env2, ctx) {
  const services = createServices(env2);
  const rangeKeys = ["today", "7", "30", "prev-month", "cur-month"];
  const fakeUrl = new URL("https://internal/api/analytics/summary");
  const errors = [];
  for (const key of rangeKeys) {
    try {
      fakeUrl.searchParams.set("range", key);
      fakeUrl.searchParams.set("refresh", "1");
      const range = resolveRange(fakeUrl);
      await fetchSelfStats(env2, services, range, ctx, {
        forceRefresh: true,
        mode: "cron"
      });
      const startedAt = Date.now();
      const fresh = await collectGoogleSummary(env2, range);
      if (fresh.ok) {
        await persistCrmGa4Binding(env2, range, fresh);
        let persisted = null;
        let persistError = "";
        try {
          persisted = await persistSnapshot(services, range, fresh);
        } catch (error3) {
          persistError = safeErrorCode(error3);
        }
        if (persisted?.archiveError) {
          persistError = persisted.archiveError;
        }
        await recordAnalyticsRefresh(env2, {
          range,
          mode: "cron",
          source: SOURCE,
          state: persisted?.archiveError ? "fresh_archive_failed" : persistError ? "fresh_unpersisted" : "success",
          durationMs: Date.now() - startedAt,
          snapshotId: persisted?.id || "",
          errorCode: persistError
        });
      } else {
        await recordAnalyticsRefresh(env2, {
          range,
          mode: "cron",
          source: SOURCE,
          state: "error",
          durationMs: Date.now() - startedAt,
          snapshotId: "",
          errorCode: fresh.errors?.[0]?.code || "google_unavailable"
        });
      }
    } catch (e) {
      errors.push({ key, code: safeErrorCode(e) });
    }
  }
  return { ok: errors.length === 0, errors };
}
__name(runScheduledAnalyticsSnapshot, "runScheduledAnalyticsSnapshot");
async function persistSnapshot(services, range, payload, source = SOURCE) {
  if (!services.analyticsSnapshots) {
    throw new Error("analytics_snapshot_store_unavailable");
  }
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const rawR2Key = `analytics/snapshots/${source}/${range.endDate}/${range.key}-${Date.now()}-${randomId()}.json`;
  let storedKey = "";
  let archiveError = "";
  if (services.analyticsRaw) {
    try {
      storedKey = await services.analyticsRaw.putJson(rawR2Key, payload);
    } catch (error3) {
      archiveError = safeErrorCode(error3);
    }
  }
  const record = await services.analyticsSnapshots.create({
    RangeKey: range.key,
    StartDate: range.startDate,
    EndDate: range.endDate,
    Source: source,
    Payload: JSON.stringify(payload),
    RawR2Key: storedKey,
    CreatedAt: createdAt
  });
  return {
    id: record.id,
    createdAt,
    rawR2Key: storedKey,
    archiveError
  };
}
__name(persistSnapshot, "persistSnapshot");
async function recordAnalyticsRefresh(env2, { range, mode, source, state, durationMs, snapshotId, errorCode }) {
  if (!env2?.DB) return;
  try {
    await env2.DB.prepare(
      `INSERT INTO AnalyticsRefreshLog (
         id, RangeKey, StartDate, EndDate, Mode, Source, State,
         DurationMs, SnapshotId, ErrorCode, CreatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `anl${Date.now().toString(36)}${randomId(8)}`,
      range.key,
      range.startDate,
      range.endDate,
      mode,
      source,
      state,
      Math.max(0, Math.round(Number(durationMs) || 0)),
      snapshotId || "",
      errorCode || "",
      (/* @__PURE__ */ new Date()).toISOString()
    ).run();
  } catch {
  }
}
__name(recordAnalyticsRefresh, "recordAnalyticsRefresh");
function hasOauth(env2, refreshToken) {
  return Boolean(
    env2.GOOGLE_CLIENT_ID && env2.GOOGLE_CLIENT_SECRET && refreshToken
  );
}
__name(hasOauth, "hasOauth");
function ga4RefreshToken(env2) {
  return env2.GA4_REFRESH_TOKEN || env2.GOOGLE_ANALYTICS_REFRESH_TOKEN || env2.GOOGLE_REFRESH_TOKEN || "";
}
__name(ga4RefreshToken, "ga4RefreshToken");
function gscRefreshToken(env2) {
  return env2.GSC_REFRESH_TOKEN || env2.GOOGLE_WEBMASTERS_REFRESH_TOKEN || env2.GOOGLE_REFRESH_TOKEN || "";
}
__name(gscRefreshToken, "gscRefreshToken");
async function googleAccessToken(env2, refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env2.GOOGLE_CLIENT_ID,
      client_secret: env2.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`oauth_refresh_${res.status}`);
  const body = await res.json();
  if (!body.access_token) throw new Error("oauth_no_access_token");
  return body.access_token;
}
__name(googleAccessToken, "googleAccessToken");
async function collectGoogleSummary(env2, range) {
  const propertyId = String(env2.GA4_PROPERTY_ID || "").trim();
  const siteUrl = String(env2.GSC_SITE_URL || DEFAULT_SITE_URL).trim();
  const errors = [];
  const payload = {
    ok: false,
    source: SOURCE,
    range,
    propertyId,
    siteUrl,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    configured: {
      ga4: Boolean(propertyId && hasOauth(env2, ga4RefreshToken(env2))),
      gsc: Boolean(siteUrl && hasOauth(env2, gscRefreshToken(env2)))
    },
    summary: null,
    trend: [],
    sources: [],
    topPages: [],
    searchQueries: [],
    errors
  };
  if (payload.configured.ga4) {
    try {
      Object.assign(
        payload,
        await collectGa4(env2, propertyId, ga4RefreshToken(env2), range)
      );
      payload.ok = true;
    } catch (e) {
      errors.push({ source: "ga4", code: safeErrorCode(e) });
    }
  }
  if (payload.configured.gsc) {
    try {
      payload.searchQueries = await collectSearchConsole(
        env2,
        siteUrl,
        gscRefreshToken(env2),
        range
      );
      payload.ok = true;
    } catch (e) {
      errors.push({ source: "gsc", code: safeErrorCode(e) });
    }
  }
  if (!payload.configured.ga4) {
    errors.push({ source: "ga4", code: "not_configured" });
  }
  if (!payload.configured.gsc) {
    errors.push({ source: "gsc", code: "not_configured" });
  }
  try {
    const touchRow = await env2.DB.prepare(
      `SELECT COUNT(DISTINCT SessionId) AS Touches
       FROM AnalyticsSessionDays
       WHERE DayKey BETWEEN ? AND ?
         AND Pageviews > 0`
    ).bind(range.startDate, range.endDate).first();
    const touches = Number(touchRow?.Touches || 0);
    payload.summary = { ...payload.summary || {}, touches };
  } catch (e) {
    errors.push({ source: "d1_touches", code: safeErrorCode(e) });
  }
  return payload;
}
__name(collectGoogleSummary, "collectGoogleSummary");
function safeErrorCode(error3) {
  return String(error3?.message || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}
__name(safeErrorCode, "safeErrorCode");
async function collectGa4(env2, propertyId, refreshToken, range) {
  const token = await googleAccessToken(env2, refreshToken);
  const base = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }]
  };
  const [totals, trend, pages, sources] = await Promise.all([
    runGa4Report(token, propertyId, {
      ...base,
      metrics: [
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "sessions" }
      ]
    }),
    runGa4Report(token, propertyId, {
      ...base,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: "120"
    }),
    runGa4Report(token, propertyId, {
      ...base,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "10"
    }),
    runGa4Report(token, propertyId, {
      ...base,
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "sessionDefaultChannelGroup" }
      ],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "50"
    })
  ]);
  const totalMetrics = metricValues(totals.rows?.[0], [
    "activeUsers",
    "screenPageViews",
    "averageSessionDuration",
    "bounceRate",
    "sessions"
  ]);
  return {
    summary: {
      visitors: totalMetrics.activeUsers,
      pageviews: totalMetrics.screenPageViews,
      avgDurationSec: totalMetrics.averageSessionDuration,
      bounceRate: totalMetrics.bounceRate,
      sessions: totalMetrics.sessions
    },
    trend: (trend.rows || []).map((row) => {
      const m = metricValues(row, ["activeUsers", "screenPageViews"]);
      return {
        date: formatGaDate(row.dimensionValues?.[0]?.value || ""),
        visitors: m.activeUsers,
        pageviews: m.screenPageViews
      };
    }),
    topPages: (pages.rows || []).map((row) => {
      const m = metricValues(row, ["screenPageViews", "activeUsers"]);
      return {
        path: row.dimensionValues?.[0]?.value || "",
        views: m.screenPageViews,
        visitors: m.activeUsers
      };
    }),
    sources: aggregateTrafficSources(sources.rows || [])
  };
}
__name(collectGa4, "collectGa4");
function reclassifySources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return sources || [];
  const fakeRows = [];
  for (const src of sources) {
    const rawList = Array.isArray(src.rawSources) ? src.rawSources : [];
    if (rawList.length === 0) {
      fakeRows.push({
        dimensionValues: [
          { value: src.name || "" },
          { value: "" },
          { value: "" }
        ],
        metricValues: [
          { value: String(src.sessions || 0) },
          { value: String(src.visitors || 0) },
          { value: String(src.pageviews || 0) }
        ]
      });
      continue;
    }
    for (const r of rawList) {
      fakeRows.push({
        dimensionValues: [
          { value: r.source || "" },
          { value: r.medium || "" },
          { value: r.channelGroup || "" }
        ],
        metricValues: [
          { value: String(r.sessions || 0) },
          { value: String(r.visitors || 0) },
          { value: String(r.pageviews || 0) }
        ]
      });
    }
  }
  return aggregateTrafficSources(fakeRows);
}
__name(reclassifySources, "reclassifySources");
function aggregateTrafficSources(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const source = cleanDimension(row.dimensionValues?.[0]?.value);
    const medium = cleanDimension(row.dimensionValues?.[1]?.value);
    const channelGroup = cleanDimension(row.dimensionValues?.[2]?.value);
    const m = metricValues(row, ["sessions", "activeUsers", "screenPageViews"]);
    const channel2 = classifyTrafficSource({ source, medium, channelGroup });
    const current = grouped.get(channel2.key) || {
      key: channel2.key,
      name: channel2.name,
      sessions: 0,
      visitors: 0,
      pageviews: 0,
      rawSources: []
    };
    current.sessions += m.sessions;
    current.visitors += m.activeUsers;
    current.pageviews += m.screenPageViews;
    current.rawSources.push({
      source,
      medium,
      channelGroup,
      sessions: m.sessions,
      visitors: m.activeUsers,
      pageviews: m.screenPageViews
    });
    grouped.set(channel2.key, current);
  }
  return Array.from(grouped.values()).map((item) => ({
    ...item,
    rawSources: item.rawSources.sort((a, b) => b.sessions - a.sessions).slice(0, 5)
  })).sort((a, b) => b.sessions - a.sessions);
}
__name(aggregateTrafficSources, "aggregateTrafficSources");
function cleanDimension(value) {
  const text = String(value || "").trim();
  return text || "(not set)";
}
__name(cleanDimension, "cleanDimension");
function classifyTrafficSource({ source, medium, channelGroup }) {
  const nfc = /* @__PURE__ */ __name((v) => String(v || "").normalize("NFC").toLowerCase(), "nfc");
  const src = nfc(source);
  const med = nfc(medium);
  const group3 = nfc(channelGroup);
  const haystack = `${src} ${med} ${group3}`;
  if (src === "(direct)" || src === "direct" || src === "(none)" || src === "(not set)" || !src || group3 === "direct" && (!src || src === "(not set)")) {
    return sourceChannel("direct");
  }
  const isPaid = med === "paid" || /paid/.test(group3);
  if (src === "localhost" || /(^|\.)localhost$/.test(src) || /\.local$/.test(src) || /^\d{1,3}(\.\d{1,3}){3}$/.test(src) || /(railway\.app|vercel\.app|workers\.dev|ngrok)/.test(src)) {
    return sourceChannel("internal");
  }
  if (/instagram-official|인스타그램-?오피셜/.test(haystack)) {
    return sourceChannel("instagram_official");
  }
  if (/instagram-marketing|인스타그램-?마케팅/.test(haystack)) {
    return sourceChannel("instagram_mkt");
  }
  if (src === "an" || src === "msg") return sourceChannel("meta_ad");
  if (src === "th") return sourceChannel("threads");
  if (/\b(instagram|ig)\b|ig\.com|인스타/.test(haystack)) {
    return sourceChannel(isPaid ? "instagram_ad" : "instagram");
  }
  if (/\bthreads\b|스레드/.test(haystack)) return sourceChannel("threads");
  if (/\b(facebook|fb)\b|fb\.|fbclid|l\.facebook|lm\.facebook|m\.facebook|페이스북|페북/.test(
    haystack
  )) {
    return sourceChannel(isPaid ? "facebook_ad" : "facebook");
  }
  if (/\bmeta\b|메타/.test(haystack)) {
    return sourceChannel(
      isPaid || med === "marketing-slug" ? "meta_ad" : "meta"
    );
  }
  if (/(chatgpt|openai|claude\.ai|perplexity|copilot|gemini|deepseek|grok)/.test(
    haystack
  )) {
    return sourceChannel("ai");
  }
  if (/(youtube|youtu\.be|유튜브)/.test(haystack)) {
    return sourceChannel("youtube");
  }
  if (/(naver|navercorp|nclid|네이버)/.test(haystack)) {
    return sourceChannel("naver");
  }
  if (/(google|googleads|adwords|gclid|doubleclick|구글)/.test(haystack)) {
    return sourceChannel("google");
  }
  if (/(kakao|daum|tistory|카카오|카톡|다음)/.test(haystack)) {
    return sourceChannel("kakao");
  }
  if (/(bing|yahoo|duckduckgo|\bzum\b|nate|야후|줌)/.test(haystack)) {
    return sourceChannel("search");
  }
  if (/(dcinside|fmkorea|ruliweb|dogdrip|humoruniv|dmitory|mlbpark|clien|theqoo|instiz|bobaedream|ppomppu|namu\.wiki|inven|arca\.live|82cook|missycoupons)/.test(
    haystack
  )) {
    return sourceChannel("community");
  }
  if (/(saramin|jobkorea|wanted\.co\.kr|incruit|jobplanet|work24|albamon|wishket|rocketpunch)/.test(
    haystack
  )) {
    return sourceChannel("recruit");
  }
  if (
    // x.com 앞에 경계를 둔다 — 안 그러면 wix.com 이 트위터로 잡힌다.
    /(pinterest|twitter|(^|[^a-z0-9])x\.com|linkedin|tiktok|band\.us|틱톡)/.test(
      haystack
    )
  ) {
    return sourceChannel("social");
  }
  if (group3.includes("search")) return sourceChannel("search");
  if (group3.includes("social")) return sourceChannel("social");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(src)) {
    return sourceChannel("referral");
  }
  if (group3.includes("referral")) return sourceChannel("referral");
  return sourceChannel("other");
}
__name(classifyTrafficSource, "classifyTrafficSource");
function sourceChannel(key) {
  return { key, name: SOURCE_CHANNELS[key] || SOURCE_CHANNELS.other };
}
__name(sourceChannel, "sourceChannel");
async function runGa4Report(accessToken2, propertyId, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken2}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
    }
  );
  if (!res.ok) throw new Error(`ga4_report_${res.status}`);
  return res.json();
}
__name(runGa4Report, "runGa4Report");
function metricValues(row, names) {
  const values = {};
  names.forEach((name, index) => {
    values[name] = Number(row?.metricValues?.[index]?.value || 0);
  });
  return values;
}
__name(metricValues, "metricValues");
function formatGaDate(value) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
__name(formatGaDate, "formatGaDate");
async function collectSearchConsole(env2, siteUrl, refreshToken, range) {
  const token = await googleAccessToken(env2, refreshToken);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ["query"],
        rowLimit: 10
      }),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
    }
  );
  if (!res.ok) throw new Error(`gsc_query_${res.status}`);
  const body = await res.json();
  return (body.rows || []).map((row) => ({
    query: row.keys?.[0] || "",
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0)
  }));
}
__name(collectSearchConsole, "collectSearchConsole");

// src/routes/heatmap.js
var HEATMAP_RATE_LIMIT_PER_HOUR = 1e3;
var MAX_EVENTS_PER_REQUEST = 50;
var MAX_D1_BOUND_PARAMETERS = 100;
var HEATMAP_INSERT_COLUMN_COUNT = 25;
var SOURCE_TENANT_ID2 = "day1design";
function buildHeatmapInsertStatements(env2, rows) {
  const chunkSize = Math.floor(
    MAX_D1_BOUND_PARAMETERS / HEATMAP_INSERT_COLUMN_COUNT
  );
  const statements = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const values = chunk.map(() => `(${Array.from({ length: HEATMAP_INSERT_COLUMN_COUNT }, () => "?").join(",")})`).join(", ");
    statements.push(
      env2.DB.prepare(
        `INSERT INTO HeatmapEvents
          (id, CrmTenantId, Page, EventType, Device, XPct, YPct, ScrollDepthPct,
           PageW, PageH, ViewportW, ViewportH,
           SessionId, IP, Country, Region, City,
           Referrer, RefPath, UtmSource, UtmMedium, UtmCampaign, CreatedAt, IsBot,
           InflowApp)
         VALUES ${values}`
      ).bind(...chunk.flat())
    );
  }
  return statements;
}
__name(buildHeatmapInsertStatements, "buildHeatmapInsertStatements");
async function heatmapRateLimit(ip, limit = HEATMAP_RATE_LIMIT_PER_HOUR) {
  const cache = caches.default;
  const key = `https://rate-limit.heatmap.internal/${ip}`;
  const cached = await cache.match(key);
  let count3 = 0;
  if (cached) count3 = parseInt(await cached.text() || "0", 10) || 0;
  count3++;
  if (count3 > limit) return { allowed: false, count: count3 };
  await cache.put(
    key,
    new Response(String(count3), {
      headers: { "cache-control": "max-age=3600" }
    })
  );
  return { allowed: true, count: count3 };
}
__name(heatmapRateLimit, "heatmapRateLimit");
function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
__name(clamp01, "clamp01");
function clampInt(n, max = 1e5) {
  const v = Math.floor(Number(n) || 0);
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}
__name(clampInt, "clampInt");
var PAGE_ALIAS = {
  "/HOUSE": "/pages/portfolio",
  "/OFFICE": "/pages/portfolio",
  "/PORTFOLIO": "/pages/portfolio",
  "/COMMUNITY": "/pages/community",
  "/Residential": "/pages/community",
  "/Commercial": "/pages/community",
  "/ESTIMATES": "/pages/estimates",
  "/ABOUT": "/pages/about",
  "/56": "/pages/project-flow",
  "/57": "/pages/about"
};
function safePage(s2) {
  const raw = String(s2 || "");
  let noQuery = raw.split("?")[0].split("#")[0];
  if (!noQuery.startsWith("/")) return "";
  if (noQuery.length > 1) noQuery = noQuery.replace(/\/+$/, "");
  if (noQuery.endsWith(".html")) noQuery = noQuery.slice(0, -5);
  if (PAGE_ALIAS[noQuery]) noQuery = PAGE_ALIAS[noQuery];
  return noQuery.slice(0, 200) || "/";
}
__name(safePage, "safePage");
function safeStr(s2, max = 100) {
  return String(s2 || "").slice(0, max);
}
__name(safeStr, "safeStr");
function safeDevice(s2) {
  return s2 === "mobile" ? "mobile" : s2 === "pc" ? "pc" : "";
}
__name(safeDevice, "safeDevice");
function safeReferrerPath(s2) {
  const raw = String(s2 || "").trim();
  if (!raw || raw[0] !== "/") return "";
  return raw.replace(/[\r\n\t]+/g, "").slice(0, 200);
}
__name(safeReferrerPath, "safeReferrerPath");
function safeReferrerHost(s2) {
  const raw = String(s2 || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.slice(0, 100);
  } catch {
    if (/^[a-z0-9.-]+$/i.test(raw)) return raw.slice(0, 100);
    return "";
  }
}
__name(safeReferrerHost, "safeReferrerHost");
var BOT_UA_RE = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|python|curl|wget|axios|node-fetch|go-http|java\/|okhttp|scrapy|httpclient|libwww|lighthouse|semrush|ahrefs|mj12|petalbot|dataprovider/i;
var SEARCH_REF_RE = /(^|\.)(google|naver|bing|daum|yahoo|yandex|baidu|duckduckgo)\./i;
function isBotUserAgent(userAgent) {
  const ua = String(userAgent || "").trim();
  if (!ua) return true;
  return BOT_UA_RE.test(ua);
}
__name(isBotUserAgent, "isBotUserAgent");
function isSpoofedSearch(referrerHost2, country) {
  const c = String(country || "").toUpperCase();
  if (!c || c === "KR") return false;
  return SEARCH_REF_RE.test(String(referrerHost2 || ""));
}
__name(isSpoofedSearch, "isSpoofedSearch");
var BOT_BURST_ALERT_THRESHOLD = 50;
async function maybeAlertBotBurst(env2, delta, sample) {
  try {
    const cache = caches.default;
    const hourKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
    const countKey = `https://bot-burst.heatmap.internal/count/${hourKey}`;
    const alertKey = `https://bot-burst.heatmap.internal/alert/${hourKey}`;
    const cached = await cache.match(countKey);
    let count3 = cached ? parseInt(await cached.text(), 10) || 0 : 0;
    count3 += delta;
    await cache.put(
      countKey,
      new Response(String(count3), {
        headers: { "cache-control": "max-age=3600" }
      })
    );
    if (count3 < BOT_BURST_ALERT_THRESHOLD) return;
    if (await cache.match(alertKey)) return;
    await cache.put(
      alertKey,
      new Response("1", { headers: { "cache-control": "max-age=3600" } })
    );
    const s2 = sample || {};
    const msg = `[day1design/heatmap] \u{1F916} \uBD07 \uC720\uC785 \uAE09\uC99D \uAC10\uC9C0\xB7\uCC28\uB2E8
\uC704\uC7A5 \uAC80\uC0C9/\uBE44\uC815\uC0C1 \uBD07 \uD2B8\uB798\uD53D\uC744 \uC9D1\uACC4\uC5D0\uC11C \uC790\uB3D9 \uC81C\uC678 \uC911\uC785\uB2C8\uB2E4.

\u2022 \uC2DC\uAC01(UTC): ${escapeHtml((/* @__PURE__ */ new Date()).toISOString())}
\u2022 \uB204\uC801 \uBD07 \uC774\uBCA4\uD2B8(\uC774 \uC5E3\uC9C0/\uC2DC\uAC04): ${count3}\uAC74 (\uC784\uACC4 ${BOT_BURST_ALERT_THRESHOLD})
\u2022 \uD45C\uBCF8 IP: ${escapeHtml(s2.ip || "-")} (${escapeHtml(s2.country || "-")})
\u2022 \uD45C\uBCF8 \uC720\uC785: ${escapeHtml(s2.referrer || "-")} \u2192 ${escapeHtml(s2.page || "-")}

\uC720\uC785\uD1B5\uACC4\uB294 IsBot=0 \uB9CC \uC9D1\uACC4\uD558\uBBC0\uB85C \uC2E4\uC81C \uC218\uCE58 \uC601\uD5A5 \uC5C6\uC74C.
\uAD00\uB9AC\uC790 \u203A \uC720\uC785\uD1B5\uACC4\uC5D0\uC11C \uC815\uC0C1 \uC218\uCE58 \uD655\uC778 \uAC00\uB2A5\uD569\uB2C8\uB2E4.`;
    await notifyInfra(env2, msg);
  } catch (_) {
  }
}
__name(maybeAlertBotBurst, "maybeAlertBotBurst");
async function persistAnalyticsRollups(env2, events) {
  try {
    const statements = buildAnalyticsRollupStatements(env2, events);
    if (statements.length > 0) await env2.DB.batch(statements);
  } catch (error3) {
    try {
      const code = escapeHtml(
        String(error3?.message || error3 || "unknown")
      ).slice(0, 240);
      await notifyInfra(
        env2,
        `<b>Analytics rollup write failed</b>
\u2022 Code: ${code}
\u2022 Raw heatmap events remain stored; run the rollup repair script.`
      );
    } catch {
    }
  }
}
__name(persistAnalyticsRollups, "persistAnalyticsRollups");
async function handleHeatmap(request, env2, ctx, services) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/heatmap/, "") || "/";
  if (path === "/track") {
    if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
    return trackEvents(request, env2, ctx);
  }
  if (path === "/events") {
    if (request.method !== "GET") return jsonError(405, "Method Not Allowed");
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return listEvents(request, env2);
  }
  if (path === "/pages") {
    if (request.method !== "GET") return jsonError(405, "Method Not Allowed");
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return listPages(request, env2);
  }
  if (path === "/screenshots") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    if (request.method === "POST") return upsertScreenshot(request, env2);
    if (request.method === "GET") return listScreenshots(request, env2);
    return jsonError(405, "Method Not Allowed");
  }
  return jsonError(404, "Not Found");
}
__name(handleHeatmap, "handleHeatmap");
async function trackEvents(request, env2, ctx) {
  if (!validateContentType(request)) {
    return jsonError(415, "Unsupported Media Type");
  }
  const ip = clientIP(request);
  const rl = await heatmapRateLimit(ip);
  if (!rl.allowed) return jsonError(429, "Too Many Requests");
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const events = Array.isArray(body?.events) ? body.events : null;
  if (!events || events.length === 0) return jsonError(400, "events required");
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return jsonError(400, `Too many events (max ${MAX_EVENTS_PER_REQUEST})`);
  }
  const cf = request.cf || {};
  const country = safeStr(cf.country, 4);
  const region = safeStr(cf.region, 80);
  const city = safeStr(cf.city, 80);
  const nowIso3 = (/* @__PURE__ */ new Date()).toISOString();
  const uaBot = isBotUserAgent(request.headers.get("user-agent"));
  const rawRows = [];
  const rollupEvents = [];
  let accepted = 0;
  let botCount = 0;
  let botSample = null;
  for (const e of events) {
    const type = e?.type;
    if (type !== "click" && type !== "scroll" && type !== "page_view") continue;
    const page = safePage(e.page);
    if (!page) continue;
    const device = safeDevice(e.device);
    if (!device) continue;
    const xPct = type === "click" ? clamp01(e.x_pct) : null;
    const yPct = type === "click" ? clamp01(e.y_pct) : null;
    const sdPct = type === "scroll" ? clamp01(e.scroll_depth_pct) : null;
    if (type === "click" && (xPct === null || yPct === null)) continue;
    if (type === "scroll" && sdPct === null) continue;
    const id2 = generateId();
    const refHost = safeReferrerHost(e.referrer);
    const refPath = refHost ? safeReferrerPath(e.referrer_path) : "";
    const sessionId = safeStr(e.session_id, 64);
    const utmSource = safeStr(e?.utm?.source, 100);
    const utmMedium = safeStr(e?.utm?.medium, 100);
    const utmCampaign = safeStr(e?.utm?.campaign, 100);
    const inflowApp = safeInflowApp(e.inflow_app);
    const evIsBot = uaBot || isSpoofedSearch(refHost, country) ? 1 : 0;
    if (evIsBot) {
      botCount++;
      if (!botSample) {
        botSample = { ip, country, referrer: refHost, page };
      }
    }
    rawRows.push([
      id2,
      SOURCE_TENANT_ID2,
      page,
      type,
      device,
      xPct,
      yPct,
      sdPct,
      clampInt(e.page_w, 3e4),
      clampInt(e.page_h, 1e5),
      clampInt(e.viewport_w, 3e4),
      clampInt(e.viewport_h, 3e4),
      sessionId,
      ip,
      country,
      region,
      city,
      refHost,
      refPath,
      utmSource,
      utmMedium,
      utmCampaign,
      nowIso3,
      evIsBot,
      inflowApp
    ]);
    rollupEvents.push({
      id: id2,
      type,
      page,
      device,
      sessionId,
      country,
      region,
      city,
      referrer: refHost,
      utmSource,
      utmMedium,
      utmCampaign,
      createdAt: nowIso3,
      isBot: evIsBot === 1
    });
    accepted++;
  }
  if (rawRows.length === 0) return jsonOk({ accepted: 0 });
  try {
    await env2.DB.batch(buildHeatmapInsertStatements(env2, rawRows));
  } catch (err) {
    return jsonError(500, "DB error", { detail: String(err?.message || err) });
  }
  const rollupWrite = persistAnalyticsRollups(env2, rollupEvents);
  if (ctx?.waitUntil) ctx.waitUntil(rollupWrite);
  else await rollupWrite;
  if (botCount > 0 && ctx?.waitUntil) {
    ctx.waitUntil(maybeAlertBotBurst(env2, botCount, botSample));
  }
  return jsonOk({ accepted });
}
__name(trackEvents, "trackEvents");
async function listEvents(request, env2) {
  const url = new URL(request.url);
  const page = safePage(url.searchParams.get("page") || "");
  const device = safeDevice(url.searchParams.get("device") || "");
  const eventType = url.searchParams.get("type") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "5000"),
    5e3
  );
  const where = ["IsBot = 0"];
  const args = [];
  if (page) {
    where.push("Page = ?");
    args.push(page);
  }
  if (device === "pc" || device === "mobile") {
    where.push("Device = ?");
    args.push(device);
  }
  if (eventType === "click" || eventType === "scroll") {
    where.push("EventType = ?");
    args.push(eventType);
  }
  if (from) {
    where.push("CreatedAt >= ?");
    args.push(from);
  }
  if (to) {
    where.push("CreatedAt <= ?");
    args.push(to);
  }
  const sql = `
    SELECT id, Page, EventType, Device, XPct, YPct, ScrollDepthPct,
           PageW, PageH, ViewportW, ViewportH,
           Country, Region, City, Referrer, UtmSource,
           CreatedAt
    FROM HeatmapEvents
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY CreatedAt DESC
    LIMIT ?
  `;
  const res = await env2.DB.prepare(sql).bind(...args, limit).all();
  return jsonOk({ events: res.results || [] });
}
__name(listEvents, "listEvents");
async function listPages(request, env2) {
  const sql = `
    SELECT
      Page,
      SUM(CASE WHEN Device='pc' THEN 1 ELSE 0 END) AS PcEvents,
      SUM(CASE WHEN Device='mobile' THEN 1 ELSE 0 END) AS MobileEvents,
      SUM(CASE WHEN EventType='click' THEN 1 ELSE 0 END) AS Clicks,
      SUM(CASE WHEN EventType='scroll' THEN 1 ELSE 0 END) AS Scrolls,
      SUM(CASE WHEN EventType='page_view' THEN 1 ELSE 0 END) AS PageViews,
      COUNT(DISTINCT SessionId) AS UniqueSessions,
      MAX(CreatedAt) AS LastEventAt
    FROM HeatmapEvents
    WHERE IsBot = 0
    GROUP BY Page
    ORDER BY Clicks DESC, Scrolls DESC
  `;
  const eventsRes = await env2.DB.prepare(sql).all();
  const shotsRes = await env2.DB.prepare(
    `SELECT Page, Device, Url, PageW, PageH, CapturedAt FROM HeatmapScreenshots`
  ).all();
  return jsonOk({
    pages: eventsRes.results || [],
    screenshots: shotsRes.results || []
  });
}
__name(listPages, "listPages");
async function listScreenshots(request, env2) {
  const res = await env2.DB.prepare(
    `SELECT Page, Device, Url, PageW, PageH, CapturedAt FROM HeatmapScreenshots ORDER BY Page, Device`
  ).all();
  return jsonOk({ screenshots: res.results || [] });
}
__name(listScreenshots, "listScreenshots");
async function upsertScreenshot(request, env2) {
  if (!validateContentType(request))
    return jsonError(415, "Unsupported Media Type");
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const page = safePage(body?.page);
  const device = safeDevice(body?.device);
  if (!page || !device) return jsonError(400, "page/device required");
  const url = safeStr(body?.url, 500);
  if (!url) return jsonError(400, "url required");
  const pageW = clampInt(body?.page_w, 3e4);
  const pageH = clampInt(body?.page_h, 1e5);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await env2.DB.prepare(
    `INSERT INTO HeatmapScreenshots (Page, Device, Url, PageW, PageH, CapturedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(Page, Device) DO UPDATE SET
       Url=excluded.Url, PageW=excluded.PageW, PageH=excluded.PageH, CapturedAt=excluded.CapturedAt`
  ).bind(page, device, url, pageW, pageH, now).run();
  return jsonOk({ ok: true });
}
__name(upsertScreenshot, "upsertScreenshot");

// src/routes/exit-guard.js
var RATE_LIMIT_PER_HOUR2 = 300;
var MAX_EVENTS_PER_REQUEST2 = 5;
var EVENT_TYPES = /* @__PURE__ */ new Set([
  "shown",
  // 팝업 노출
  "submit",
  // 이름·연락처 입력 후 견적 폼으로 이동
  "form_view",
  // 견적 폼에 실제로 도착
  "stayed",
  // 팝업을 닫고 사이트에 계속 머묾 (= 이탈을 막음)
  "dismissed",
  // "다음에 볼게요" 로 나감
  "escaped"
  // 팝업이 뜬 상태에서 뒤로가기로 나감
]);
var HELD_TYPES = ["submit", "form_view", "stayed"];
async function guardRateLimit(ip) {
  const cache = caches.default;
  const key = `https://rate-limit.exitguard.internal/${ip}`;
  const cached = await cache.match(key);
  let count3 = 0;
  if (cached) count3 = parseInt(await cached.text() || "0", 10) || 0;
  count3++;
  if (count3 > RATE_LIMIT_PER_HOUR2) return { allowed: false, count: count3 };
  await cache.put(
    key,
    new Response(String(count3), {
      headers: { "cache-control": "max-age=3600" }
    })
  );
  return { allowed: true, count: count3 };
}
__name(guardRateLimit, "guardRateLimit");
async function handleExitGuard(request, env2, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/exit-guard/, "") || "/";
  if (path === "/track" && request.method === "POST") {
    return trackEvents2(request, env2, ctx);
  }
  if (path === "/stats" && request.method === "GET") {
    if (!await verifyAdmin(request, env2))
      return jsonError(401, "Unauthorized");
    return stats(request, env2);
  }
  return jsonError(404, "Not found");
}
__name(handleExitGuard, "handleExitGuard");
async function trackEvents2(request, env2, ctx) {
  const ip = clientIP(request);
  if (!validateContentType(request)) return jsonError(415, "Unsupported type");
  const rl = await guardRateLimit(ip);
  if (!rl.allowed) return jsonError(429, "Too many requests");
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST2) : [];
  if (!events.length) return jsonOk({ stored: 0 });
  const cf = request.cf || {};
  const country = safeStr(cf.country, 2);
  const region = safeStr(cf.region, 100);
  const city = safeStr(cf.city, 100);
  const uaBot = isBotUserAgent(request.headers.get("user-agent"));
  const nowIso3 = (/* @__PURE__ */ new Date()).toISOString();
  const dayKey2 = nowIso3.slice(0, 10);
  const rows = [];
  for (const e of events) {
    const type = String(e?.type || "");
    if (!EVENT_TYPES.has(type)) continue;
    const page = safePage(e.page);
    if (!page) continue;
    const refHost = safeReferrerHost(e.referrer);
    const isBot = uaBot || isSpoofedSearch(refHost, country) ? 1 : 0;
    rows.push([
      generateId(),
      safeStr(e.session_id, 64),
      type,
      page,
      safeDevice(e.device),
      Math.max(0, Math.min(99, parseInt(e.shown_seq, 10) || 0)),
      Math.max(0, Math.min(864e5, parseInt(e.held_ms, 10) || 0)),
      refHost,
      refHost ? safeReferrerPath(e.referrer_path) : "",
      safeStr(e?.utm?.source, 100),
      safeStr(e?.utm?.medium, 100),
      safeStr(e?.utm?.campaign, 100),
      safeInflowApp(e.inflow_app),
      ip,
      country,
      region,
      city,
      isBot,
      nowIso3,
      dayKey2
    ]);
  }
  if (!rows.length) return jsonOk({ stored: 0 });
  const values = rows.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(", ");
  const stmt = env2.DB.prepare(
    `INSERT INTO ExitGuardEvents
       (id, SessionId, EventType, Page, Device, ShownSeq, HeldMs,
        Referrer, RefPath, UtmSource, UtmMedium, UtmCampaign, InflowApp,
        IP, Country, Region, City, IsBot, CreatedAt, DayKey)
     VALUES ${values}`
  ).bind(...rows.flat());
  ctx.waitUntil(stmt.run().catch(() => {
  }));
  return jsonOk({ stored: rows.length });
}
__name(trackEvents2, "trackEvents");
async function stats(request, env2) {
  const url = new URL(request.url);
  const days = Math.min(
    365,
    Math.max(1, parseInt(url.searchParams.get("days"), 10) || 30)
  );
  const sinceIso = new Date(Date.now() - days * 864e5).toISOString();
  const sinceDay = sinceIso.slice(0, 10);
  const heldList = HELD_TYPES.map((t) => `'${t}'`).join(",");
  const [byType, byDay, byChannel, retention, converted] = await env2.DB.batch([
    env2.DB.prepare(
      `SELECT EventType, COUNT(*) AS n, COUNT(DISTINCT SessionId) AS sessions
         FROM ExitGuardEvents
        WHERE IsBot = 0 AND DayKey >= ?
        GROUP BY EventType`
    ).bind(sinceDay),
    env2.DB.prepare(
      `SELECT DayKey,
              SUM(CASE WHEN EventType = 'shown' THEN 1 ELSE 0 END) AS shown,
              SUM(CASE WHEN EventType IN (${heldList}) THEN 1 ELSE 0 END) AS held
         FROM ExitGuardEvents
        WHERE IsBot = 0 AND DayKey >= ?
        GROUP BY DayKey
        ORDER BY DayKey`
    ).bind(sinceDay),
    env2.DB.prepare(
      `SELECT CASE WHEN UtmSource <> '' THEN UtmSource
                   WHEN Referrer <> '' THEN Referrer
                   ELSE '(direct)' END AS channel,
              SUM(CASE WHEN EventType = 'shown' THEN 1 ELSE 0 END) AS shown,
              SUM(CASE WHEN EventType IN (${heldList}) THEN 1 ELSE 0 END) AS held
         FROM ExitGuardEvents
        WHERE IsBot = 0 AND DayKey >= ?
        GROUP BY channel
        ORDER BY shown DESC
        LIMIT 15`
    ).bind(sinceDay),
    // 붙잡은 뒤 실제로 더 봤는가 — 노출 시각 이후 같은 세션의 page_view 수.
    // 이 수치가 "얼마나 방문이 유지됐는가" 의 직접 측정이다.
    env2.DB.prepare(
      `SELECT COUNT(*) AS held_sessions,
              SUM(after_views) AS after_views,
              SUM(CASE WHEN after_views > 0 THEN 1 ELSE 0 END) AS with_more
         FROM (
           SELECT g.SessionId,
                  (SELECT COUNT(*) FROM HeatmapEvents h
                    WHERE h.SessionId = g.SessionId
                      AND h.EventType = 'page_view'
                      AND h.IsBot = 0
                      AND h.CreatedAt > g.first_shown) AS after_views
             FROM (SELECT SessionId, MIN(CreatedAt) AS first_shown
                     FROM ExitGuardEvents
                    WHERE IsBot = 0 AND DayKey >= ? AND EventType = 'shown'
                      AND SessionId <> ''
                    GROUP BY SessionId) g
         )`
    ).bind(sinceDay),
    // 팝업을 거쳐 실제 접수까지 간 건수 (작성중 = 아직 미완주)
    env2.DB.prepare(
      `SELECT COUNT(*) AS completed,
              SUM(CASE WHEN Status = '\uC791\uC131\uC911' THEN 1 ELSE 0 END) AS pending
         FROM Estimates
        WHERE FormType = 'exit_guard' AND SubmittedAt >= ?`
    ).bind(sinceIso)
  ]);
  const counts = {};
  const sessions = {};
  for (const r of byType.results || []) {
    counts[r.EventType] = r.n || 0;
    sessions[r.EventType] = r.sessions || 0;
  }
  const shown = counts.shown || 0;
  const held = HELD_TYPES.reduce((sum, t) => sum + (counts[t] || 0), 0);
  const ret = (retention.results || [])[0] || {};
  const conv = (converted.results || [])[0] || {};
  const completed = conv.completed || 0;
  const pending = conv.pending || 0;
  return jsonOk({
    days,
    funnel: {
      shown,
      shownSessions: sessions.shown || 0,
      held,
      stayed: counts.stayed || 0,
      submit: counts.submit || 0,
      formView: counts.form_view || 0,
      dismissed: counts.dismissed || 0,
      escaped: counts.escaped || 0,
      // 팝업을 거쳐 견적 접수를 끝낸 건수 (Estimates 기준, 작성중 제외)
      completed: Math.max(0, completed - pending),
      pending,
      holdRate: shown ? Math.round(held / shown * 1e3) / 10 : 0
    },
    retention: {
      heldSessions: ret.held_sessions || 0,
      // 붙잡힌 뒤 페이지를 더 본 세션 수와 그 총 페이지뷰
      sessionsWithMoreViews: ret.with_more || 0,
      afterViews: ret.after_views || 0,
      avgAfterViews: ret.held_sessions > 0 ? Math.round((ret.after_views || 0) / ret.held_sessions * 100) / 100 : 0
    },
    daily: (byDay.results || []).map((r) => ({
      day: r.DayKey,
      shown: r.shown || 0,
      held: r.held || 0
    })),
    channels: (byChannel.results || []).map((r) => ({
      channel: r.channel,
      shown: r.shown || 0,
      held: r.held || 0
    }))
  });
}
__name(stats, "stats");

// src/routes/audit.js
var DEFAULT_LIMIT = 50;
var MAX_LIMIT = 200;
async function handleAudit(request, env2) {
  if (!await verifyAdmin(request, env2)) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/audit/, "") || "/";
  if (path === "/logs" && request.method === "GET") {
    return listLogs(url, env2);
  }
  return jsonError(404, "Not Found");
}
__name(handleAudit, "handleAudit");
async function listLogs(url, env2) {
  if (!env2.DB) return jsonError(500, "DB unavailable");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const type = (url.searchParams.get("type") || "").slice(0, 60);
  const severity = (url.searchParams.get("severity") || "").slice(0, 16);
  const from = (url.searchParams.get("from") || "").slice(0, 32);
  const to = (url.searchParams.get("to") || "").slice(0, 32);
  const q2 = (url.searchParams.get("q") || "").slice(0, 80);
  const where = [];
  const params = [];
  if (type) {
    where.push("Type = ?");
    params.push(type);
  }
  if (severity) {
    where.push("Severity = ?");
    params.push(severity);
  }
  if (from) {
    where.push("CreatedAt >= ?");
    params.push(from);
  }
  if (to) {
    where.push("CreatedAt <= ?");
    params.push(to);
  }
  if (q2) {
    where.push(
      "(IP LIKE ? OR Username LIKE ? OR Message LIKE ? OR Path LIKE ?)"
    );
    const like = `%${q2}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRes = await env2.DB.prepare(
    `SELECT COUNT(*) AS total FROM AdminAuditLogs ${whereSql}`
  ).bind(...params).first();
  const total = Number(countRes?.total || 0);
  const rowsRes = await env2.DB.prepare(
    `SELECT * FROM AdminAuditLogs ${whereSql}
     ORDER BY CreatedAt DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();
  return jsonOk({
    total,
    limit,
    offset,
    records: rowsRes.results || []
  });
}
__name(listLogs, "listLogs");

// src/routes/memos.js
function normalizePhone2(s2) {
  return String(s2 || "").replace(/\D/g, "");
}
__name(normalizePhone2, "normalizePhone");
async function handleMemos(request, env2, ctx, estimateId, memoId, services = createServices(env2)) {
  if (!await verifyAdmin(request, env2)) return jsonError(401, "Unauthorized");
  if (request.method === "GET") return listMemos(env2, estimateId, services);
  if (request.method === "POST")
    return createMemo(request, env2, estimateId, services);
  if (memoId && request.method === "PATCH")
    return updateMemo(request, env2, memoId, services);
  if (memoId && request.method === "DELETE")
    return deleteMemo(env2, memoId, services);
  return jsonError(404, "Not Found");
}
__name(handleMemos, "handleMemos");
async function listMemos(env2, estimateId, services) {
  const records = await services.estimateMemos.listAll({
    where: { EstimateId: estimateId },
    sort: [{ field: "CreatedAt", direction: "asc" }]
  });
  const memos = records.map((r) => ({
    id: r.id,
    estimateId: r.fields.EstimateId || "",
    body: r.fields.Body || "",
    author: r.fields.Author || "",
    createdAt: r.fields.CreatedAt || "",
    updatedAt: r.fields.UpdatedAt || ""
  }));
  return jsonOk({ memos });
}
__name(listMemos, "listMemos");
async function createMemo(request, env2, estimateId, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const text = String(body.body || "").trim();
  if (!text) return jsonError(400, "Body required");
  if (text.length > 4e3) return jsonError(400, "Body too long");
  const author = String(body.author || "").trim().slice(0, 40);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = await services.estimateMemos.create({
    EstimateId: estimateId,
    Body: text,
    Author: author,
    CreatedAt: now,
    UpdatedAt: now
  });
  return jsonOk({
    memo: {
      id: record.id,
      estimateId,
      body: text,
      author,
      createdAt: now,
      updatedAt: now
    }
  });
}
__name(createMemo, "createMemo");
async function updateMemo(request, env2, memoId, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const text = String(body.body || "").trim();
  if (!text) return jsonError(400, "Body required");
  if (text.length > 4e3) return jsonError(400, "Body too long");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = await services.estimateMemos.update(memoId, {
    Body: text,
    UpdatedAt: now
  });
  return jsonOk({
    memo: {
      id: record.id,
      estimateId: record.fields.EstimateId || "",
      body: record.fields.Body || "",
      author: record.fields.Author || "",
      createdAt: record.fields.CreatedAt || "",
      updatedAt: record.fields.UpdatedAt || ""
    }
  });
}
__name(updateMemo, "updateMemo");
async function deleteMemo(env2, memoId, services) {
  await services.estimateMemos.delete(memoId);
  return jsonOk({ deleted: memoId });
}
__name(deleteMemo, "deleteMemo");
async function handleHistory(request, env2, ctx, estimateId, services = createServices(env2)) {
  if (!await verifyAdmin(request, env2)) return jsonError(401, "Unauthorized");
  let current;
  try {
    current = await services.estimates.get(estimateId);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Estimate not found");
    throw e;
  }
  const myPhoneDigits = normalizePhone2(current.fields.Phone);
  const myEmail = String(current.fields.Email || "").trim().toLowerCase();
  if (!myPhoneDigits && !myEmail) {
    return jsonOk({ sessionNo: 1, previous: [] });
  }
  const all = await services.estimates.listAll({
    sort: [{ field: "SubmittedAt", direction: "asc" }]
  });
  const matched = all.filter((r) => {
    const p = normalizePhone2(r.fields.Phone);
    const e = String(r.fields.Email || "").trim().toLowerCase();
    if (myPhoneDigits && p && p === myPhoneDigits) return true;
    if (myEmail && e && e === myEmail) return true;
    return false;
  });
  const sessionNo = matched.findIndex((r) => r.id === estimateId) + 1 || matched.length;
  const previous = matched.filter((r) => r.id !== estimateId).map((r) => ({
    id: r.id,
    submittedAt: r.fields.SubmittedAt || "",
    source: r.fields.Source || "homepage",
    status: r.fields.Status || "",
    branch: r.fields.Branch || "",
    spaceType: r.fields.SpaceType || "",
    spaceSize: r.fields.SpaceSize || ""
  })).sort((a, b) => a.submittedAt < b.submittedAt ? 1 : -1);
  const prevLatest = previous[0] || null;
  return jsonOk({
    sessionNo,
    total: matched.length,
    previous,
    previousLatest: prevLatest
  });
}
__name(handleHistory, "handleHistory");

// src/routes/sms.js
var TEMPLATE_NAME_MAX = 60;
var TEMPLATE_SUBJECT_MAX = 40;
var TEMPLATE_CONTENT_MAX = 2e3;
var LOG_LIST_LIMIT = 200;
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function sanitize(value, max) {
  return String(value ?? "").replace(/\r/g, "").slice(0, max).trim();
}
__name(sanitize, "sanitize");
function normalizePhone3(p) {
  return String(p || "").replace(/\D/g, "");
}
__name(normalizePhone3, "normalizePhone");
function validateTemplatePayload(body) {
  const errors = [];
  const name = sanitize(body?.Name, TEMPLATE_NAME_MAX);
  const subject = sanitize(body?.Subject, TEMPLATE_SUBJECT_MAX);
  const content = sanitize(body?.Content, TEMPLATE_CONTENT_MAX);
  if (!name) errors.push("Name");
  if (!subject) errors.push("Subject");
  if (!content) errors.push("Content");
  return { errors, fields: { Name: name, Subject: subject, Content: content } };
}
__name(validateTemplatePayload, "validateTemplatePayload");
async function handleSms(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/sms/, "") || "/";
  if (!await verifyAdmin(request, env2)) {
    return jsonError(401, "Unauthorized");
  }
  if (path === "/templates") {
    if (request.method === "GET") return listTemplates(env2, services);
    if (request.method === "POST") return createTemplate(request, services);
    return jsonError(405, "Method Not Allowed");
  }
  const tplMatch = path.match(/^\/templates\/([a-zA-Z0-9_-]+)$/);
  if (tplMatch) {
    const id2 = tplMatch[1];
    if (request.method === "PATCH")
      return updateTemplate(request, services, id2);
    if (request.method === "DELETE") return deleteTemplate(services, id2);
    return jsonError(405, "Method Not Allowed");
  }
  if (path === "/logs") {
    if (request.method !== "GET") return jsonError(405, "Method Not Allowed");
    return listLogs2(env2, services, url);
  }
  if (path === "/send") {
    if (request.method !== "POST") return jsonError(405, "Method Not Allowed");
    return sendMessage(request, env2, ctx, services);
  }
  return jsonError(404, "Not Found");
}
__name(handleSms, "handleSms");
async function listTemplates(env2, services) {
  const records = await services.messageTemplates.listAll({
    sort: [{ field: "UpdatedAt", direction: "desc" }]
  });
  return jsonOk({
    records: records.map((r) => ({ id: r.id, ...r.fields }))
  });
}
__name(listTemplates, "listTemplates");
async function createTemplate(request, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const { errors, fields } = validateTemplatePayload(body);
  if (errors.length) return jsonError(400, "Validation failed", { errors });
  const now = nowIso();
  const record = await services.messageTemplates.create({
    ...fields,
    CreatedAt: now,
    UpdatedAt: now
  });
  return jsonOk({ id: record.id, ...record.fields });
}
__name(createTemplate, "createTemplate");
async function updateTemplate(request, services, id2) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const { errors, fields } = validateTemplatePayload(body);
  if (errors.length) return jsonError(400, "Validation failed", { errors });
  let record;
  try {
    record = await services.messageTemplates.update(id2, {
      ...fields,
      UpdatedAt: nowIso()
    });
  } catch (e) {
    if (e.notFound) return jsonError(404, "Template not found");
    throw e;
  }
  return jsonOk({ id: record.id, ...record.fields });
}
__name(updateTemplate, "updateTemplate");
async function deleteTemplate(services, id2) {
  try {
    await services.messageTemplates.delete(id2);
  } catch (e) {
    if (e.notFound) return jsonError(404, "Template not found");
    throw e;
  }
  return jsonOk({ deleted: true, id: id2 });
}
__name(deleteTemplate, "deleteTemplate");
async function listLogs2(env2, services, url) {
  const estimateId = url.searchParams.get("estimateId");
  const where = estimateId ? { EstimateId: estimateId } : void 0;
  const records = await services.smsLogs.listAll({
    where,
    sort: [{ field: "SentAt", direction: "desc" }]
  });
  return jsonOk({
    records: records.slice(0, LOG_LIST_LIMIT).map((r) => ({
      id: r.id,
      ...r.fields
    }))
  });
}
__name(listLogs2, "listLogs");
async function sendMessage(request, env2, ctx, services) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const toPhone = normalizePhone3(body?.to);
  const subject = sanitize(body?.subject, TEMPLATE_SUBJECT_MAX);
  const content = sanitize(body?.content, TEMPLATE_CONTENT_MAX);
  const estimateId = sanitize(body?.estimateId, 32);
  const templateId = sanitize(body?.templateId, 32);
  const errors = [];
  if (!/^010\d{7,8}$/.test(toPhone)) errors.push("to");
  if (!subject) errors.push("subject");
  if (!content) errors.push("content");
  if (errors.length) return jsonError(400, "Validation failed", { errors });
  const result = await sendNcpSens(env2, {
    to: toPhone,
    subject,
    content,
    type: "LMS"
  });
  const sentAt = nowIso();
  const ip = clientIP(request);
  let status;
  let detail;
  if (result.ok) {
    status = "sent";
    detail = `status=${result.status || ""}`;
  } else if (result.skipped) {
    status = "skipped";
    detail = `reason=${result.reason || ""}`;
  } else {
    status = "failed";
    detail = `status=${result.status || ""} body=${(result.body || "").slice(0, 160)}`;
  }
  const log3 = await services.smsLogs.create({
    EstimateId: estimateId,
    TemplateId: templateId,
    ToPhone: toPhone,
    Subject: subject,
    Content: content,
    SmsType: "LMS",
    Status: status,
    Detail: detail.slice(0, 480),
    SentAt: sentAt,
    SentBy: ip
  });
  if (env2.IMAGES) {
    const d = new Date(sentAt);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const r2Key = `sms-logs/${yyyy}/${mm}/${dd}/${log3.id}.json`;
    const archive = {
      id: log3.id,
      estimateId,
      templateId,
      to: toPhone,
      subject,
      content,
      smsType: "LMS",
      status,
      detail,
      sentAt,
      sentBy: ip
    };
    ctx.waitUntil(
      env2.IMAGES.put(r2Key, JSON.stringify(archive, null, 2), {
        httpMetadata: { contentType: "application/json; charset=utf-8" }
      }).catch(() => {
      })
    );
  }
  if (status === "failed") {
    ctx.waitUntil(
      notifyTelegram(
        env2,
        `[day1design/sms] \uBC1C\uC1A1 \uC2E4\uD328
to: ${toPhone}
${detail.slice(0, 200)}`
      )
    );
  }
  return jsonOk({
    sent: status === "sent",
    status,
    detail,
    logId: log3.id
  });
}
__name(sendMessage, "sendMessage");

// src/routes/marketing.js
var SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/i;
var COOKIE_NAME2 = "d1d_src";
var COOKIE_MAX_AGE2 = 60 * 60 * 24 * 30;
var SOURCE_DOMAIN = ".day1design.co.kr";
var HOME_FALLBACK = "https://day1design.co.kr/";
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso2, "nowIso");
function kstDateKey(date = /* @__PURE__ */ new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1e3);
  return kst.toISOString().slice(0, 10);
}
__name(kstDateKey, "kstDateKey");
function sanitizeText2(value, max = 120) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ").slice(0, max);
}
__name(sanitizeText2, "sanitizeText");
function deriveUtm(label) {
  const slug = String(label || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return slug || "marketing";
}
__name(deriveUtm, "deriveUtm");
var PREVIEW_REFERRER_RE = /(^|\.)(adsmanager|business)\.facebook\.com$/i;
function isInternalPreview(request) {
  try {
    const referer = request.headers.get("referer") || "";
    if (!referer) return false;
    return PREVIEW_REFERRER_RE.test(new URL(referer).hostname);
  } catch {
    return false;
  }
}
__name(isInternalPreview, "isInternalPreview");
function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
__name(isHttpUrl, "isHttpUrl");
function rowToView(row) {
  if (!row) return null;
  return {
    slug: row.Slug,
    sourceLabel: row.SourceLabel || "",
    targetUrl: row.TargetUrl || "",
    utmSource: row.UtmSource || "",
    utmMedium: row.UtmMedium || "",
    utmCampaign: row.UtmCampaign || "",
    active: !!row.Active,
    clicks: row.Clicks || 0,
    lastClickAt: row.LastClickAt || "",
    createdAt: row.CreatedAt || "",
    updatedAt: row.UpdatedAt || "",
    createdBy: row.CreatedBy || "",
    deletedAt: row.DeletedAt || "",
    archived: !!(row.DeletedAt && row.DeletedAt.length)
  };
}
__name(rowToView, "rowToView");
async function handleSlugRedirect(request, env2, ctx, slug) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const cleanSlug = String(slug || "").toLowerCase();
  if (!SLUG_RE.test(cleanSlug)) {
    return Response.redirect(HOME_FALLBACK, 302);
  }
  const row = await env2.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? AND Active = 1 AND DeletedAt = '' LIMIT 1"
  ).bind(cleanSlug).first();
  if (!row) {
    return Response.redirect(HOME_FALLBACK, 302);
  }
  const target = isHttpUrl(row.TargetUrl) ? row.TargetUrl : HOME_FALLBACK;
  const utmSource = row.UtmSource || deriveUtm(row.SourceLabel);
  const utmMedium = row.UtmMedium || "marketing-slug";
  const utmCampaign = row.UtmCampaign || cleanSlug;
  let dest;
  try {
    dest = new URL(target);
  } catch {
    dest = new URL(HOME_FALLBACK);
  }
  if (isInternalPreview(request)) {
    const headers2 = new Headers();
    headers2.set("location", dest.toString());
    headers2.set("cache-control", "no-store");
    return new Response(null, { status: 302, headers: headers2 });
  }
  if (!dest.searchParams.get("utm_source")) {
    dest.searchParams.set("utm_source", utmSource);
  }
  if (!dest.searchParams.get("utm_medium")) {
    dest.searchParams.set("utm_medium", utmMedium);
  }
  if (!dest.searchParams.get("utm_campaign")) {
    dest.searchParams.set("utm_campaign", utmCampaign);
  }
  dest.searchParams.set("src", row.SourceLabel || cleanSlug);
  const ts = nowIso2();
  const dateKey = kstDateKey();
  const sourceLabel = row.SourceLabel || cleanSlug;
  const updateTask = env2.DB.batch([
    env2.DB.prepare(
      "UPDATE MarketingSlugs SET Clicks = Clicks + 1, LastClickAt = ? WHERE Slug = ?"
    ).bind(ts, cleanSlug),
    env2.DB.prepare(
      `INSERT INTO MarketingSlugDaily (Date, Slug, SourceLabel, Clicks, LastClickAt)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(Date, Slug) DO UPDATE SET
         Clicks = Clicks + 1,
         LastClickAt = excluded.LastClickAt,
         SourceLabel = excluded.SourceLabel`
    ).bind(dateKey, cleanSlug, sourceLabel, ts)
  ]).catch(() => {
  });
  if (ctx && ctx.waitUntil) ctx.waitUntil(updateTask);
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      label: row.SourceLabel || cleanSlug,
      slug: cleanSlug,
      utm: {
        source: utmSource,
        medium: utmMedium,
        campaign: utmCampaign
      },
      ts: nowIso2()
    })
  );
  const headers = new Headers();
  headers.set("location", dest.toString());
  headers.set(
    "set-cookie",
    `${COOKIE_NAME2}=${cookieValue}; Domain=${SOURCE_DOMAIN}; Path=/; Max-Age=${COOKIE_MAX_AGE2}; Secure; SameSite=Lax`
  );
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}
__name(handleSlugRedirect, "handleSlugRedirect");
async function handleMarketingLinks(request, env2, ctx) {
  if (!await verifyAdmin(request, env2)) {
    return jsonError(401, "Unauthorized");
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/marketing-links/, "");
  const method = request.method;
  if ((path === "" || path === "/") && method === "GET") {
    return listLinks(env2, url);
  }
  if ((path === "" || path === "/") && method === "POST") {
    return createLink(request, env2);
  }
  const dailyMatch = path.match(/^\/([a-z0-9-]+)\/daily$/i);
  if (dailyMatch && method === "GET") {
    return listDaily(env2, dailyMatch[1].toLowerCase(), url);
  }
  const match = path.match(/^\/([a-z0-9-]+)$/i);
  if (match) {
    const slug = match[1].toLowerCase();
    if (method === "GET") return getLink(env2, slug);
    if (method === "PATCH") return updateLink(request, env2, slug);
    if (method === "DELETE") return deleteLink(env2, slug);
  }
  return jsonError(404, "Not Found");
}
__name(handleMarketingLinks, "handleMarketingLinks");
async function listLinks(env2, url) {
  const archived = url?.searchParams.get("archived") === "1";
  const all = url?.searchParams.get("all") === "1";
  let where = "WHERE DeletedAt = ''";
  if (archived) where = "WHERE DeletedAt <> ''";
  if (all) where = "";
  const { results } = await env2.DB.prepare(
    `SELECT * FROM MarketingSlugs ${where} ORDER BY UpdatedAt DESC, CreatedAt DESC`
  ).all();
  const items = (results || []).map(rowToView);
  const labels = items.map((i) => i.sourceLabel).filter(Boolean);
  let conversionMap = {};
  if (labels.length) {
    const placeholders = labels.map(() => "?").join(",");
    const { results: convRows } = await env2.DB.prepare(
      `SELECT Referral AS label, COUNT(*) AS n FROM Estimates WHERE Referral IN (${placeholders}) GROUP BY Referral`
    ).bind(...labels).all();
    for (const r of convRows || []) conversionMap[r.label] = r.n;
  }
  const enriched = items.map((i) => ({
    ...i,
    conversions: conversionMap[i.sourceLabel] || 0
  }));
  return jsonOk({ items: enriched });
}
__name(listLinks, "listLinks");
async function getLink(env2, slug) {
  const row = await env2.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? LIMIT 1"
  ).bind(slug).first();
  if (!row) return jsonError(404, "Not Found");
  return jsonOk({ item: rowToView(row) });
}
__name(getLink, "getLink");
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
__name(readJson, "readJson");
function normalizeSlugInput(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
__name(normalizeSlugInput, "normalizeSlugInput");
async function createLink(request, env2) {
  const body = await readJson(request);
  if (!body) return jsonError(400, "Invalid JSON");
  const slug = normalizeSlugInput(body.slug);
  const sourceLabel = sanitizeText2(body.sourceLabel, 80);
  const targetUrl = sanitizeText2(body.targetUrl, 500);
  if (!slug || !SLUG_RE.test(slug)) {
    return jsonError(400, "slug must be 1-64 chars: a-z, 0-9, -");
  }
  if (!sourceLabel) return jsonError(400, "sourceLabel required");
  if (!isHttpUrl(targetUrl)) return jsonError(400, "targetUrl must be http(s)");
  const utmSource = sanitizeText2(body.utmSource, 80) || deriveUtm(sourceLabel);
  const utmMedium = sanitizeText2(body.utmMedium, 80) || "marketing-slug";
  const utmCampaign = sanitizeText2(body.utmCampaign, 120) || slug;
  const existing = await env2.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? LIMIT 1"
  ).bind(slug).first();
  if (existing && !existing.DeletedAt) {
    return jsonError(409, "slug already exists");
  }
  const now = nowIso2();
  if (existing && existing.DeletedAt) {
    await env2.DB.prepare(
      `UPDATE MarketingSlugs SET
         SourceLabel = ?, TargetUrl = ?, UtmSource = ?, UtmMedium = ?, UtmCampaign = ?,
         Active = 1, DeletedAt = '', UpdatedAt = ?
       WHERE Slug = ?`
    ).bind(
      sourceLabel,
      targetUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      now,
      slug
    ).run();
  } else {
    await env2.DB.prepare(
      `INSERT INTO MarketingSlugs
          (Slug, SourceLabel, TargetUrl, UtmSource, UtmMedium, UtmCampaign,
           Active, Clicks, LastClickAt, CreatedAt, UpdatedAt, CreatedBy, DeletedAt)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, '', ?, ?, ?, '')`
    ).bind(
      slug,
      sourceLabel,
      targetUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      now,
      now,
      sanitizeText2(body.createdBy, 40) || "admin"
    ).run();
  }
  const row = await env2.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ?"
  ).bind(slug).first();
  return jsonOk({ item: rowToView(row) });
}
__name(createLink, "createLink");
async function updateLink(request, env2, slug) {
  const body = await readJson(request);
  if (!body) return jsonError(400, "Invalid JSON");
  const existing = await env2.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ? LIMIT 1"
  ).bind(slug).first();
  if (!existing) return jsonError(404, "Not Found");
  const updates = {};
  if (typeof body.sourceLabel === "string") {
    const v = sanitizeText2(body.sourceLabel, 80);
    if (!v) return jsonError(400, "sourceLabel required");
    updates.SourceLabel = v;
  }
  if (typeof body.targetUrl === "string") {
    const v = sanitizeText2(body.targetUrl, 500);
    if (!isHttpUrl(v)) return jsonError(400, "targetUrl must be http(s)");
    updates.TargetUrl = v;
  }
  if (typeof body.utmSource === "string") {
    updates.UtmSource = sanitizeText2(body.utmSource, 80);
  }
  if (typeof body.utmMedium === "string") {
    updates.UtmMedium = sanitizeText2(body.utmMedium, 80);
  }
  if (typeof body.utmCampaign === "string") {
    updates.UtmCampaign = sanitizeText2(body.utmCampaign, 120);
  }
  if (typeof body.active === "boolean") {
    updates.Active = body.active ? 1 : 0;
  }
  if (body.restore === true) {
    updates.DeletedAt = "";
    updates.Active = 1;
  }
  if (!Object.keys(updates).length)
    return jsonError(400, "No fields to update");
  updates.UpdatedAt = nowIso2();
  const cols = Object.keys(updates);
  const setSql = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => updates[c]);
  await env2.DB.prepare(`UPDATE MarketingSlugs SET ${setSql} WHERE Slug = ?`).bind(...values, slug).run();
  const row = await env2.DB.prepare(
    "SELECT * FROM MarketingSlugs WHERE Slug = ?"
  ).bind(slug).first();
  return jsonOk({ item: rowToView(row) });
}
__name(updateLink, "updateLink");
async function deleteLink(env2, slug) {
  const existing = await env2.DB.prepare(
    "SELECT 1 FROM MarketingSlugs WHERE Slug = ? AND DeletedAt = '' LIMIT 1"
  ).bind(slug).first();
  if (!existing) return jsonError(404, "Not Found");
  const res = await env2.DB.prepare(
    "UPDATE MarketingSlugs SET DeletedAt = ?, Active = 0, UpdatedAt = ? WHERE Slug = ?"
  ).bind(nowIso2(), nowIso2(), slug).run();
  if (!res.success) return jsonError(500, "Delete failed");
  return jsonOk({ deleted: slug, archived: true });
}
__name(deleteLink, "deleteLink");
async function listDaily(env2, slug, url) {
  const days = Math.max(
    1,
    Math.min(365, parseInt(url?.searchParams.get("days") || "30", 10) || 30)
  );
  const { results } = await env2.DB.prepare(
    `SELECT Date, Slug, SourceLabel, Clicks, LastClickAt
       FROM MarketingSlugDaily
      WHERE Slug = ?
      ORDER BY Date DESC
      LIMIT ?`
  ).bind(slug, days).all();
  return jsonOk({
    slug,
    items: (results || []).map((r) => ({
      date: r.Date,
      sourceLabel: r.SourceLabel || "",
      clicks: r.Clicks || 0,
      lastClickAt: r.LastClickAt || ""
    }))
  });
}
__name(listDaily, "listDaily");

// src/routes/meta-ads.js
var META_API_VERSION = "v18.0";
var CAMPAIGN_FIELDS = "campaign_id,campaign_name";
var AD_FIELDS = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name";
var INSIGHT_METRICS = [
  "impressions",
  "clicks",
  "spend",
  "ctr",
  "cpc",
  "reach",
  "frequency",
  "actions",
  "inline_link_clicks",
  "unique_clicks",
  "unique_inline_link_clicks",
  "cost_per_inline_link_click",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
  "video_thruplay_watched_actions",
  // 후킹 성능은 이 둘로 본다. 노출 대비 2초를 넘긴 비율이 첫 화면이 붙잡았는지를 말한다
  "video_play_actions",
  "video_continuous_2_sec_watched_actions"
].join(",");
var CAMPAIGN_META_FIELDS = "id,name,status,objective,daily_budget,lifetime_budget";
var AD_META_FIELDS = "id,name,status,effective_status,campaign{id,name,status,effective_status},adset{id,name,status,effective_status},creative{id,thumbnail_url,object_type,video_id,image_url,asset_feed_spec{bodies,titles,call_to_action_types,link_urls},object_story_spec{link_data{message,name,link,call_to_action},video_data{message,title,call_to_action}}}";
var AD_META_FIELDS_FALLBACK = "id,name,status,effective_status,campaign{id,name,status,effective_status},adset{id,name,status,effective_status},creative{id,thumbnail_url,object_type,video_id,image_url}";
async function handleMetaAds(request, env2, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/meta-ads/, "") || "/";
  const internalSecret = request.headers.get("x-internal-secret") || "";
  const internalSecretOk = !!env2.META_INTERNAL_SECRET && timingSafeEqual(internalSecret, env2.META_INTERNAL_SECRET);
  const isBackfillRoute = path === "/backfill" && request.method === "POST";
  const isOverviewGet = path === "/overview" && request.method === "GET";
  const internalOk = internalSecretOk && (isBackfillRoute || isOverviewGet);
  if (!internalOk && !await verifyAdmin(request, env2)) {
    return jsonError(401, "Unauthorized");
  }
  if (path === "/overview" && request.method === "GET") {
    return getOverview(request, env2, ctx);
  }
  if (path === "/summary" && request.method === "GET") {
    return getSummary2(request, env2);
  }
  if (path === "/campaigns" && request.method === "GET") {
    return listCampaigns(request, env2);
  }
  if (path === "/daily" && request.method === "GET") {
    return listDaily2(request, env2);
  }
  if (path === "/sync-log" && request.method === "GET") {
    return listSyncLog(env2);
  }
  if (path === "/ads" && request.method === "GET") {
    return listAds(request, env2);
  }
  if (path === "/breakdown" && request.method === "GET") {
    return listBreakdown(request, env2);
  }
  if (path === "/thumbs" && request.method === "GET") {
    return getAdThumbUrls(request, env2);
  }
  if (path === "/dow" && request.method === "GET") {
    return listDow(request, env2);
  }
  if (path === "/hour-heatmap" && request.method === "GET") {
    return listHourHeatmap(request, env2);
  }
  if (path === "/efficiency" && request.method === "GET") {
    return getEfficiency(request, env2);
  }
  if (path === "/backfill" && request.method === "POST") {
    return runBackfill(request, env2, ctx);
  }
  return jsonError(404, "Not Found");
}
__name(handleMetaAds, "handleMetaAds");
async function runScheduledSync(env2, ctx) {
  const end = kstYesterday();
  const start = kstDaysAgo(3);
  return syncRange(env2, ctx, start, end, "cron");
}
__name(runScheduledSync, "runScheduledSync");
function withQuery(request, extra) {
  const u = new URL(request.url);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
  return new Request(u.toString(), request);
}
__name(withQuery, "withQuery");
var OVERVIEW_FRESH_MS = 30 * 60 * 1e3;
var OVERVIEW_CACHE_TTL_S = 24 * 60 * 60;
function overviewCacheKey(range, sort, order) {
  return `https://meta-overview.internal/v2/${encodeURIComponent(range.startDate)}/${encodeURIComponent(range.endDate)}/${encodeURIComponent(sort)}/${encodeURIComponent(order)}`;
}
__name(overviewCacheKey, "overviewCacheKey");
function overviewJsonResponse(body) {
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(overviewJsonResponse, "overviewJsonResponse");
async function putOverviewCache(cache, cacheKey2, body) {
  try {
    await cache.put(
      cacheKey2,
      new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `max-age=${OVERVIEW_CACHE_TTL_S}`
        }
      })
    );
  } catch {
  }
}
__name(putOverviewCache, "putOverviewCache");
async function getOverview(request, env2, ctx) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const sort = url.searchParams.get("sort") || "spend";
  const order = url.searchParams.get("order") || "top";
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const cache = caches.default;
  const cacheKey2 = overviewCacheKey(range, sort, order);
  if (forceRefresh) {
    try {
      const body = await computeOverview(request, env2, range);
      await putOverviewCache(cache, cacheKey2, body);
      return overviewJsonResponse(body);
    } catch (e) {
      return jsonError(
        500,
        "overview failed: " + (e.message || "").slice(0, 100)
      );
    }
  }
  let staleBody = null;
  try {
    const hit = await cache.match(cacheKey2);
    if (hit) {
      staleBody = await hit.text();
      let cachedAt = 0;
      try {
        cachedAt = Date.parse(JSON.parse(staleBody)?.cachedAt || "") || 0;
      } catch {
      }
      const isFresh = cachedAt && Date.now() - cachedAt < OVERVIEW_FRESH_MS;
      if (isFresh) return overviewJsonResponse(staleBody);
      if (ctx?.waitUntil) {
        ctx.waitUntil(
          computeOverview(request, env2, range).then((body) => putOverviewCache(cache, cacheKey2, body)).catch(() => {
          })
        );
        return overviewJsonResponse(staleBody);
      }
    }
  } catch {
  }
  try {
    const body = await computeOverview(request, env2, range);
    await putOverviewCache(cache, cacheKey2, body);
    return overviewJsonResponse(body);
  } catch (e) {
    if (staleBody) return overviewJsonResponse(staleBody);
    return jsonError(
      500,
      "overview failed: " + (e.message || "").slice(0, 100)
    );
  }
}
__name(getOverview, "getOverview");
async function computeOverview(request, env2, range) {
  const j = /* @__PURE__ */ __name((resp) => resp.json(), "j");
  const [
    summary,
    campaigns,
    ads,
    efficiency,
    platform2,
    position,
    device,
    ageGender,
    region,
    dow,
    hourHeatmap,
    syncLog
  ] = await Promise.all([
    getSummary2(request, env2).then(j),
    listCampaigns(request, env2).then(j),
    listAds(request, env2).then(j),
    getEfficiency(request, env2).then(j),
    listBreakdown(withQuery(request, { dim: "platform" }), env2).then(j),
    listBreakdown(withQuery(request, { dim: "position" }), env2).then(j),
    listBreakdown(withQuery(request, { dim: "device" }), env2).then(j),
    listBreakdown(
      withQuery(request, { dim: "age_gender", limit: "30" }),
      env2
    ).then(j),
    listBreakdown(withQuery(request, { dim: "region" }), env2).then(j),
    listDow(request, env2).then(j),
    listHourHeatmap(request, env2).then(j),
    listSyncLog(env2).then(j)
  ]);
  return JSON.stringify({
    ok: true,
    range,
    summary,
    campaigns,
    ads,
    efficiency,
    breakdown: { platform: platform2, position, device, age_gender: ageGender, region },
    dow,
    hourHeatmap,
    syncLog,
    cachedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
__name(computeOverview, "computeOverview");
async function prewarmOverviewCache(env2) {
  if (!env2.META_INTERNAL_SECRET) return { ok: false, reason: "no secret" };
  const ranges = ["all", "30", "today", "cur-month", "7", "prev-month"];
  const origin = "https://admin.day1design.co.kr";
  let done = 0;
  for (const rg of ranges) {
    const u = `${origin}/api/meta-ads/overview?range=${rg}&sort=spend&order=top&limit=20&refresh=1`;
    try {
      const r = await fetch(u, {
        headers: { "x-internal-secret": env2.META_INTERNAL_SECRET }
      });
      if (r.ok) done++;
    } catch {
    }
  }
  return { ok: true, prewarmed: done, total: ranges.length };
}
__name(prewarmOverviewCache, "prewarmOverviewCache");
async function getSummary2(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;
  try {
    const totals = await env2.DB.prepare(
      `SELECT
         COALESCE(SUM(Impressions), 0) AS Impressions,
         COALESCE(SUM(Clicks), 0) AS Clicks,
         COALESCE(SUM(LinkClicks), 0) AS LinkClicks,
         COALESCE(SUM(Spend), 0) AS Spend,
         COALESCE(SUM(Reach), 0) AS Reach,
         COALESCE(SUM(Leads), 0) AS Leads,
         COALESCE(SUM(VideoP25Watched), 0) AS VideoP25,
         COALESCE(SUM(VideoP50Watched), 0) AS VideoP50,
         COALESCE(SUM(VideoP75Watched), 0) AS VideoP75,
         COALESCE(SUM(VideoP100Watched), 0) AS VideoP100,
         COALESCE(SUM(ThruPlay), 0) AS ThruPlay,
         COALESCE(AVG(NULLIF(VideoAvgWatchSec, 0)), 0) AS AvgWatchSec,
         COUNT(DISTINCT Date) AS Days
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?`
    ).bind(startDate, endDate).first();
    const lastSync = await env2.DB.prepare(
      `SELECT CompletedAt FROM MetaSyncLog
       WHERE Status = 'success'
       ORDER BY CompletedAt DESC LIMIT 1`
    ).first();
    const imps = Number(totals?.Impressions || 0);
    const clicks = Number(totals?.Clicks || 0);
    const spend = Number(totals?.Spend || 0);
    return jsonOk({
      range,
      summary: {
        impressions: imps,
        clicks,
        linkClicks: Number(totals?.LinkClicks || 0),
        spend,
        reach: Number(totals?.Reach || 0),
        leads: Number(totals?.Leads || 0),
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: Number(totals?.Leads || 0) > 0 ? spend / Number(totals.Leads) : 0,
        videoP25: Number(totals?.VideoP25 || 0),
        videoP50: Number(totals?.VideoP50 || 0),
        videoP75: Number(totals?.VideoP75 || 0),
        videoP100: Number(totals?.VideoP100 || 0),
        thruPlay: Number(totals?.ThruPlay || 0),
        avgWatchSec: Number(totals?.AvgWatchSec || 0)
      },
      lastSyncedAt: lastSync?.CompletedAt || ""
    });
  } catch (e) {
    return jsonError(500, "summary failed: " + (e.message || "").slice(0, 100));
  }
}
__name(getSummary2, "getSummary");
async function listCampaigns(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;
  try {
    const res = await env2.DB.prepare(
      `SELECT
         EntityId,
         MAX(EntityName) AS EntityName,
         MAX(Status) AS Status,
         MAX(Objective) AS Objective,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads,
         COUNT(*) AS DayCount
       FROM MetaAdsDaily
       WHERE Level = 'campaign' AND Date BETWEEN ? AND ?
       GROUP BY EntityId
       ORDER BY Spend DESC`
    ).bind(startDate, endDate).all();
    const campaigns = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        id: r.EntityId,
        name: r.EntityName || "",
        status: r.Status || "",
        objective: r.Objective || "",
        impressions: imps,
        clicks,
        linkClicks: Number(r.LinkClicks || 0),
        spend,
        reach: Number(r.Reach || 0),
        leads,
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0
      };
    });
    return jsonOk({ range, campaigns });
  } catch (e) {
    return jsonError(
      500,
      "campaigns failed: " + (e.message || "").slice(0, 100)
    );
  }
}
__name(listCampaigns, "listCampaigns");
async function listDaily2(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;
  try {
    const res = await env2.DB.prepare(
      `SELECT
         Date,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(Spend) AS Spend,
         SUM(Leads) AS Leads
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?
       GROUP BY Date
       ORDER BY Date ASC`
    ).bind(startDate, endDate).all();
    return jsonOk({
      range,
      rows: (res.results || []).map((r) => ({
        date: r.Date,
        impressions: Number(r.Impressions || 0),
        clicks: Number(r.Clicks || 0),
        spend: Number(r.Spend || 0),
        leads: Number(r.Leads || 0)
      }))
    });
  } catch (e) {
    return jsonError(500, "daily failed: " + (e.message || "").slice(0, 100));
  }
}
__name(listDaily2, "listDaily");
async function listSyncLog(env2) {
  try {
    const res = await env2.DB.prepare(
      `SELECT SyncType, Status, DateRangeStart, DateRangeEnd,
              ApiCallsUsed, RecordsUpdated, ErrorCode, ErrorMessage,
              StartedAt, CompletedAt
       FROM MetaSyncLog
       ORDER BY CreatedAt DESC LIMIT 30`
    ).all();
    return jsonOk({ logs: res.results || [] });
  } catch (e) {
    return jsonError(500, "sync log failed");
  }
}
__name(listSyncLog, "listSyncLog");
function buildVideoBlock(r, impressions) {
  const plays = Number(r.VideoPlays || 0);
  const p25 = Number(r.VideoP25 || 0);
  const p50 = Number(r.VideoP50 || 0);
  const p75 = Number(r.VideoP75 || 0);
  const p100 = Number(r.VideoP100 || 0);
  if (!plays && !p25 && !Number(r.ThruPlay || 0)) return null;
  const rate = /* @__PURE__ */ __name((a, b) => b > 0 ? Number((a / b).toFixed(4)) : null, "rate");
  const lengthSec = Number(r.VideoLengthSec || 0);
  const avgWatchSec = Number(Number(r.VideoAvgWatchSec || 0).toFixed(2));
  const atSec = /* @__PURE__ */ __name((ratio) => lengthSec > 0 ? Number((lengthSec * ratio).toFixed(1)) : null, "atSec");
  return {
    plays,
    twoSecViews: Number(r.Video2SecViews || 0),
    p25,
    p50,
    p75,
    p100,
    thruPlay: Number(r.ThruPlay || 0),
    avgWatchSec,
    lengthSec: lengthSec > 0 ? Number(lengthSec.toFixed(1)) : null,
    p25Sec: atSec(0.25),
    p50Sec: atSec(0.5),
    p75Sec: atSec(0.75),
    // 평균 시청이 영상의 몇 %까지인지. 길이가 없으면 초만으로는 판단할 수 없다
    avgWatchRatio: lengthSec > 0 ? Number((avgWatchSec / lengthSec).toFixed(4)) : null,
    playRate: rate(plays, impressions),
    p25OfPlays: rate(p25, plays),
    p50OfPlays: rate(p50, plays),
    p75OfPlays: rate(p75, plays),
    completionRate: rate(p100, plays)
  };
}
__name(buildVideoBlock, "buildVideoBlock");
async function listAds(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const sortField = (url.searchParams.get("sort") || "spend").toLowerCase();
  const order = (url.searchParams.get("order") || "top").toLowerCase();
  const limit = Math.max(
    1,
    Math.min(200, parseInt(url.searchParams.get("limit") || "20", 10))
  );
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") || "0", 10)
  );
  const sortMap = {
    spend: "Spend",
    cpl: "CPL",
    ctr: "Ctr",
    impressions: "Impressions",
    leads: "Leads"
  };
  const sortCol = sortMap[sortField] || "Spend";
  const direction = order === "bottom" ? "ASC" : "DESC";
  try {
    const res = await env2.DB.prepare(
      `SELECT
         AdId,
         MAX(AdName) AS AdName,
         MAX(AdsetId) AS AdsetId,
         MAX(AdsetName) AS AdsetName,
         MAX(CampaignId) AS CampaignId,
         MAX(CampaignName) AS CampaignName,
         MAX(CreativeId) AS CreativeId,
         MAX(CreativeType) AS CreativeType,
         MAX(a.VideoId) AS VideoId,
         MAX(v.LengthSec) AS VideoLengthSec,
         MAX(ThumbnailUrl) AS ThumbnailUrl,
         MAX(Status) AS Status,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads,
         SUM(ThruPlay) AS ThruPlay,
         SUM(VideoPlays) AS VideoPlays,
         SUM(Video2SecViews) AS Video2SecViews,
         SUM(VideoP25Watched) AS VideoP25,
         SUM(VideoP50Watched) AS VideoP50,
         SUM(VideoP75Watched) AS VideoP75,
         SUM(VideoP100Watched) AS VideoP100,
         -- \uD3C9\uADE0 \uC2DC\uCCAD\uCD08\uB294 \uB2E8\uC21C \uD3C9\uADE0\uC774 \uC544\uB2C8\uB77C \uC7AC\uC0DD \uC218\uB85C \uAC00\uC911\uD574\uC57C \uD55C\uB2E4.
         -- \uC7AC\uC0DD 10\uD68C\uC9DC\uB9AC \uB0A0\uACFC 1000\uD68C\uC9DC\uB9AC \uB0A0\uC744 \uAC19\uC740 \uBB34\uAC8C\uB85C \uB354\uD558\uBA74 \uAC12\uC774 \uC65C\uACE1\uB41C\uB2E4
         CASE WHEN SUM(VideoPlays) > 0
              THEN SUM(VideoAvgWatchSec * VideoPlays) / SUM(VideoPlays)
              ELSE 0 END AS VideoAvgWatchSec,
         CASE WHEN SUM(Impressions) > 0
              THEN CAST(SUM(Clicks) AS REAL) / SUM(Impressions) * 100
              ELSE 0 END AS Ctr,
         CASE WHEN SUM(LinkClicks) > 0
              THEN SUM(Spend) / SUM(LinkClicks)
              ELSE 0 END AS Cpc,
         CASE WHEN SUM(Leads) > 0
              THEN SUM(Spend) / SUM(Leads)
              ELSE 0 END AS CPL
       FROM MetaAdsAd a
       LEFT JOIN MetaVideos v ON v.VideoId = a.VideoId
       WHERE Date BETWEEN ? AND ?
       GROUP BY AdId
       HAVING Impressions > 0
       ORDER BY ${sortCol} ${direction}
       LIMIT ? OFFSET ?`
    ).bind(range.startDate, range.endDate, limit, offset).all();
    const countRow = await env2.DB.prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT AdId FROM MetaAdsAd
          WHERE Date BETWEEN ? AND ?
          GROUP BY AdId
         HAVING SUM(Impressions) > 0
       )`
    ).bind(range.startDate, range.endDate).first();
    const ads = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        adId: String(r.AdId || ""),
        adName: String(r.AdName || ""),
        adsetId: String(r.AdsetId || ""),
        adsetName: String(r.AdsetName || ""),
        campaignId: String(r.CampaignId || ""),
        campaignName: String(r.CampaignName || ""),
        creativeId: String(r.CreativeId || ""),
        creativeType: String(r.CreativeType || ""),
        videoId: String(r.VideoId || ""),
        thumbnailUrl: String(r.ThumbnailUrl || ""),
        status: String(r.Status || ""),
        impressions: imps,
        clicks,
        linkClicks: Number(r.LinkClicks || 0),
        spend,
        reach: Number(r.Reach || 0),
        leads,
        thruPlay: Number(r.ThruPlay || 0),
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
        // 영상 유지 곡선. 어디서 사람이 떠나는지는 이 값들로만 보인다.
        // 비율까지 여기서 내주면 화면과 분석기가 같은 기준으로 읽는다
        video: buildVideoBlock(r, imps)
      };
    });
    return jsonOk({
      range,
      ads,
      page: {
        limit,
        offset,
        total: Number(countRow?.n || 0),
        hasMore: offset + ads.length < Number(countRow?.n || 0)
      }
    });
  } catch (e) {
    return jsonError(500, "ads failed: " + (e.message || "").slice(0, 100));
  }
}
__name(listAds, "listAds");
async function listBreakdown(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const dim = String(url.searchParams.get("dim") || "platform");
  const limit = Math.max(
    1,
    Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10))
  );
  try {
    const res = await env2.DB.prepare(
      `SELECT
         DimensionValue,
         MAX(DimensionSub) AS DimensionSub,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(LinkClicks) AS LinkClicks,
         SUM(Spend) AS Spend,
         SUM(Reach) AS Reach,
         SUM(Leads) AS Leads
       FROM MetaAdsBreakdown
       WHERE Date BETWEEN ? AND ? AND Dimension = ?
       GROUP BY DimensionValue
       ORDER BY Spend DESC
       LIMIT ?`
    ).bind(range.startDate, range.endDate, dim, limit).all();
    const rows = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        value: String(r.DimensionValue || ""),
        sub: String(r.DimensionSub || ""),
        impressions: imps,
        clicks,
        linkClicks: Number(r.LinkClicks || 0),
        spend,
        reach: Number(r.Reach || 0),
        leads,
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0
      };
    });
    return jsonOk({ range, dimension: dim, rows });
  } catch (e) {
    return jsonError(
      500,
      "breakdown failed: " + (e.message || "").slice(0, 100)
    );
  }
}
__name(listBreakdown, "listBreakdown");
async function listDow(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  try {
    const res = await env2.DB.prepare(
      `SELECT
         strftime('%w', Date) AS Dow,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(Spend) AS Spend,
         SUM(Leads) AS Leads,
         COUNT(*) AS Days
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?
       GROUP BY Dow
       ORDER BY Dow`
    ).bind(range.startDate, range.endDate).all();
    const rows = (res.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        dow: Number(r.Dow),
        // 0=일, 1=월, ...
        impressions: imps,
        clicks,
        spend,
        leads,
        days: Number(r.Days || 0),
        ctr: imps > 0 ? clicks / imps : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpl: leads > 0 ? spend / leads : 0
      };
    });
    return jsonOk({ range, rows });
  } catch (e) {
    return jsonError(500, "dow failed: " + (e.message || "").slice(0, 100));
  }
}
__name(listDow, "listDow");
async function listHourHeatmap(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  try {
    const res = await env2.DB.prepare(
      `SELECT
         strftime('%w', Date) AS Dow,
         DimensionValue AS Hour,
         SUM(Impressions) AS Impressions,
         SUM(Clicks) AS Clicks,
         SUM(Spend) AS Spend,
         SUM(Leads) AS Leads
       FROM MetaAdsBreakdown
       WHERE Dimension = 'hour' AND Date BETWEEN ? AND ?
       GROUP BY Dow, Hour
       ORDER BY Dow, Hour`
    ).bind(range.startDate, range.endDate).all();
    const cells = (res.results || []).map((r) => ({
      dow: Number(r.Dow),
      hour: Number(r.Hour),
      impressions: Number(r.Impressions || 0),
      clicks: Number(r.Clicks || 0),
      spend: Number(r.Spend || 0),
      leads: Number(r.Leads || 0)
    }));
    return jsonOk({ range, cells });
  } catch (e) {
    return jsonError(
      500,
      "hour heatmap failed: " + (e.message || "").slice(0, 100)
    );
  }
}
__name(listHourHeatmap, "listHourHeatmap");
async function getEfficiency(request, env2) {
  const url = new URL(request.url);
  const range = resolveRangeFromQuery(url);
  const { startDate, endDate } = range;
  const days = daysBetween(startDate, endDate);
  const prevEnd = addDays(startDate, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  try {
    const curr = await aggregateAccount(env2, startDate, endDate);
    const prev = await aggregateAccount(env2, prevStart, prevEnd);
    const seriesRes = await env2.DB.prepare(
      `SELECT
         Date,
         Impressions,
         Clicks,
         LinkClicks,
         Spend,
         Leads
       FROM MetaAdsDaily
       WHERE Level = 'account' AND Date BETWEEN ? AND ?
       ORDER BY Date ASC`
    ).bind(startDate, endDate).all();
    const daily = (seriesRes.results || []).map((r) => {
      const imps = Number(r.Impressions || 0);
      const clicks = Number(r.Clicks || 0);
      const linkClicks = Number(r.LinkClicks || 0);
      const spend = Number(r.Spend || 0);
      const leads = Number(r.Leads || 0);
      return {
        date: r.Date,
        cpm: imps > 0 ? spend / imps * 1e3 : 0,
        cpc: linkClicks > 0 ? spend / linkClicks : 0,
        cpl: leads > 0 ? spend / leads : 0,
        impressions: imps,
        clicks,
        spend,
        leads
      };
    });
    return jsonOk({
      range,
      previous: { startDate: prevStart, endDate: prevEnd },
      current: curr,
      prevTotals: prev,
      daily
    });
  } catch (e) {
    return jsonError(
      500,
      "efficiency failed: " + (e.message || "").slice(0, 100)
    );
  }
}
__name(getEfficiency, "getEfficiency");
async function aggregateAccount(env2, startDate, endDate) {
  const row = await env2.DB.prepare(
    `SELECT
       SUM(Impressions) AS Impressions,
       SUM(Clicks) AS Clicks,
       SUM(LinkClicks) AS LinkClicks,
       SUM(Spend) AS Spend,
       SUM(Leads) AS Leads
     FROM MetaAdsDaily
     WHERE Level = 'account' AND Date BETWEEN ? AND ?`
  ).bind(startDate, endDate).first();
  const imps = Number(row?.Impressions || 0);
  const clicks = Number(row?.Clicks || 0);
  const linkClicks = Number(row?.LinkClicks || 0);
  const spend = Number(row?.Spend || 0);
  const leads = Number(row?.Leads || 0);
  return {
    impressions: imps,
    clicks,
    linkClicks,
    spend,
    leads,
    cpm: imps > 0 ? spend / imps * 1e3 : 0,
    cpc: linkClicks > 0 ? spend / linkClicks : 0,
    cpl: leads > 0 ? spend / leads : 0,
    ctr: imps > 0 ? clicks / imps : 0
  };
}
__name(aggregateAccount, "aggregateAccount");
function daysBetween(a, b) {
  const da = (/* @__PURE__ */ new Date(a + "T00:00:00Z")).getTime();
  const db = (/* @__PURE__ */ new Date(b + "T00:00:00Z")).getTime();
  return Math.max(1, Math.round((db - da) / 864e5) + 1);
}
__name(daysBetween, "daysBetween");
function addDays(ymd, n) {
  const d = /* @__PURE__ */ new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
__name(addDays, "addDays");
var LEAD_RECOUNT_SYNC_TYPE = "lead-recount";
var BACKFILL_CHUNK_TYPE = "backfill-chunk";
var BACKFILL_START_DATE = "2026-02-02";
var BACKFILL_CHUNK_DAYS = 31;
function buildBackfillChunks(startDate, endDate) {
  const chunks = [];
  const end = /* @__PURE__ */ new Date(`${endDate}T00:00:00Z`);
  let cursor = /* @__PURE__ */ new Date(`${startDate}T00:00:00Z`);
  while (cursor <= end && chunks.length < 60) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + BACKFILL_CHUNK_DAYS - 1);
    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end: (chunkEnd > end ? end : chunkEnd).toISOString().slice(0, 10)
    });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}
__name(buildBackfillChunks, "buildBackfillChunks");
function isD1QuotaError(message) {
  return /daily row read limit|exceeded .*(limit|quota)/i.test(
    String(message || "")
  );
}
__name(isD1QuotaError, "isD1QuotaError");
async function runBackfillChunk(env2, ctx, { force = false } = {}) {
  if (!env2?.DB) return { skipped: "no_db" };
  const lastFail = force ? null : await env2.DB.prepare(
    `SELECT ErrorMessage, CreatedAt FROM MetaSyncLog
      WHERE SyncType = ? AND Status <> 'success'
      ORDER BY CreatedAt DESC LIMIT 1`
  ).bind(BACKFILL_CHUNK_TYPE).first();
  if (lastFail && isD1QuotaError(lastFail.ErrorMessage) && String(lastFail.CreatedAt).slice(0, 10) === (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
    return { skipped: "d1_quota", retryAfter: "\uB2E4\uC74C UTC \uC790\uC815" };
  }
  const endDate = kstYesterday();
  const chunks = buildBackfillChunks(BACKFILL_START_DATE, endDate);
  const doneRows = await env2.DB.prepare(
    `SELECT DateRangeStart FROM MetaSyncLog
      WHERE SyncType = ? AND Status = 'success'`
  ).bind(BACKFILL_CHUNK_TYPE).all();
  const done = new Set((doneRows.results || []).map((r) => r.DateRangeStart));
  const pending = chunks.filter((c) => !done.has(c.start));
  if (!pending.length) {
    return { skipped: "all_done", chunks: chunks.length };
  }
  const chunk = pending[0];
  const res = await syncRange(
    env2,
    ctx,
    chunk.start,
    chunk.end,
    BACKFILL_CHUNK_TYPE
  );
  const ok = res.status === 200;
  if (ok) {
    try {
      await prewarmOverviewCache(env2);
    } catch {
    }
  }
  return {
    ran: true,
    ok,
    chunk,
    remaining: pending.length - (ok ? 1 : 0),
    total: chunks.length
  };
}
__name(runBackfillChunk, "runBackfillChunk");
var BACKFILL_CHUNKS_PER_RUN = 3;
async function runBackfillChunks(env2, ctx, limit = BACKFILL_CHUNKS_PER_RUN) {
  const processed = [];
  let last = null;
  for (let i = 0; i < limit; i++) {
    last = await runBackfillChunk(env2, ctx);
    if (!last?.ran) break;
    processed.push(last.chunk);
    if (!last.ok) break;
    if (last.remaining === 0) break;
  }
  return {
    ran: processed.length > 0,
    processed,
    remaining: last?.remaining ?? 0,
    total: last?.total ?? 0,
    ok: last?.ok !== false
  };
}
__name(runBackfillChunks, "runBackfillChunks");
async function runLeadRecountBackfill(env2, ctx) {
  if (!env2?.DB) return { skipped: "no_db" };
  const done = await env2.DB.prepare(
    `SELECT 1 FROM MetaSyncLog
      WHERE SyncType = ? AND Status = 'success' LIMIT 1`
  ).bind(LEAD_RECOUNT_SYNC_TYPE).first();
  if (done) return { skipped: "already_done" };
  const res = await syncRange(
    env2,
    ctx,
    "2026-02-02",
    kstYesterday(),
    LEAD_RECOUNT_SYNC_TYPE
  );
  if (res.status === 200) {
    try {
      await prewarmOverviewCache(env2);
    } catch {
    }
  }
  return { ran: true, ok: res.status === 200 };
}
__name(runLeadRecountBackfill, "runLeadRecountBackfill");
async function runBackfill(request, env2, ctx) {
  let body = {};
  try {
    body = await request.json();
  } catch {
  }
  if (!body.startDate && !body.endDate) {
    const r = await runBackfillChunk(env2, ctx, { force: body.force === true });
    return jsonOk({
      status: r.ok === false ? "failed" : "success",
      mode: "chunk",
      ...r
    });
  }
  const startDate = String(body.startDate || BACKFILL_START_DATE);
  const endDate = String(body.endDate || kstYesterday());
  const res = await syncRange(env2, ctx, startDate, endDate, "backfill");
  if (res.status === 200) {
    ctx?.waitUntil(prewarmOverviewCache(env2).catch(() => null));
  }
  return res;
}
__name(runBackfill, "runBackfill");
async function syncRange(env2, ctx, startDate, endDate, syncType) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const log3 = {
    SyncType: syncType,
    Status: "running",
    DateRangeStart: startDate,
    DateRangeEnd: endDate,
    ApiCallsUsed: 0,
    RecordsUpdated: 0,
    ErrorCode: "",
    ErrorMessage: "",
    StartedAt: startedAt,
    CompletedAt: "",
    CreatedAt: startedAt
  };
  let leaseOwner = "";
  try {
    const token = String(env2.META_AD_ACCESS_TOKEN || "").trim();
    const accountId = String(env2.META_AD_ACCOUNT_ID || "").trim();
    if (!token || !accountId) throw new Error("META_AD_* env not configured");
    const lease = await acquireMediaSyncLease(env2);
    if (!lease.acquired) return jsonOk({ status: "busy", syncType, changed: false });
    leaseOwner = lease.owner;
    const accountRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "account"
    );
    log3.ApiCallsUsed++;
    const campaignRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "campaign"
    );
    log3.ApiCallsUsed++;
    const campaignMeta = await fetchCampaignMeta(token, accountId);
    log3.ApiCallsUsed++;
    const adRows = await fetchInsights(
      token,
      accountId,
      startDate,
      endDate,
      "ad"
    );
    log3.ApiCallsUsed++;
    const adMeta = await fetchAdMeta(token, accountId, log3);
    await saveMetaCreativeCatalog(env2, adMeta, kstToday2());
    const media = createMediaCounters();
    await mirrorFetchedCreativeThumbs(env2, adRows, adMeta, log3, media).catch(() => 0);
    const brkPlatform = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "publisher_platform"
    );
    log3.ApiCallsUsed++;
    const brkPosition = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "publisher_platform,platform_position"
    );
    log3.ApiCallsUsed++;
    const brkDevice = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "impression_device"
    );
    log3.ApiCallsUsed++;
    const brkAgeGender = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "age,gender"
    );
    log3.ApiCallsUsed++;
    const brkRegion = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "region"
    );
    log3.ApiCallsUsed++;
    const brkHour = await fetchBreakdown(
      token,
      accountId,
      startDate,
      endDate,
      "hourly_stats_aggregated_by_advertiser_time_zone"
    );
    log3.ApiCallsUsed++;
    const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const stmts = [];
    const platformVideo = reconcileVideoBreakdown(accountRows, brkPlatform, "platform");
    const ageGenderVideo = reconcileVideoBreakdown(accountRows, brkAgeGender, "age_gender");
    const videoReconciliation = { platform: platformVideo.evidence, age_gender: ageGenderVideo.evidence };
    log3.ErrorMessage = JSON.stringify({ videoReconciliation }).slice(0, 400);
    for (const row of accountRows) {
      stmts.push(
        buildDailyStmt(env2, {
          Date: row.date_start,
          Level: "account",
          EntityId: `act_${accountId}`,
          EntityName: "day1design_marketing",
          Status: "",
          Objective: "",
          ...mapInsight(row),
          FetchedAt: fetchedAt
        })
      );
    }
    for (const row of campaignRows) {
      const meta = campaignMeta[row.campaign_id] || {};
      stmts.push(
        buildDailyStmt(env2, {
          Date: row.date_start,
          Level: "campaign",
          EntityId: String(row.campaign_id || ""),
          EntityName: String(row.campaign_name || meta.name || ""),
          Status: String(meta.effective_status || meta.status || ""),
          Objective: String(meta.objective || ""),
          ...mapInsight(row),
          FetchedAt: fetchedAt
        })
      );
    }
    for (const row of adRows) {
      const meta = adMeta[row.ad_id] || {};
      const creative = meta.creative || {};
      const copy = normalizeCreativeCopy(creative);
      stmts.push(
        buildAdStmt(env2, {
          Date: row.date_start,
          AdId: String(row.ad_id || ""),
          AdName: String(row.ad_name || meta.name || ""),
          AdsetId: String(row.adset_id || meta.adset?.id || ""),
          AdsetName: String(row.adset_name || meta.adset?.name || ""),
          CampaignId: String(row.campaign_id || meta.campaign?.id || ""),
          CampaignName: String(row.campaign_name || meta.campaign?.name || ""),
          CreativeId: String(creative.id || ""),
          CreativeType: String(creative.object_type || ""),
          VideoId: String(creative.video_id || ""),
          ThumbnailUrl: String(
            creative.thumbnail_url || creative.image_url || ""
          ),
          CreativeTitle: copy.title,
          CreativeBody: copy.body,
          CreativeCallToAction: copy.callToAction,
          CreativeLinkUrl: copy.linkUrl,
          CreativeVariants: copy.variants.length ? JSON.stringify(copy.variants) : "",
          Status: String(meta.effective_status || meta.status || ""),
          ...mapInsight(row),
          FetchedAt: fetchedAt
        })
      );
    }
    const breakdowns = [
      ["platform", brkPlatform, (r) => [r.publisher_platform || "", ""]],
      [
        "position",
        brkPosition,
        (r) => [r.platform_position || "", r.publisher_platform || ""]
      ],
      ["device", brkDevice, (r) => [r.impression_device || "", ""]],
      [
        "age_gender",
        brkAgeGender,
        (r) => [`${r.age || ""}_${r.gender || ""}`, ""]
      ],
      ["region", brkRegion, (r) => [r.region || "", ""]],
      [
        "hour",
        brkHour,
        (r) => [
          String(
            r.hourly_stats_aggregated_by_advertiser_time_zone || ""
          ).replace(/:.*$/, ""),
          ""
        ]
      ]
    ];
    const snapshots = [];
    for (const [dim, rows, keyFn] of breakdowns) {
      if (dim === "platform") {
        snapshots.push(...platformVideo.snapshots);
        continue;
      }
      if (dim === "age_gender") {
        snapshots.push(...ageGenderVideo.snapshots);
        continue;
      }
      for (const row of rows) {
        const [val, sub] = keyFn(row);
        if (!val) continue;
        stmts.push(
          buildBreakdownStmt(env2, {
            Date: row.date_start,
            Dimension: dim,
            DimensionValue: val,
            DimensionSub: sub,
            ...mapInsight(row),
            VideoPlays: nullableVideoPlays(row),
            FetchedAt: fetchedAt
          })
        );
      }
    }
    await writeBreakdownSnapshots(env2, snapshots, fetchedAt);
    await runBatch(env2, stmts, "day1design");
    const updated = stmts.length + snapshots.reduce((total, snapshot) => total + snapshot.rows.length, 0);
    try {
      const videoIds = Object.values(adMeta || {}).map((m) => m?.creative?.video_id).filter(Boolean);
      await fillVideoLengths(env2, token, videoIds, log3, media);
    } catch (e) {
      console.error("[day1design/meta-ads] video length fill", e?.message);
    }
    const cleanup = await cleanupInactiveMediaAssets(env2, adMeta, { leaseOwner });
    log3.Status = "success";
    log3.RecordsUpdated = updated;
    log3.CompletedAt = (/* @__PURE__ */ new Date()).toISOString();
    await writeLog(env2, log3);
    await releaseMediaSyncLease(env2, leaseOwner);
    return jsonOk({
      status: "success",
      syncType,
      range: { startDate, endDate },
      apiCalls: log3.ApiCallsUsed,
      recordsUpdated: updated,
      videoReconciliation,
      media,
      cleanup
    });
  } catch (e) {
    const msg = String(e.message || "unknown").slice(0, 400);
    log3.Status = isRateLimit(e) ? "rate_limited" : "failed";
    log3.ErrorCode = isRateLimit(e) ? "rate_limit" : "api_error";
    log3.ErrorMessage = msg;
    log3.CompletedAt = (/* @__PURE__ */ new Date()).toISOString();
    await writeLog(env2, log3);
    await releaseMediaSyncLease(env2, leaseOwner);
    const text = `[day1design/meta-ads] ${log3.Status} (${syncType})
${startDate} ~ ${endDate}
API \uD638\uCD9C: ${log3.ApiCallsUsed}
${msg}`;
    ctx?.waitUntil(
      notifyTelegram(env2, text, {
        botToken: env2.META_RATE_TELEGRAM_BOT_TOKEN,
        chatId: env2.META_RATE_TELEGRAM_CHAT_ID
      })
    );
    return jsonError(500, msg, { code: log3.ErrorCode });
  }
}
__name(syncRange, "syncRange");
async function fetchInsights(token, accountId, startDate, endDate, level) {
  let levelFields = "";
  if (level === "campaign") levelFields = "," + CAMPAIGN_FIELDS;
  else if (level === "ad") levelFields = "," + AD_FIELDS;
  const params = new URLSearchParams({
    fields: INSIGHT_METRICS + levelFields,
    level,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: "1",
    limit: "500",
    access_token: token
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params}`;
  const all = [];
  const MAX_PAGES = 12;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(
        `Meta API ${res.status}: ${data?.error?.message || "unknown"}`
      );
      err.metaError = data?.error;
      throw err;
    }
    all.push(...data.data || []);
    url = data?.paging?.next || null;
  }
  return all;
}
__name(fetchInsights, "fetchInsights");
async function fetchCampaignMeta(token, accountId) {
  const params = new URLSearchParams({
    fields: CAMPAIGN_META_FIELDS,
    limit: "200",
    access_token: token
  });
  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/campaigns?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      `Meta campaigns ${res.status}: ${data?.error?.message || "unknown"}`
    );
    err.metaError = data?.error;
    throw err;
  }
  const map = {};
  for (const c of data.data || []) {
    map[c.id] = c;
  }
  return map;
}
__name(fetchCampaignMeta, "fetchCampaignMeta");
var THUMB_R2_PREFIX = "meta-ads/thumbs/";
var THUMB_MAX_BYTES = 3 * 1024 * 1024;
var THUMB_CACHE_CONTROL = "public, max-age=604800, immutable";
function imageContentType(value) {
  const ct = String(value || "").split(";")[0].trim().toLowerCase();
  return /^image\/(jpeg|png|webp|gif|avif)$/.test(ct) ? ct : "image/jpeg";
}
__name(imageContentType, "imageContentType");
var THUMB_MAX_IDS = 40;
var THUMB_MAX_FETCH_PER_CALL = 15;
async function mirrorCreativeThumb(env2, creativeId, key) {
  const token = String(env2.META_AD_ACCESS_TOKEN || "").trim();
  if (!token) return false;
  let srcUrl = "";
  try {
    const params = new URLSearchParams({
      fields: "thumbnail_url,image_url",
      access_token: token
    });
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${creativeId}?${params}`
    );
    const data = await res.json();
    if (res.ok) srcUrl = String(data?.thumbnail_url || data?.image_url || "");
  } catch {
  }
  if (!/^https:\/\//.test(srcUrl)) return false;
  try {
    const img = await fetch(srcUrl);
    if (!img.ok) return false;
    const contentType = imageContentType(img.headers.get("content-type"));
    const buf = await img.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > THUMB_MAX_BYTES) return false;
    await env2.IMAGES.put(key, buf, {
      httpMetadata: { contentType, cacheControl: THUMB_CACHE_CONTROL }
    });
    return true;
  } catch {
    return false;
  }
}
__name(mirrorCreativeThumb, "mirrorCreativeThumb");
var PRIVATE_THUMB_MAX_BYTES = 2 * 1024 * 1024;
var PRIVATE_THUMB_MAX_PER_RUN = 15;
var PRIVATE_THUMB_CACHE_CONTROL = "private, max-age=604800, immutable";
var PRIVATE_THUMB_PREVIEW_VERSION = "3";
var MEDIA_ASSET_TENANT = "day1design";
var MEDIA_ASSET_KIND_IMAGE = "image";
var MEDIA_ASSET_MAX_ROWS = 500;
var MEDIA_ASSET_CLEANUP_MAX = 30;
var VIDEO_PREVIEW_TTL_MS = 24 * 60 * 60 * 1e3;
var VIDEO_PREVIEW_MAX_PER_RUN = 15;
function createMediaCounters() {
  return {
    thumbnail: { attempted: 0, success: 0, reasonCounts: {} },
    video: { attempted: 0, success: 0, reasonCounts: {} }
  };
}
__name(createMediaCounters, "createMediaCounters");
function mediaReason(stats2, kind, reason) {
  if (!stats2?.[kind]) return;
  stats2[kind].reasonCounts[reason] = Number(stats2[kind].reasonCounts[reason] || 0) + 1;
}
__name(mediaReason, "mediaReason");
function trustedCreativeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!(host === "fbcdn.net" || host.endsWith(".fbcdn.net") || host === "facebookcdn.net" || host.endsWith(".facebookcdn.net"))) return null;
    return url;
  } catch {
    return null;
  }
}
__name(trustedCreativeUrl, "trustedCreativeUrl");
function imageMetadata(value) {
  const contentType = String(value || "").split(";", 1)[0].trim().toLowerCase();
  return /^image\/(jpeg|png|webp)$/.test(contentType) ? contentType : "";
}
__name(imageMetadata, "imageMetadata");
function validPrivateThumb(head) {
  const size = Number(head?.size);
  return Number.isFinite(size) && size > 0 && size <= PRIVATE_THUMB_MAX_BYTES && !!imageMetadata(head?.httpMetadata?.contentType);
}
__name(validPrivateThumb, "validPrivateThumb");
function isActiveMetaAd(ad) {
  const statuses = [ad, ad?.adset, ad?.campaign].map(
    (item) => String(item?.effective_status || item?.status || "").trim().toUpperCase()
  );
  if (statuses.some((status) => !status)) return null;
  return statuses.every((status) => status === "ACTIVE");
}
__name(isActiveMetaAd, "isActiveMetaAd");
function metaAdStatus(ad) {
  const statuses = [ad, ad?.adset, ad?.campaign].map(
    (item) => String(item?.effective_status || item?.status || "").trim().toUpperCase()
  );
  if (statuses.some((status) => !status)) return "";
  return statuses.find((status) => status !== "ACTIVE") || statuses[0] || "";
}
__name(metaAdStatus, "metaAdStatus");
function mediaAssetKey(kind, mediaId) {
  const id2 = String(mediaId || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id2)) return null;
  if (kind === MEDIA_ASSET_KIND_IMAGE) return `${THUMB_R2_PREFIX}${id2}`;
  return null;
}
__name(mediaAssetKey, "mediaAssetKey");
function mediaAssetReadyStmt(env2, mediaId, updatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const r2Key = mediaAssetKey(MEDIA_ASSET_KIND_IMAGE, mediaId);
  if (!r2Key || !env2?.DB?.prepare) return null;
  return env2.DB.prepare(
    `INSERT INTO MetaAdsMediaAssets
       (CrmTenantId, Kind, MediaId, R2Key, State, UpdatedAt)
     VALUES (?, ?, ?, ?, 'ready', ?)
     ON CONFLICT(CrmTenantId, Kind, MediaId) DO UPDATE SET
       R2Key=excluded.R2Key, State='ready', UpdatedAt=excluded.UpdatedAt`
  ).bind(MEDIA_ASSET_TENANT, MEDIA_ASSET_KIND_IMAGE, String(mediaId), r2Key, updatedAt);
}
__name(mediaAssetReadyStmt, "mediaAssetReadyStmt");
async function registerReadyMediaAssets(env2, mediaIds) {
  if (!env2?.DB?.batch) return 0;
  const ids = [...new Set((mediaIds || []).map(String))];
  if (ids.length > MEDIA_ASSET_MAX_ROWS) return 0;
  const stmts = ids.map((id2) => mediaAssetReadyStmt(env2, id2)).filter(Boolean);
  if (stmts.length) await runBatch(env2, stmts);
  return stmts.length;
}
__name(registerReadyMediaAssets, "registerReadyMediaAssets");
var MEDIA_SYNC_LEASE_TTL_MS = 15 * 60 * 1e3;
async function acquireMediaSyncLease(env2) {
  if (!env2?.DB?.prepare) return { acquired: false, owner: "", reason: "db_unavailable" };
  const owner = generateId();
  const expiresAt = new Date(Date.now() + MEDIA_SYNC_LEASE_TTL_MS).toISOString();
  const result = await env2.DB.prepare(
    `INSERT INTO MetaAdsMediaSyncLeases (CrmTenantId, OwnerId, ExpiresAt)
     VALUES (?, ?, ?)
     ON CONFLICT(CrmTenantId) DO UPDATE SET OwnerId=excluded.OwnerId, ExpiresAt=excluded.ExpiresAt
       WHERE MetaAdsMediaSyncLeases.ExpiresAt < ?`
  ).bind(MEDIA_ASSET_TENANT, owner, expiresAt, (/* @__PURE__ */ new Date()).toISOString()).run();
  return { acquired: Number(result?.meta?.changes || 0) > 0, owner };
}
__name(acquireMediaSyncLease, "acquireMediaSyncLease");
async function releaseMediaSyncLease(env2, owner) {
  if (!owner || !env2?.DB?.prepare) return;
  await env2.DB.prepare(
    `DELETE FROM MetaAdsMediaSyncLeases WHERE CrmTenantId=? AND OwnerId=?`
  ).bind(MEDIA_ASSET_TENANT, owner).run().catch(() => null);
}
__name(releaseMediaSyncLease, "releaseMediaSyncLease");
async function leaseIsHeld(env2, owner) {
  if (!owner || !env2?.DB?.prepare) return false;
  const row = await env2.DB.prepare(
    `SELECT OwnerId, ExpiresAt FROM MetaAdsMediaSyncLeases WHERE CrmTenantId=?`
  ).bind(MEDIA_ASSET_TENANT).first();
  return String(row?.OwnerId || "") === owner && Date.parse(String(row?.ExpiresAt || "")) > Date.now();
}
__name(leaseIsHeld, "leaseIsHeld");
function knownImageAssetRow(row) {
  const mediaId = String(row?.MediaId || "");
  const key = mediaAssetKey(MEDIA_ASSET_KIND_IMAGE, mediaId);
  return key && String(row?.Kind || "") === MEDIA_ASSET_KIND_IMAGE && String(row?.R2Key || "") === key;
}
__name(knownImageAssetRow, "knownImageAssetRow");
async function cleanupInactiveMediaAssets(env2, adMeta, options = {}) {
  if (!env2?.DB?.prepare || !env2?.CRM_CACHE?.delete) return { deleted: 0, complete: false, reason: "storage_unavailable" };
  if (!await leaseIsHeld(env2, String(options.leaseOwner || ""))) return { deleted: 0, complete: false, reason: "lease_required" };
  const activeIds = /* @__PURE__ */ new Set();
  let unknownStatus = false;
  for (const ad of Object.values(adMeta || {})) {
    const active = isActiveMetaAd(ad);
    if (active === null) unknownStatus = true;
    if (active === true) {
      const id2 = String(ad?.creative?.id || "");
      if (id2) activeIds.add(id2);
    }
  }
  if (unknownStatus) return { deleted: 0, complete: false, reason: "status_unknown" };
  const limit = Number(options.limit || MEDIA_ASSET_CLEANUP_MAX);
  const rows = await env2.DB.prepare(
    `SELECT CrmTenantId, Kind, MediaId, R2Key, State, UpdatedAt
       FROM MetaAdsMediaAssets
      WHERE CrmTenantId=? AND State='ready'
      ORDER BY UpdatedAt ASC, MediaId ASC
      LIMIT ?`
  ).bind(MEDIA_ASSET_TENANT, MEDIA_ASSET_MAX_ROWS + 1).all();
  const inventory = rows?.results || [];
  if (inventory.length > MEDIA_ASSET_MAX_ROWS) return { deleted: 0, complete: false, reason: "inventory_cap" };
  const candidates = inventory.filter((row) => knownImageAssetRow(row) && !activeIds.has(String(row.MediaId))).slice(0, Math.max(0, Math.min(limit, MEDIA_ASSET_CLEANUP_MAX)));
  let deleted = 0;
  const removed = [];
  for (const row of candidates) {
    if (!await leaseIsHeld(env2, String(options.leaseOwner || ""))) return { deleted, complete: false, reason: "lease_lost" };
    const key = String(row.R2Key);
    try {
      await env2.CRM_CACHE.delete(key);
      removed.push(String(row.MediaId));
      deleted++;
    } catch {
    }
  }
  if (removed.length) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const statements = removed.map((id2) => env2.DB.prepare(
      `UPDATE MetaAdsMediaAssets SET State='deleted', UpdatedAt=?
        WHERE CrmTenantId=? AND Kind=? AND MediaId=?`
    ).bind(now, MEDIA_ASSET_TENANT, MEDIA_ASSET_KIND_IMAGE, id2));
    await runBatch(env2, statements);
  }
  return { deleted, complete: true, reason: "ok" };
}
__name(cleanupInactiveMediaAssets, "cleanupInactiveMediaAssets");
async function boundedImageBody(response) {
  if (!response?.ok) return null;
  const contentType = imageMetadata(response.headers?.get("content-type"));
  const declared = Number(response.headers?.get("content-length"));
  if (!contentType || Number.isFinite(declared) && declared > PRIVATE_THUMB_MAX_BYTES) return null;
  if (!response.body?.getReader) {
    const bytes2 = new Uint8Array(await response.arrayBuffer());
    return bytes2.byteLength > 0 && bytes2.byteLength <= PRIVATE_THUMB_MAX_BYTES ? { bytes: bytes2, contentType } : null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value?.byteLength || 0;
      if (!total || total > PRIVATE_THUMB_MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.byteLength ? { bytes, contentType } : null;
}
__name(boundedImageBody, "boundedImageBody");
async function mirrorFetchedCreativeThumb(env2, creative, key, log3, outcome) {
  if (!env2?.CRM_CACHE) return false;
  const privateHead = await env2.CRM_CACHE.head(key).catch(() => null);
  const cachedVersion = String(privateHead?.customMetadata?.previewVersion || "");
  if (privateHead && cachedVersion === PRIVATE_THUMB_PREVIEW_VERSION && validPrivateThumb(privateHead)) return true;
  let source = null;
  const token = String(env2.META_AD_ACCESS_TOKEN || "").trim();
  const creativeId = String(creative?.id || "").trim();
  if (token && creativeId) {
    try {
      const params = new URLSearchParams({
        fields: "thumbnail_url,image_url",
        thumbnail_width: "2048",
        thumbnail_height: "2048",
        access_token: token
      });
      if (log3) log3.ApiCallsUsed = Number(log3.ApiCallsUsed || 0) + 1;
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 5e3);
      try {
        const res = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${creativeId}?${params}`,
          { method: "GET", redirect: "manual", signal: controller2.signal }
        );
        if (res.redirected) {
          outcome.reason = "graph_redirect";
          return false;
        }
        const data = await res.json();
        if (res.ok) source = trustedCreativeUrl(data?.image_url) || trustedCreativeUrl(data?.thumbnail_url);
        else outcome.reason = `graph_http_${res.status}`;
      } finally {
        clearTimeout(timer2);
      }
    } catch (error3) {
      outcome.reason = error3?.name === "AbortError" ? "timeout" : "graph_failed";
    }
  }
  if (!source) {
    source = trustedCreativeUrl(creative?.image_url);
    if (!source && !token) source = trustedCreativeUrl(creative?.thumbnail_url);
  }
  if (!source) {
    outcome.reason ||= "no_source";
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5e3);
  try {
    const response = await fetch(source, { method: "GET", redirect: "manual", signal: controller.signal });
    if (response.redirected) {
      outcome.reason = "image_redirect";
      return false;
    }
    if (!response.ok) {
      outcome.reason = `image_http_${response.status}`;
      return false;
    }
    const image = await boundedImageBody(response);
    if (!image) {
      outcome.reason = "image_invalid";
      return false;
    }
    await env2.CRM_CACHE.put(key, image.bytes, {
      httpMetadata: {
        contentType: image.contentType,
        cacheControl: PRIVATE_THUMB_CACHE_CONTROL
      },
      customMetadata: { previewVersion: PRIVATE_THUMB_PREVIEW_VERSION }
    });
    return true;
  } catch (error3) {
    outcome.reason = error3?.name === "AbortError" ? "timeout" : "r2_put_failed";
    return false;
  } finally {
    clearTimeout(timer);
  }
}
__name(mirrorFetchedCreativeThumb, "mirrorFetchedCreativeThumb");
async function mirrorFetchedCreativeThumbs(env2, adRows, adMeta, log3, stats2) {
  if (!env2?.CRM_CACHE) {
    mediaReason(stats2, "thumbnail", "cache_unavailable");
    return 0;
  }
  const creatives = /* @__PURE__ */ new Map();
  const ads = Object.values(adMeta || {}).sort((a, b) => Number(isActiveMetaAd(b) === true) - Number(isActiveMetaAd(a) === true));
  for (const ad of ads) {
    if (isActiveMetaAd(ad) !== true) continue;
    const creative = ad?.creative;
    const id2 = String(creative?.id || "");
    if (id2 && !creatives.has(id2)) creatives.set(id2, creative);
  }
  let attempted = 0;
  let copied = 0;
  let checked = 0;
  const readyIds = [];
  for (const [id2, creative] of creatives) {
    if (checked >= MEDIA_ASSET_MAX_ROWS) break;
    checked++;
    const key = `${THUMB_R2_PREFIX}${id2}`;
    const head = await env2.CRM_CACHE.head(key).catch(() => null);
    if (head && String(head?.customMetadata?.previewVersion || "") === PRIVATE_THUMB_PREVIEW_VERSION && validPrivateThumb(head)) {
      readyIds.push(id2);
      continue;
    }
    if (attempted >= PRIVATE_THUMB_MAX_PER_RUN) break;
    attempted++;
    if (stats2?.thumbnail) stats2.thumbnail.attempted++;
    const outcome = { reason: "unknown" };
    if (await mirrorFetchedCreativeThumb(env2, creative, key, log3, outcome)) {
      copied++;
      readyIds.push(id2);
      if (stats2?.thumbnail) stats2.thumbnail.success++;
    } else mediaReason(stats2, "thumbnail", outcome.reason);
  }
  const readySet = new Set(readyIds);
  let legacyChecked = 0;
  for (const ad of Object.values(adMeta || {})) {
    if (legacyChecked >= 100 || readyIds.length >= MEDIA_ASSET_MAX_ROWS) break;
    const id2 = String(ad?.creative?.id || "");
    if (!id2 || readySet.has(id2)) continue;
    legacyChecked++;
    const key = `${THUMB_R2_PREFIX}${id2}`;
    const head = await env2.CRM_CACHE.head(key).catch(() => null);
    if (head && validPrivateThumb(head)) {
      readyIds.push(id2);
      readySet.add(id2);
    }
  }
  await registerReadyMediaAssets(env2, readyIds);
  return copied;
}
__name(mirrorFetchedCreativeThumbs, "mirrorFetchedCreativeThumbs");
async function getAdThumbUrls(request, env2) {
  const base = String(env2.R2_PUBLIC_BASE || "").replace(/\/$/, "");
  if (!env2?.IMAGES || !base) return jsonError(500, "Server misconfigured");
  const raw = new URL(request.url).searchParams.get("ids") || "";
  const ids = [
    ...new Set(
      raw.split(",").map((s2) => s2.trim()).filter((s2) => /^[A-Za-z0-9_-]{1,64}$/.test(s2))
    )
  ].slice(0, THUMB_MAX_IDS);
  const urls = {};
  let fetched = 0;
  for (const id2 of ids) {
    const key = `${THUMB_R2_PREFIX}${id2}`;
    let exists = false;
    try {
      exists = !!await env2.IMAGES.head(key);
    } catch {
    }
    if (exists) {
      urls[id2] = `${base}/${key}`;
      continue;
    }
    if (fetched >= THUMB_MAX_FETCH_PER_CALL) {
      urls[id2] = null;
      continue;
    }
    fetched += 1;
    urls[id2] = await mirrorCreativeThumb(env2, id2, key) ? `${base}/${key}` : null;
  }
  return jsonOk({ urls });
}
__name(getAdThumbUrls, "getAdThumbUrls");
async function fillVideoLengths(env2, token, videoIds, log3, stats2) {
  const wanted = [...new Set((videoIds || []).filter(Boolean))];
  if (!wanted.length) return 0;
  const candidates = wanted.slice(0, 100);
  let known = /* @__PURE__ */ new Set();
  try {
    const placeholders = candidates.map(() => "?").join(",");
    const rows = await env2.DB.prepare(
      `SELECT VideoId FROM MetaVideos WHERE LengthSec > 0 AND VideoId IN (${placeholders})`
    ).bind(...candidates).all();
    known = new Set((rows?.results || []).map((r) => String(r.VideoId)));
  } catch (_) {
  }
  const missing = [];
  for (const id2 of candidates) {
    if (!known.has(String(id2))) missing.push(String(id2));
  }
  if (!missing.length) return 0;
  const batch = missing.slice(0, VIDEO_PREVIEW_MAX_PER_RUN);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmts = [];
  for (const id2 of batch) {
    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/${id2}?fields=length,title&access_token=${encodeURIComponent(token)}`;
      if (log3) log3.ApiCallsUsed = Number(log3.ApiCallsUsed || 0) + 1;
      if (stats2?.video) stats2.video.attempted++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5e3);
      try {
        const res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
        const data = await res.json();
        if (res.redirected) {
          mediaReason(stats2, "video", "graph_redirect");
          continue;
        }
        if (!res.ok) {
          mediaReason(stats2, "video", `graph_http_${res.status}`);
          continue;
        }
        const len = Number(data?.length || 0);
        if (!len) {
          mediaReason(stats2, "video", "length_missing");
          continue;
        }
        if (stats2?.video) stats2.video.success++;
        stmts.push(
          env2.DB.prepare(
            `INSERT INTO MetaVideos (VideoId, LengthSec, Title, FetchedAt, CreatedAt)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(VideoId) DO UPDATE SET
               LengthSec=excluded.LengthSec,
               Title=excluded.Title,
               FetchedAt=excluded.FetchedAt`
          ).bind(String(id2), len, String(data?.title || ""), now, now)
        );
      } finally {
        clearTimeout(timer);
      }
    } catch (error3) {
      mediaReason(stats2, "video", error3?.name === "AbortError" ? "timeout" : "graph_failed");
    }
  }
  if (stmts.length) await runBatch(env2, stmts);
  return stmts.length;
}
__name(fillVideoLengths, "fillVideoLengths");
var MAX_AD_META_PAGES = 5;
var MAX_AD_META_ROWS = 500;
async function fetchAdMeta(token, accountId, log3) {
  let requests = 0;
  async function fetchFields(fields) {
    const params = new URLSearchParams({ fields, limit: "100", access_token: token });
    let url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads?${params}`;
    const seen = /* @__PURE__ */ new Set();
    const rows = [];
    for (let page = 0; page < MAX_AD_META_PAGES; page++) {
      if (seen.has(url)) {
        const err2 = new Error("Meta ads pagination cursor repeated");
        err2.code = "meta_ads_pagination_cap";
        throw err2;
      }
      seen.add(url);
      if (requests >= MAX_AD_META_PAGES) {
        const err2 = new Error("Meta ads pagination request cap reached");
        err2.code = "meta_ads_pagination_cap";
        throw err2;
      }
      requests++;
      if (log3) log3.ApiCallsUsed = Number(log3.ApiCallsUsed || 0) + 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5e3);
      let data2;
      let res;
      try {
        res = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
        data2 = await res.json();
      } finally {
        clearTimeout(timer);
      }
      if (res.redirected) {
        const err2 = new Error("Meta ads redirect rejected");
        err2.code = "meta_ads_redirect";
        throw err2;
      }
      if (!res.ok) {
        const err2 = new Error(`Meta ads ${res.status}: ${data2?.error?.message || "unknown"}`);
        err2.metaError = data2?.error;
        throw err2;
      }
      if (!Array.isArray(data2?.data)) {
        const err2 = new Error("Meta ads response missing data");
        err2.code = "meta_ads_invalid_response";
        throw err2;
      }
      rows.push(...Array.isArray(data2?.data) ? data2.data : []);
      if (rows.length > MAX_AD_META_ROWS) {
        const err2 = new Error("Meta ads catalog row cap reached");
        err2.code = "meta_ads_pagination_cap";
        throw err2;
      }
      const next = String(data2?.paging?.next || "");
      if (!next) return rows;
      if (!/^https:\/\/graph\.facebook\.com\//i.test(next)) {
        const err2 = new Error("Meta ads pagination URL rejected");
        err2.code = "meta_ads_pagination_cap";
        throw err2;
      }
      url = next;
    }
    const err = new Error("Meta ads pagination page cap reached");
    err.code = "meta_ads_pagination_cap";
    throw err;
  }
  __name(fetchFields, "fetchFields");
  let data;
  try {
    data = await fetchFields(AD_META_FIELDS);
  } catch (expandedError) {
    if (expandedError?.code === "meta_ads_pagination_cap") throw expandedError;
    data = await fetchFields(AD_META_FIELDS_FALLBACK).catch(() => {
      throw expandedError;
    });
  }
  const map = {};
  for (const a of data || []) {
    map[a.id] = a;
  }
  return map;
}
__name(fetchAdMeta, "fetchAdMeta");
function buildMetaCreativeCatalogStmt(env2, ad, snapshotDate) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const creative = ad?.creative || {};
  const adset = ad?.adset || {};
  const campaign = ad?.campaign || {};
  return env2.DB.prepare(
    `INSERT INTO MetaAdsCreativeCatalog
       (CrmTenantId, SnapshotDate, AdId, AdName, AdsetId, AdsetName,
        CampaignId, CampaignName, CreativeId, CreativeType, VideoId, Status, UpdatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(CrmTenantId, SnapshotDate, AdId) DO UPDATE SET
       AdName=excluded.AdName, AdsetId=excluded.AdsetId, AdsetName=excluded.AdsetName,
       CampaignId=excluded.CampaignId, CampaignName=excluded.CampaignName,
       CreativeId=excluded.CreativeId, CreativeType=excluded.CreativeType,
       VideoId=excluded.VideoId, Status=excluded.Status, UpdatedAt=excluded.UpdatedAt`
  ).bind(
    "day1design",
    snapshotDate,
    String(ad?.id || ""),
    String(ad?.name || ""),
    String(adset.id || ""),
    String(adset.name || ""),
    String(campaign.id || ""),
    String(campaign.name || ""),
    String(creative.id || ""),
    String(creative.object_type || ""),
    String(creative.video_id || ""),
    metaAdStatus(ad),
    now
  );
}
__name(buildMetaCreativeCatalogStmt, "buildMetaCreativeCatalogStmt");
async function saveMetaCreativeCatalog(env2, adMeta, snapshotDate) {
  const stmts = Object.values(adMeta || {}).filter((ad) => String(ad?.id || "")).slice(0, MAX_AD_META_ROWS).map((ad) => buildMetaCreativeCatalogStmt(env2, ad, snapshotDate));
  if (stmts.length) await runBatch(env2, stmts);
  return stmts.length;
}
__name(saveMetaCreativeCatalog, "saveMetaCreativeCatalog");
function creativeAssetValue(value, key) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  if (key === "linkUrl") return String(value.website_url || value.url || "").trim();
  return String(value.text || value.type || "").trim();
}
__name(creativeAssetValue, "creativeAssetValue");
function normalizeCreativeCopy(creative = {}) {
  const feed = creative?.asset_feed_spec && typeof creative.asset_feed_spec === "object" ? creative.asset_feed_spec : {};
  const fields = [
    ["titles", "title"],
    ["bodies", "body"],
    ["call_to_action_types", "callToAction"],
    ["link_urls", "linkUrl"]
  ];
  const variants = [];
  let feedCount = 0;
  for (const [source, target] of fields) {
    const values = Array.isArray(feed[source]) ? feed[source].slice(0, 8) : [];
    feedCount += values.length;
    values.forEach((value, index) => {
      const text = creativeAssetValue(value, target);
      if (!text || variants.length >= 32) return;
      variants.push({ type: "asset_feed_spec", provenance: `asset_feed_spec.${source}[${index}]`, [target]: text });
    });
  }
  if (feedCount > 0) {
    return { title: "", body: "", callToAction: "", linkUrl: "", variants };
  }
  const linkData = creative?.object_story_spec?.link_data || {};
  const videoData = creative?.object_story_spec?.video_data || {};
  return {
    title: String(linkData.name || videoData.title || "").trim(),
    body: String(linkData.message || videoData.message || "").trim(),
    callToAction: String(linkData.call_to_action?.type || videoData.call_to_action?.type || "").trim(),
    linkUrl: String(linkData.link || linkData.call_to_action?.value?.link || videoData.call_to_action?.value?.link || "").trim(),
    variants: []
  };
}
__name(normalizeCreativeCopy, "normalizeCreativeCopy");
async function fetchBreakdown(token, accountId, startDate, endDate, breakdowns) {
  const params = new URLSearchParams({
    fields: "impressions,clicks,spend,ctr,cpc,reach,actions,inline_link_clicks,video_play_actions",
    breakdowns,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: "1",
    limit: "500",
    access_token: token
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights?${params}`;
  const all = [];
  const MAX_PAGES = 10;
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < MAX_PAGES && url; i++) {
    if (seen.has(url)) {
      const err2 = new Error(`Meta breakdown(${breakdowns}) pagination cursor repeated`);
      err2.code = "meta_breakdown_pagination_cap";
      throw err2;
    }
    seen.add(url);
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      const err2 = new Error(
        `Meta breakdown(${breakdowns}) ${res.status}: ${data?.error?.message || "unknown"}`
      );
      err2.metaError = data?.error;
      throw err2;
    }
    if (!Array.isArray(data?.data)) {
      const err2 = new Error(`Meta breakdown(${breakdowns}) response missing data`);
      err2.code = "meta_breakdown_invalid_response";
      throw err2;
    }
    all.push(...data.data);
    const next = String(data?.paging?.next || "");
    if (!next) return all;
    if (!/^https:\/\/graph\.facebook\.com\//i.test(next)) {
      const err2 = new Error(`Meta breakdown(${breakdowns}) pagination URL rejected`);
      err2.code = "meta_breakdown_pagination_cap";
      throw err2;
    }
    if (i === MAX_PAGES - 1) {
      const err2 = new Error(`Meta breakdown(${breakdowns}) page cap reached`);
      err2.code = "meta_breakdown_pagination_cap";
      throw err2;
    }
    url = next;
  }
  const err = new Error(`Meta breakdown(${breakdowns}) incomplete`);
  err.code = "meta_breakdown_pagination_cap";
  throw err;
}
__name(fetchBreakdown, "fetchBreakdown");
function isRateLimit(e) {
  const code = e?.metaError?.code;
  return code === 4 || code === 17 || code === 32 || code === 613;
}
__name(isRateLimit, "isRateLimit");
function firstActionValue(arr, types) {
  if (!Array.isArray(arr)) return 0;
  for (const a of arr) {
    if (types.includes(a.action_type)) return Number(a.value || 0);
  }
  return 0;
}
__name(firstActionValue, "firstActionValue");
function nullableVideoPlays(row) {
  if (!Object.prototype.hasOwnProperty.call(row || {}, "video_play_actions")) return null;
  if (!Array.isArray(row.video_play_actions)) return null;
  const action = row.video_play_actions.find((item) => ["video_view", "video_play"].includes(item?.action_type));
  return action ? Number(action.value || 0) : null;
}
__name(nullableVideoPlays, "nullableVideoPlays");
function explicitVideoPlay(row) {
  if (!Object.prototype.hasOwnProperty.call(row || {}, "video_play_actions")) return { kind: "missing" };
  if (!Array.isArray(row.video_play_actions)) return { kind: "invalid" };
  const actions = row.video_play_actions.filter((item) => ["video_view", "video_play"].includes(item?.action_type));
  if (actions.length === 0) return { kind: "missing" };
  if (actions.length !== 1) return { kind: "invalid" };
  const raw = actions[0]?.value;
  const value = typeof raw === "number" ? raw : String(raw ?? "").trim() === "" ? NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) return { kind: "invalid" };
  return { kind: "explicit", value };
}
__name(explicitVideoPlay, "explicitVideoPlay");
function reconcileVideoBreakdown(accountRows, breakdownRows, dimension) {
  if (!["platform", "age_gender"].includes(dimension)) throw new Error("video_partition_dimension_invalid");
  const accounts = /* @__PURE__ */ new Map();
  const dateOf = /* @__PURE__ */ __name((row) => {
    const date = String(row?.date_start || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || row.date_stop && row.date_stop !== date) throw new Error("video_partition_day_invalid");
    return date;
  }, "dateOf");
  for (const row of accountRows || []) {
    const date = dateOf(row);
    if (accounts.has(date)) throw new Error("video_partition_duplicate_account");
    accounts.set(date, explicitVideoPlay(row));
  }
  const grouped = /* @__PURE__ */ new Map();
  const keys = /* @__PURE__ */ new Set();
  for (const row of breakdownRows || []) {
    const date = dateOf(row);
    const parts = dimension === "platform" ? [row.publisher_platform] : [row.age, row.gender];
    if (parts.some((value) => typeof value !== "string" || !value.trim())) throw new Error("video_partition_group_invalid");
    const key = JSON.stringify([date, ...parts]);
    if (keys.has(key)) throw new Error("video_partition_duplicate_group");
    keys.add(key);
    if (explicitVideoPlay(row).kind === "invalid") throw new Error("video_partition_metric_invalid");
    const rows = grouped.get(date) || [];
    rows.push(row);
    grouped.set(date, rows);
  }
  const evidence = { dimension, completeDays: 0, publishedDays: 0, omittedUnobserved: 0, invalidDays: 0, partialDays: 0, reasons: [] };
  const snapshots = [];
  for (const [date, rows] of grouped) {
    const control = accounts.get(date);
    const observed = rows.map(explicitVideoPlay).filter((value) => value.kind === "explicit");
    const sum = observed.reduce((total, value) => total + value.value, 0);
    if (!Number.isSafeInteger(sum)) throw new Error("video_partition_total_invalid");
    const complete = control?.kind === "explicit" && observed.length > 0 && sum === control.value;
    const missing = rows.length - observed.length;
    evidence.omittedUnobserved += missing;
    if (complete) {
      evidence.completeDays++;
      evidence.publishedDays++;
    } else {
      evidence.partialDays++;
      evidence.reasons.push(`${date}:unreconciled_account_total`);
    }
    snapshots.push({ date, dimension, rows: rows.map((row) => ({
      ...row,
      __videoPlaysSource: explicitVideoPlay(row).kind === "explicit" ? "meta_action" : complete ? "account_total_reconciled" : null
    })) });
  }
  return { snapshots, evidence };
}
__name(reconcileVideoBreakdown, "reconcileVideoBreakdown");
function preferredActionValue(arr, types) {
  if (!Array.isArray(arr)) return 0;
  for (const type of types) {
    const action = arr.find((item) => item.action_type === type);
    if (action) return Number(action.value || 0) || 0;
  }
  return 0;
}
__name(preferredActionValue, "preferredActionValue");
function mapInsight(row) {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  const leads = preferredActionValue(actions, [
    "offsite_complete_registration_add_meta_leads",
    "lead"
  ]);
  return {
    Impressions: Number(row.impressions || 0),
    Clicks: Number(row.clicks || 0),
    LinkClicks: Number(row.inline_link_clicks || 0),
    Spend: Number(row.spend || 0),
    Ctr: Number(row.ctr || 0),
    Cpc: Number(row.cpc || 0),
    Reach: Number(row.reach || 0),
    Frequency: Number(row.frequency || 0),
    Leads: leads,
    ActionsJson: JSON.stringify(actions),
    VideoP25Watched: firstActionValue(row.video_p25_watched_actions, [
      "video_view"
    ]),
    VideoP50Watched: firstActionValue(row.video_p50_watched_actions, [
      "video_view"
    ]),
    VideoP75Watched: firstActionValue(row.video_p75_watched_actions, [
      "video_view"
    ]),
    VideoP100Watched: firstActionValue(row.video_p100_watched_actions, [
      "video_view"
    ]),
    VideoAvgWatchSec: firstActionValue(row.video_avg_time_watched_actions, [
      "video_view"
    ]),
    ThruPlay: firstActionValue(row.video_thruplay_watched_actions, [
      "video_view"
    ]),
    VideoPlays: firstActionValue(row.video_play_actions, ["video_view"]),
    Video2SecViews: firstActionValue(
      row.video_continuous_2_sec_watched_actions,
      ["video_view"]
    ),
    UniqueClicks: Number(row.unique_clicks || 0),
    UniqueLinkClicks: Number(row.unique_inline_link_clicks || 0),
    CostPerLinkClick: Number(row.cost_per_inline_link_click || 0)
  };
}
__name(mapInsight, "mapInsight");
var DAILY_COLS = [
  "EntityName",
  "Status",
  "Objective",
  "Impressions",
  "Clicks",
  "LinkClicks",
  "Spend",
  "Ctr",
  "Cpc",
  "Reach",
  "Frequency",
  "Leads",
  "ActionsJson",
  "VideoP25Watched",
  "VideoP50Watched",
  "VideoP75Watched",
  "VideoP100Watched",
  "VideoAvgWatchSec",
  "ThruPlay",
  "VideoPlays",
  "Video2SecViews",
  "UniqueClicks",
  "UniqueLinkClicks",
  "CostPerLinkClick",
  "FetchedAt"
];
function buildDailyStmt(env2, fields) {
  const id2 = generateId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const setClause = DAILY_COLS.map((c) => `${c}=excluded.${c}`).join(", ");
  const placeholders = [
    "?",
    "?",
    "?",
    "?",
    "?",
    ...DAILY_COLS.map(() => "?"),
    "?"
  ].join(",");
  const sql = `INSERT INTO MetaAdsDaily
    (id, CrmTenantId, Date, Level, EntityId, ${DAILY_COLS.join(",")}, CreatedAt)
     VALUES (${placeholders})
     ON CONFLICT(Date, Level, EntityId) DO UPDATE SET
       CrmTenantId=COALESCE(NULLIF(MetaAdsDaily.CrmTenantId,''), excluded.CrmTenantId), ${setClause}
     WHERE MetaAdsDaily.CrmTenantId IS NULL OR MetaAdsDaily.CrmTenantId='' OR MetaAdsDaily.CrmTenantId=excluded.CrmTenantId`;
  const values = [id2, "day1design", fields.Date, fields.Level, fields.EntityId];
  for (const c of DAILY_COLS)
    values.push(fields[c] ?? (typeof fields[c] === "number" ? 0 : ""));
  values.push(now);
  return env2.DB.prepare(sql).bind(...values);
}
__name(buildDailyStmt, "buildDailyStmt");
var AD_COLS = [
  "AdName",
  "AdsetId",
  "AdsetName",
  "CampaignId",
  "CampaignName",
  "CreativeId",
  "CreativeType",
  "VideoId",
  "ThumbnailUrl",
  "CreativeTitle",
  "CreativeBody",
  "CreativeCallToAction",
  "CreativeLinkUrl",
  "CreativeVariants",
  "Status",
  "Impressions",
  "Clicks",
  "LinkClicks",
  "Spend",
  "Ctr",
  "Cpc",
  "Reach",
  "Leads",
  "ThruPlay",
  "VideoAvgWatchSec",
  "VideoPlays",
  "Video2SecViews",
  "VideoP25Watched",
  "VideoP50Watched",
  "VideoP75Watched",
  "VideoP100Watched",
  "FetchedAt"
];
function buildAdStmt(env2, fields) {
  const id2 = generateId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const copyCols = /* @__PURE__ */ new Set(["CreativeTitle", "CreativeBody", "CreativeCallToAction", "CreativeLinkUrl", "CreativeVariants"]);
  const setClause = AD_COLS.map((c) => copyCols.has(c) ? `${c}=CASE WHEN NULLIF(excluded.CreativeId,'') IS NOT NULL AND excluded.CreativeId<>MetaAdsAd.CreativeId THEN excluded.${c} ELSE COALESCE(NULLIF(excluded.${c},''),MetaAdsAd.${c}) END` : `${c}=excluded.${c}`).join(", ");
  const placeholders = ["?", "?", "?", "?", ...AD_COLS.map(() => "?"), "?"].join(
    ","
  );
  const sql = `INSERT INTO MetaAdsAd
      (id, CrmTenantId, Date, AdId, ${AD_COLS.join(",")}, CreatedAt)
     VALUES (${placeholders})
     ON CONFLICT(Date, AdId) DO UPDATE SET
       CrmTenantId=COALESCE(NULLIF(MetaAdsAd.CrmTenantId,''), excluded.CrmTenantId), ${setClause}
     WHERE MetaAdsAd.CrmTenantId IS NULL OR MetaAdsAd.CrmTenantId='' OR MetaAdsAd.CrmTenantId=excluded.CrmTenantId`;
  const values = [id2, "day1design", fields.Date, fields.AdId];
  for (const c of AD_COLS) values.push(fields[c] ?? "");
  values.push(now);
  return env2.DB.prepare(sql).bind(...values);
}
__name(buildAdStmt, "buildAdStmt");
var BRK_COLS = [
  "Impressions",
  "Clicks",
  "LinkClicks",
  "Spend",
  "Ctr",
  "Cpc",
  "Reach",
  "Leads",
  "VideoPlays",
  "VideoPlaysSource",
  "FetchedAt"
];
function buildBreakdownStmt(env2, fields) {
  const id2 = generateId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const setClause = BRK_COLS.map((c) => `${c}=excluded.${c}`).join(", ");
  const placeholders = [
    "?",
    "?",
    "?",
    "?",
    "?",
    "?",
    ...BRK_COLS.map(() => "?"),
    "?"
  ].join(",");
  const sql = `INSERT INTO MetaAdsBreakdown
      (id, CrmTenantId, Date, Dimension, DimensionValue, DimensionSub, ${BRK_COLS.join(",")}, CreatedAt)
     VALUES (${placeholders})
     ON CONFLICT(Date, Dimension, DimensionValue, DimensionSub) DO UPDATE SET
       CrmTenantId=COALESCE(NULLIF(MetaAdsBreakdown.CrmTenantId,''), excluded.CrmTenantId), ${setClause}
     WHERE MetaAdsBreakdown.CrmTenantId IS NULL OR MetaAdsBreakdown.CrmTenantId='' OR MetaAdsBreakdown.CrmTenantId=excluded.CrmTenantId`;
  const values = [
    id2,
    "day1design",
    fields.Date,
    fields.Dimension,
    fields.DimensionValue,
    fields.DimensionSub || ""
  ];
  for (const c of BRK_COLS) values.push(fields[c] === void 0 ? "" : fields[c]);
  values.push(now);
  return env2.DB.prepare(sql).bind(...values);
}
__name(buildBreakdownStmt, "buildBreakdownStmt");
async function writeBreakdownSnapshots(env2, snapshots, fetchedAt) {
  for (const snapshot of snapshots) {
    if (!["platform", "age_gender"].includes(snapshot?.dimension) || !Array.isArray(snapshot.rows) || snapshot.rows.length > 98) throw new Error("video_snapshot_batch_limit");
  }
  for (const snapshot of snapshots) {
    if (!snapshot?.date || !snapshot.dimension || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0) continue;
    const statements = [env2.DB.prepare(
      `DELETE FROM MetaAdsBreakdown WHERE CrmTenantId=? AND Date=? AND Dimension=?`
    ).bind("day1design", snapshot.date, snapshot.dimension)];
    for (const row of snapshot.rows) {
      const [value, sub] = snapshot.dimension === "platform" ? [row.publisher_platform || "", ""] : [`${row.age || ""}_${row.gender || ""}`, ""];
      if (!value) continue;
      statements.push(buildBreakdownStmt(env2, {
        Date: snapshot.date,
        Dimension: snapshot.dimension,
        DimensionValue: value,
        DimensionSub: sub,
        ...mapInsight(row),
        VideoPlays: explicitVideoPlay(row).kind === "explicit" ? explicitVideoPlay(row).value : row.__videoPlaysSource === "account_total_reconciled" ? 0 : null,
        VideoPlaysSource: row.__videoPlaysSource || null,
        FetchedAt: fetchedAt
      }));
    }
    if (statements.length === 1) continue;
    statements.push(env2.DB.prepare(
      `INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES (?,1,?)
       ON CONFLICT(tenant_id) DO UPDATE SET version=CrmDataRevisions.version+1, updated_at=excluded.updated_at`
    ).bind("day1design", (/* @__PURE__ */ new Date()).toISOString()));
    await env2.DB.batch(statements);
  }
}
__name(writeBreakdownSnapshots, "writeBreakdownSnapshots");
async function runBatch(env2, stmts, revisionTenantId = "") {
  const CHUNK = revisionTenantId ? 99 : 100;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    const batch = stmts.slice(i, i + CHUNK);
    if (revisionTenantId) {
      batch.push(env2.DB.prepare(
        `INSERT INTO CrmDataRevisions(tenant_id,version,updated_at) VALUES (?,1,?)
         ON CONFLICT(tenant_id) DO UPDATE SET version=CrmDataRevisions.version+1, updated_at=excluded.updated_at`
      ).bind(revisionTenantId, (/* @__PURE__ */ new Date()).toISOString()));
    }
    await env2.DB.batch(batch);
  }
}
__name(runBatch, "runBatch");
async function writeLog(env2, fields) {
  try {
    const id2 = generateId();
    await env2.DB.prepare(
      `INSERT INTO MetaSyncLog
         (id, SyncType, Status, DateRangeStart, DateRangeEnd,
          ApiCallsUsed, RecordsUpdated, ErrorCode, ErrorMessage,
          StartedAt, CompletedAt, CreatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id2,
      fields.SyncType,
      fields.Status,
      fields.DateRangeStart,
      fields.DateRangeEnd,
      fields.ApiCallsUsed,
      fields.RecordsUpdated,
      fields.ErrorCode,
      fields.ErrorMessage,
      fields.StartedAt,
      fields.CompletedAt,
      fields.CreatedAt
    ).run();
  } catch {
  }
}
__name(writeLog, "writeLog");
function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1e3);
}
__name(kstNow, "kstNow");
function kstYesterday() {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
__name(kstYesterday, "kstYesterday");
function kstDaysAgo(n) {
  const d = kstNow();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
__name(kstDaysAgo, "kstDaysAgo");
function kstToday2() {
  return kstNow().toISOString().slice(0, 10);
}
__name(kstToday2, "kstToday");
function rangeDays(days) {
  const end = kstYesterday();
  const endDt = /* @__PURE__ */ new Date(end + "T00:00:00Z");
  const startDt = new Date(endDt);
  startDt.setUTCDate(startDt.getUTCDate() - (days - 1));
  const minStart = "2026-02-02";
  const startStr = startDt.toISOString().slice(0, 10);
  return {
    startDate: startStr < minStart ? minStart : startStr,
    endDate: end
  };
}
__name(rangeDays, "rangeDays");
function resolveRangeFromQuery(url) {
  const key = String(url.searchParams.get("range") || "30");
  const minStart = "2026-02-02";
  const todayStr = kstToday2();
  const yesterdayStr = kstYesterday();
  const clampStart = /* @__PURE__ */ __name((s2) => s2 < minStart ? minStart : s2, "clampStart");
  if (key === "today") {
    return { key, startDate: todayStr, endDate: todayStr };
  }
  if (key === "7" || key === "30") {
    return rangeDays(Number(key));
  }
  if (key === "cur-month") {
    const now = kstNow();
    const start = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { key, startDate: clampStart(start), endDate: yesterdayStr };
  }
  if (key === "prev-month") {
    const now = kstNow();
    const prev = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );
    const start = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)
    );
    const end = lastDay.toISOString().slice(0, 10);
    return { key, startDate: clampStart(start), endDate: end };
  }
  if (key === "all") {
    return { key, startDate: minStart, endDate: yesterdayStr };
  }
  if (key === "custom") {
    const qsStart = String(url.searchParams.get("start") || "").trim();
    const qsEnd = String(url.searchParams.get("end") || "").trim();
    const validDate = /* @__PURE__ */ __name((s2) => /^\d{4}-\d{2}-\d{2}$/.test(s2), "validDate");
    const startDate = validDate(qsStart) ? clampStart(qsStart) : minStart;
    const endDate = validDate(qsEnd) ? qsEnd : yesterdayStr;
    return { key, startDate, endDate };
  }
  return rangeDays(30);
}
__name(resolveRangeFromQuery, "resolveRangeFromQuery");

// src/routes/brief.js
var MAX_DAYS = 180;
function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 36e5 - offsetDays * 864e5);
  return now.toISOString().slice(0, 10);
}
__name(kstDate, "kstDate");
function isDate(s2) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s2 || ""));
}
__name(isDate, "isDate");
function shiftDate(ymd, deltaDays) {
  const d = /* @__PURE__ */ new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
__name(shiftDate, "shiftDate");
function resolveRange2(url) {
  const key = String(url.searchParams.get("range") || "").trim();
  const yesterday = kstDate(1);
  const today = kstDate(0);
  const byDays = /* @__PURE__ */ __name((n) => {
    const days = Math.min(Math.max(Math.round(n) || 30, 1), MAX_DAYS);
    return {
      key: days === 7 || days === 30 ? String(days) : "custom",
      startDate: kstDate(days),
      endDate: yesterday,
      days
    };
  }, "byDays");
  if (key === "today") {
    return { key: "today", startDate: today, endDate: today, days: 1 };
  }
  if (key === "cur-month") {
    const start = `${today.slice(0, 7)}-01`;
    const startDate = start > yesterday ? yesterday : start;
    return {
      key: "custom",
      startDate,
      endDate: yesterday,
      days: null,
      label: "cur-month"
    };
  }
  if (key === "prev-month") {
    const firstOfThis = /* @__PURE__ */ new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    const endDate = shiftDate(firstOfThis.toISOString().slice(0, 10), -1);
    const startDate = `${endDate.slice(0, 7)}-01`;
    return {
      key: "custom",
      startDate,
      endDate,
      days: null,
      label: "prev-month"
    };
  }
  if (key === "custom") {
    const s2 = url.searchParams.get("start");
    const e = url.searchParams.get("end");
    if (isDate(s2) && isDate(e) && s2 <= e) {
      return {
        key: "custom",
        startDate: s2,
        endDate: e,
        days: null,
        label: "custom"
      };
    }
    return byDays(30);
  }
  if (key === "7" || key === "30") return byDays(Number(key));
  return byDays(Number(url.searchParams.get("days") || 30));
}
__name(resolveRange2, "resolveRange");
async function readJson2(res) {
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}
__name(readJson2, "readJson");
async function collectLeads(env2, period) {
  const since = (/* @__PURE__ */ new Date(`${period.startDate}T00:00:00+09:00`)).toISOString();
  const until = (/* @__PURE__ */ new Date(
    `${shiftDate(period.endDate, 1)}T00:00:00+09:00`
  )).toISOString();
  const out = {
    since,
    until,
    startDate: period.startDate,
    endDate: period.endDate,
    total: 0,
    bySource: [],
    byStatus: [],
    daily: [],
    byCampaign: [],
    error: ""
  };
  try {
    const [totalRow, bySource, byStatus, daily, byCampaign] = await Promise.all(
      [
        env2.DB.prepare(
          `SELECT COUNT(*) AS n FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?`
        ).bind(since, until).first(),
        env2.DB.prepare(
          `SELECT COALESCE(NULLIF(Source, ''), '\uBBF8\uC0C1') AS source, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY source
          ORDER BY n DESC`
        ).bind(since, until).all(),
        env2.DB.prepare(
          `SELECT COALESCE(NULLIF(Status, ''), '\uBBF8\uC0C1') AS status, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY status
          ORDER BY n DESC`
        ).bind(since, until).all(),
        // 일자는 KST 로 끊는다. UTC 로 자르면 09시 이전 접수가 전날로 잡혀
        // 광고 일자별 지표와 하루씩 어긋난다
        env2.DB.prepare(
          `SELECT substr(datetime(SubmittedAt, '+9 hours'), 1, 10) AS day, COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY day
          ORDER BY day ASC`
        ).bind(since, until).all(),
        // 캠페인별 접수. Estimates.Campaign 에 광고 캠페인명이 그대로 들어와 있어
        // 광고비와 이름으로 붙일 수 있다. 이걸 안 주면 "어느 캠페인이 돈값을 하는가"를
        // 아무도 말할 수 없고, 보고는 총계만 읊는 평면적인 글이 된다
        env2.DB.prepare(
          `SELECT COALESCE(NULLIF(Campaign, ''), '(\uCEA0\uD398\uC778 \uC5C6\uC74C)') AS campaign,
                COALESCE(NULLIF(Platform, ''), '(\uBBF8\uC0C1)') AS platform,
                COUNT(*) AS n
           FROM Estimates
          WHERE SubmittedAt >= ? AND SubmittedAt < ?
          GROUP BY campaign, platform
          ORDER BY n DESC`
        ).bind(since, until).all()
      ]
    );
    out.total = Number(totalRow?.n) || 0;
    out.bySource = bySource?.results || [];
    out.byStatus = byStatus?.results || [];
    out.daily = daily?.results || [];
    out.byCampaign = byCampaign?.results || [];
  } catch (e) {
    out.error = String(e?.message || "").slice(0, 120);
  }
  return out;
}
__name(collectLeads, "collectLeads");
function unwrap(node, key) {
  if (!node) return null;
  if (Array.isArray(node)) return node;
  if (key && node[key] !== void 0) return node[key];
  if (Array.isArray(node.rows)) return node.rows;
  if (Array.isArray(node.results)) return node.results;
  return node;
}
__name(unwrap, "unwrap");
var HEAVY_FIELDS = ["ThumbnailUrl", "thumbnailUrl", "thumbUrl", "imageUrl"];
function stripHeavy(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    if (!r || typeof r !== "object") return r;
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (HEAVY_FIELDS.includes(k)) continue;
      out[k] = v;
    }
    return out;
  });
}
__name(stripHeavy, "stripHeavy");
function condenseAds(overview) {
  if (!overview || overview.ok === false) {
    return { available: false, reason: "\uAD11\uACE0 \uB370\uC774\uD130\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4" };
  }
  const b = overview.breakdown || {};
  return {
    available: true,
    range: overview.range || null,
    summary: unwrap(overview.summary, "summary"),
    lastSyncedAt: overview.summary?.lastSyncedAt || "",
    campaigns: unwrap(overview.campaigns, "campaigns"),
    ads: stripHeavy(unwrap(overview.ads, "ads")),
    efficiency: overview.efficiency || null,
    // 일자별 지표. 이게 없으면 "언제부터 꺾였나"를 아무도 말할 수 없다
    daily: overview.efficiency?.daily || [],
    breakdown: {
      platform: unwrap(b.platform),
      position: unwrap(b.position),
      device: unwrap(b.device),
      ageGender: unwrap(b.age_gender),
      region: unwrap(b.region)
    },
    dow: unwrap(overview.dow, "rows"),
    // 168칸(요일 x 시간)이라 커 보이지만, 언제 사람이 반응하는지는 여기서만 나온다
    hourHeatmap: unwrap(overview.hourHeatmap, "cells"),
    syncedAt: overview.cachedAt || ""
  };
}
__name(condenseAds, "condenseAds");
function condenseTraffic(summary) {
  if (!summary || summary.ok === false) {
    return { available: false, reason: "\uC720\uC785 \uB370\uC774\uD130\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4" };
  }
  return {
    available: true,
    summary: summary.summary || null,
    // 유입 출처도 자르지 않는다. 꼬리에 있는 소수 경로가 접수로는 앞설 수 있다
    sources: Array.isArray(summary.sources) ? summary.sources : [],
    trend: Array.isArray(summary.trend) ? summary.trend : [],
    freshness: summary.freshness || null
  };
}
__name(condenseTraffic, "condenseTraffic");
function deriveEfficiency(ads, leads) {
  const spend = Number(ads?.summary?.spend) || 0;
  const total = Number(leads?.total) || 0;
  const clicks = Number(ads?.summary?.clicks) || 0;
  return {
    spend,
    leads: total,
    costPerLead: total > 0 ? Math.round(spend / total) : null,
    clickToLeadRate: clicks > 0 ? Number((total / clicks * 100).toFixed(2)) : null,
    note: "costPerLead \uB294 \uC804\uCCB4 \uC811\uC218 \uAE30\uC900\uC774\uB77C Meta \uC678 \uC720\uC785\uB3C4 \uBD84\uBAA8\uC5D0 \uB4E4\uC5B4\uAC04\uB2E4. \uAD11\uACE0\uB9CC\uC758 \uB2E8\uAC00\uB294 leads.bySource \uC5D0\uC11C Meta \uACC4\uC5F4\uB9CC \uACE8\uB77C \uB2E4\uC2DC \uACC4\uC0B0\uD574\uC57C \uD55C\uB2E4."
  };
}
__name(deriveEfficiency, "deriveEfficiency");
function runId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
__name(runId, "runId");
function r2Prefix(at) {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  return `briefs/${y}/${m}/${d}`;
}
__name(r2Prefix, "r2Prefix");
async function saveRun(request, env2, ctx) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid json");
  }
  const at = /* @__PURE__ */ new Date();
  const id2 = runId();
  const ts = at.toISOString().replace(/[:.]/g, "-");
  const prefix = r2Prefix(at);
  const snapshotKey = `${prefix}/${ts}-${id2}.json`;
  const reportKey = body.report ? `${prefix}/${ts}-${id2}-report.md` : "";
  const imageKey = body.imageKey && body.imageBase64 ? String(body.imageKey).slice(0, 240) : "";
  const artifactBucket = body.reportKind === "daily" ? env2.CRM_CACHE : env2.IMAGES;
  if (!artifactBucket) return jsonError(503, "report storage unavailable");
  if (imageKey && !/^briefs\/[A-Za-z0-9/_-]+\.png$/.test(imageKey)) {
    return jsonError(400, "invalid image key");
  }
  const writes = [];
  if (body.snapshot) {
    writes.push(
      artifactBucket.put(snapshotKey, JSON.stringify(body.snapshot), {
        httpMetadata: { contentType: "application/json; charset=utf-8" }
      })
    );
  }
  if (body.report) {
    writes.push(
      artifactBucket.put(reportKey, String(body.report), {
        httpMetadata: { contentType: "text/markdown; charset=utf-8" }
      })
    );
  }
  if (imageKey) {
    const encoded = String(body.imageBase64);
    if (encoded.length > 7 * 1024 * 1024) return jsonError(413, "image too large");
    let imageBytes;
    try {
      const raw = atob(encoded);
      if (raw.length > 5 * 1024 * 1024) return jsonError(413, "image too large");
      imageBytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    } catch {
      return jsonError(400, "invalid image data");
    }
    writes.push(
      artifactBucket.put(imageKey, imageBytes, {
        httpMetadata: { contentType: String(body.imageContentType || "image/png") }
      })
    );
  }
  const task = Promise.all(writes).catch(() => {
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;
  const now = at.toISOString();
  try {
    await env2.DB.prepare(
      `INSERT INTO BriefRuns
        (id, RequestedAt, Question, PeriodLabel, ReportKind, StartDate, EndDate,
         Spend, Leads, MetaLeads, MetaCostPerLead, HookRateAvg, Bottleneck,
         Verdict, SnapshotKey, ReportKey, ImageKey, DurationSec, Stages, Status, CreatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id2,
      now,
      String(body.question || "").slice(0, 500),
      String(body.periodLabel || "").slice(0, 80),
      String(body.reportKind || "").slice(0, 30),
      String(body.startDate || ""),
      String(body.endDate || ""),
      Number(body.spend) || 0,
      Number(body.leads) || 0,
      Number(body.metaLeads) || 0,
      Number(body.metaCostPerLead) || 0,
      Number(body.hookRateAvg) || 0,
      String(body.bottleneck || "").slice(0, 200),
      String(body.verdict || "").slice(0, 500),
      body.snapshot ? snapshotKey : "",
      reportKey,
      imageKey,
      Number(body.durationSec) || 0,
      String(body.stages || "").slice(0, 120),
      String(body.status || "success").slice(0, 20),
      now
    ).run();
  } catch (e) {
    return jsonError(500, "run save failed");
  }
  return jsonOk({ ok: true, id: id2, snapshotKey, reportKey, imageKey, reportKind: String(body.reportKind || "") });
}
__name(saveRun, "saveRun");
async function listRuns(request, env2) {
  const url = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10))
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
  try {
    const [rows, countRow] = await Promise.all([
      env2.DB.prepare(
        `SELECT id, RequestedAt, Question, PeriodLabel, StartDate, EndDate,
                Spend, Leads, MetaLeads, MetaCostPerLead, HookRateAvg,
                Bottleneck, Verdict, SnapshotKey, ReportKey, ImageKey, ReportKind, DurationSec,
                Stages, Status
           FROM BriefRuns
          ORDER BY RequestedAt DESC
          LIMIT ? OFFSET ?`
      ).bind(limit, offset).all(),
      env2.DB.prepare(`SELECT COUNT(*) AS n FROM BriefRuns`).first()
    ]);
    const total = Number(countRow?.n || 0);
    const results = rows?.results || [];
    return jsonOk({
      ok: true,
      runs: results,
      page: {
        limit,
        offset,
        total,
        hasMore: offset + results.length < total
      }
    });
  } catch (e) {
    return jsonError(500, "run list failed");
  }
}
__name(listRuns, "listRuns");
async function readRun(request, env2, id2) {
  const url = new URL(request.url);
  const wantParam = url.searchParams.get("part");
  const want = wantParam === "snapshot" ? "snapshot" : wantParam === "image" ? "image" : "report";
  try {
    const row = await env2.DB.prepare(
      `SELECT SnapshotKey, ReportKey, ImageKey, ReportKind FROM BriefRuns WHERE id = ?`
    ).bind(id2).first();
    if (!row) return jsonError(404, "not found");
    const key = want === "snapshot" ? row.SnapshotKey : want === "image" ? row.ImageKey : row.ReportKey;
    if (!key) return jsonError(404, "no stored part");
    const artifactBucket = row.ReportKind === "daily" ? env2.CRM_CACHE : env2.IMAGES;
    if (!artifactBucket) return jsonError(503, "report storage unavailable");
    const obj = await artifactBucket.get(key);
    if (!obj) return jsonError(404, "object missing");
    return new Response(obj.body, {
      headers: {
        "content-type": want === "snapshot" ? "application/json; charset=utf-8" : want === "image" ? "image/png" : "text/markdown; charset=utf-8",
        "cache-control": "private, max-age=300"
      }
    });
  } catch (e) {
    return jsonError(500, "run read failed");
  }
}
__name(readRun, "readRun");
async function handleBrief(request, env2, ctx, services) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/brief/, "") || "/";
  if (!env2.BRIEF_SECRET) {
    return jsonError(500, "brief not configured");
  }
  const given = request.headers.get("x-brief-secret") || "";
  if (!timingSafeEqual(given, env2.BRIEF_SECRET)) {
    return jsonError(401, "Unauthorized");
  }
  if (path === "/runs" && request.method === "POST") {
    return saveRun(request, env2, ctx);
  }
  if (path === "/runs" && request.method === "GET") {
    return listRuns(request, env2);
  }
  if (path.startsWith("/runs/") && request.method === "GET") {
    return readRun(request, env2, path.slice("/runs/".length));
  }
  if (path !== "/marketing" || request.method !== "GET") {
    return jsonError(404, "Not Found");
  }
  const period = resolveRange2(url);
  const full = url.searchParams.get("full") === "1";
  const rangeQuery = period.key === "custom" ? `range=custom&start=${period.startDate}&end=${period.endDate}` : `range=${period.key}`;
  const origin = url.origin;
  const sub = /* @__PURE__ */ __name((p) => new Request(`${origin}${p}`, { headers: request.headers }), "sub");
  const adsReq = sub(`/api/meta-ads/overview?${rangeQuery}`);
  const trafficReq = sub(`/api/analytics/summary?${rangeQuery}`);
  const funnelReq = sub(`/api/analytics/funnel?${rangeQuery}`);
  const [adsRaw, trafficRaw, funnelRaw, leads] = await Promise.all([
    getOverview(adsReq, env2, ctx).then(readJson2).catch(() => null),
    getSummary(trafficReq, env2, services, ctx).then(readJson2).catch(() => null),
    getFunnel(funnelReq, env2).then(readJson2).catch(() => null),
    collectLeads(env2, period)
  ]);
  const condensed = condenseAds(adsRaw);
  const ads = full ? { available: true, ...adsRaw } : condensed;
  const traffic = full ? { available: true, ...trafficRaw } : condenseTraffic(trafficRaw);
  return jsonOk({
    ok: true,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    range: {
      startDate: period.startDate,
      endDate: period.endDate,
      days: period.days,
      requested: url.searchParams.get("range") || url.searchParams.get("days") || "30"
    },
    efficiency: deriveEfficiency(condensed, leads),
    ads,
    traffic,
    funnel: funnelRaw || { available: false },
    leads
  });
}
__name(handleBrief, "handleBrief");

// src/routes/search-volume.js
var YM_RE = /^\d{4}-\d{2}$/;
var ALLOWED_KEYWORDS = /* @__PURE__ */ new Set(["\uB370\uC774\uC6D0\uB514\uC790\uC778"]);
async function handleSearchVolume(request, env2, ctx) {
  const method = request.method;
  if (method === "GET") {
    if (!await verifyAdmin(request, env2)) {
      return jsonError(401, "Unauthorized");
    }
    return listSearchVolume(request, env2);
  }
  if (method === "POST") {
    const token = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/i,
      ""
    );
    if (!env2.SEARCH_VOLUME_TOKEN || !timingSafeEqual(token, env2.SEARCH_VOLUME_TOKEN)) {
      return jsonError(401, "Unauthorized");
    }
    if (!(request.headers.get("content-type") || "").includes("application/json")) {
      return jsonError(415, "Content-Type must be application/json");
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "invalid json");
    }
    if (!Array.isArray(body.rows)) {
      return jsonError(400, "rows[] required");
    }
    try {
      const written = await upsertSearchVolume(env2, body.rows);
      return jsonOk({ received: body.rows.length, written });
    } catch (e) {
      ctx.waitUntil(
        notifyTelegram(
          env2,
          `[day1design/search-volume] POST \uC2E4\uD328
${(e?.message || "").slice(0, 200)}`
        )
      );
      return jsonError(500, "Internal Server Error");
    }
  }
  return jsonError(405, "Method Not Allowed");
}
__name(handleSearchVolume, "handleSearchVolume");
async function listSearchVolume(request, env2) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1),
    1e3
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") || "0", 10) || 0,
    0
  );
  const allowed = [...ALLOWED_KEYWORDS];
  const allowedPh = allowed.map(() => "?").join(",");
  let where, params;
  if (keyword && ALLOWED_KEYWORDS.has(keyword)) {
    where = "WHERE keyword = ?";
    params = [keyword];
  } else {
    where = `WHERE keyword IN (${allowedPh})`;
    params = allowed;
  }
  const countRow = await env2.DB.prepare(
    `SELECT COUNT(*) AS c FROM search_volume ${where}`
  ).bind(...params).first();
  const itemsRes = await env2.DB.prepare(
    `SELECT keyword, month, pc, mobile, total, source, collected_at
       FROM search_volume ${where}
       ORDER BY keyword ASC, month DESC
       LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();
  const kwRes = await env2.DB.prepare(
    `SELECT DISTINCT keyword FROM search_volume WHERE keyword IN (${allowedPh}) ORDER BY keyword ASC`
  ).bind(...allowed).all();
  return jsonOk({
    items: itemsRes.results || [],
    total: Number(countRow?.c || 0),
    keywords: (kwRes.results || []).map((r) => r.keyword)
  });
}
__name(listSearchVolume, "listSearchVolume");
async function upsertSearchVolume(env2, rows) {
  const stmts = [];
  for (const r of rows) {
    if (!r || typeof r.keyword !== "string" || !YM_RE.test(r.month || "")) {
      continue;
    }
    const kw = r.keyword.trim().slice(0, 100);
    if (!kw || !ALLOWED_KEYWORDS.has(kw)) continue;
    const pc = Math.max(0, Math.round(Number(r.pc) || 0));
    const mo = Math.max(0, Math.round(Number(r.mobile) || 0));
    stmts.push(
      env2.DB.prepare(
        `INSERT INTO search_volume (keyword, month, pc, mobile, total, source, collected_at)
         VALUES (?, ?, ?, ?, ?, 'searchad_kwtool', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(keyword, month) DO UPDATE SET
           pc = excluded.pc, mobile = excluded.mobile, total = excluded.total,
           collected_at = excluded.collected_at`
      ).bind(kw, r.month, pc, mo, pc + mo)
    );
  }
  if (!stmts.length) return 0;
  await env2.DB.batch(stmts);
  return stmts.length;
}
__name(upsertSearchVolume, "upsertSearchVolume");

// src/routes/works.js
var TYPES = ["\uC644\uB8CC", "\uC9C4\uD589", "\uD2B9\uC774\uC0AC\uD56D"];
function phone4Of(p) {
  return String(p || "").replace(/\D/g, "").slice(-4);
}
__name(phone4Of, "phone4Of");
function kstNow2() {
  return new Date(Date.now() + 9 * 36e5).toISOString().replace("T", " ").slice(0, 19) + " KST";
}
__name(kstNow2, "kstNow");
async function brandOf(services, clientId) {
  try {
    const c = await services.clients.get(String(clientId || ""));
    return c.fields.Brand || "\uAD11\uACE0\uC8FC";
  } catch {
    return "\uAD11\uACE0\uC8FC";
  }
}
__name(brandOf, "brandOf");
function worksHeader(action, brand) {
  return [
    `<b>[day1design/works]</b> ${action}`,
    `\u{1F3E2} <code>${escapeHtml(brand || "\uAD11\uACE0\uC8FC")}</code>`
  ];
}
__name(worksHeader, "worksHeader");
function notifyWorks(env2, ctx, text) {
  const botToken = String(env2.WORKS_BOT_TOKEN || "").trim();
  const chatId = String(env2.WORKS_CHAT_ID || "").trim();
  if (!botToken || !chatId) return;
  const p = notifyTelegram(env2, text, { botToken, chatId });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p);
}
__name(notifyWorks, "notifyWorks");
function isYmd(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = /* @__PURE__ */ new Date(d + "T00:00:00Z");
  return !isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}
__name(isYmd, "isYmd");
async function identify(env2, services, phone) {
  const p4 = phone4Of(phone);
  if (p4.length !== 4) return null;
  const adminP4 = String(env2.WORKS_ADMIN_PHONE4 || "9834");
  if (timingSafeEqual(p4, adminP4)) return { role: "admin", label: "\uD3F4\uB77C\uC560\uB4DC" };
  const clients = await services.clients.listAll({
    sort: [{ field: "Order", direction: "asc" }]
  });
  const row = clients.find(
    (c) => timingSafeEqual(p4, String(c.fields.Phone4 || ""))
  );
  return row ? { role: "client", label: row.fields.Brand || "\uAD11\uACE0\uC8FC", clientId: row.id } : null;
}
__name(identify, "identify");
function workToJson(r) {
  const f = r.fields;
  return {
    id: r.id,
    client_id: f.ClientId || "",
    date: f.Date || "",
    type: f.Type || "",
    title: f.Title || "",
    body: f.Body || "",
    author_label: f.AuthorLabel || "",
    ip: f.IP || "",
    created_at: f.CreatedAt || "",
    completed_at: f.CompletedAt || null
  };
}
__name(workToJson, "workToJson");
function commentToJson(r) {
  const f = r.fields;
  return {
    role: f.Role || "",
    label: f.Label || "",
    body: f.Body || "",
    ip: f.IP || "",
    created_at: f.CreatedAt || ""
  };
}
__name(commentToJson, "commentToJson");
async function handleWorks(request, env2, ctx, services = createServices(env2)) {
  if (!await verifyAdmin(request, env2)) return jsonError(401, "Unauthorized");
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const ip = clientIP(request);
  if (path === "/api/whoami") {
    if (method !== "POST") return jsonError(405, "Method Not Allowed");
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env2, services, b.phone);
    if (!who) return json({ ok: false });
    return jsonOk({ role: who.role, label: who.label });
  }
  if (path === "/api/clients") {
    if (method !== "GET") return jsonError(405, "Method Not Allowed");
    const clients = await services.clients.listAll({
      sort: [{ field: "Order", direction: "asc" }]
    });
    return jsonOk({
      items: clients.map((c) => ({ id: c.id, brand: c.fields.Brand || "" }))
    });
  }
  if (path === "/api/works" && method === "GET") {
    const client = url.searchParams.get("client") || "";
    const month = url.searchParams.get("month") || "";
    if (!/^\d{4}-\d{2}$/.test(month)) return jsonError(400, "bad month");
    const all = await services.works.listAll({
      where: { ClientId: client },
      sort: [
        { field: "Date", direction: "asc" },
        { field: "CreatedAt", direction: "asc" }
      ]
    });
    const items = all.filter((r) => String(r.fields.Date || "").startsWith(month + "-")).map(workToJson);
    return jsonOk({ items });
  }
  if (path === "/api/works" && method === "POST") {
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env2, services, b.phone);
    if (!who || who.role !== "admin")
      return jsonError(
        403,
        "\uC5C5\uBB34 \uAE30\uB85D\uC740 \uD3F4\uB77C\uC560\uB4DC(\uAD00\uB9AC\uC790)\uB9CC \uC791\uC131\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4"
      );
    const date = String(b.date || "");
    const type = String(b.type || "\uC644\uB8CC");
    const title2 = String(b.title || "").trim();
    if (!isYmd(date)) return jsonError(400, "bad date");
    if (!TYPES.includes(type)) return jsonError(400, "bad type");
    if (!title2 || title2.length > 200) return jsonError(400, "bad title");
    let cl;
    try {
      cl = await services.clients.get(String(b.client_id || ""));
    } catch (e) {
      if (e.notFound) return jsonError(400, "bad client");
      throw e;
    }
    const body = String(b.body || "").slice(0, 2e3);
    const rec = await services.works.create({
      ClientId: cl.id,
      Date: date,
      Type: type,
      Title: title2,
      Body: body,
      AuthorLabel: who.label,
      IP: ip,
      CreatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    notifyWorks(
      env2,
      ctx,
      [
        ...worksHeader("\u{1F195} \uC5C5\uBB34 \uB4F1\uB85D", cl.fields.Brand),
        `\uC720\uD615: ${escapeHtml(type)} \xB7 \uC77C\uC790: ${escapeHtml(date)}`,
        `\uC81C\uBAA9: ${escapeHtml(title2)}`,
        ...body ? [`\uB0B4\uC6A9: ${escapeHtml(body.slice(0, 300))}`] : [],
        `\uC791\uC131: ${escapeHtml(who.label)}`,
        "",
        kstNow2()
      ].join("\n")
    );
    return jsonOk({ id: rec.id });
  }
  let m = path.match(/^\/api\/works\/([A-Za-z0-9_-]+)\/comments$/);
  if (m && method === "GET") {
    const all = await services.workComments.listAll({
      where: { WorkId: m[1] },
      sort: [{ field: "CreatedAt", direction: "asc" }]
    });
    return jsonOk({ items: all.map(commentToJson) });
  }
  if (m && method === "POST") {
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env2, services, b.phone);
    if (!who) return jsonError(403, "\uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uBC88\uD638\uC785\uB2C8\uB2E4");
    const body = String(b.body || "").trim();
    if (!body || body.length > 1e3) return jsonError(400, "bad body");
    try {
      await services.works.get(m[1]);
    } catch (e) {
      if (e.notFound) return jsonError(404, "not found");
      throw e;
    }
    await services.workComments.create({
      WorkId: m[1],
      Role: who.role,
      Label: who.label,
      Body: body,
      IP: ip,
      CreatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return jsonOk({});
  }
  m = path.match(/^\/api\/works\/([A-Za-z0-9_-]+)$/);
  if (m && method === "PATCH") {
    let b;
    try {
      b = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON");
    }
    const who = await identify(env2, services, b.phone);
    if (!who || who.role !== "admin")
      return jsonError(403, "\uC5C5\uBB34 \uBCC0\uACBD\uC740 \uD3F4\uB77C\uC560\uB4DC(\uAD00\uB9AC\uC790)\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4");
    let cur;
    try {
      cur = await services.works.get(m[1]);
    } catch (e) {
      if (e.notFound) return jsonError(404, "not found");
      throw e;
    }
    const fields = {};
    if (b.type !== void 0) {
      if (!TYPES.includes(b.type)) return jsonError(400, "bad type");
      fields.Type = b.type;
      if (b.type === "\uC644\uB8CC") {
        if (!cur.fields.CompletedAt)
          fields.CompletedAt = (/* @__PURE__ */ new Date()).toISOString();
      } else {
        fields.CompletedAt = "";
      }
    }
    if (b.date !== void 0) {
      const d = String(b.date || "");
      if (!isYmd(d)) return jsonError(400, "bad date");
      fields.Date = d;
    }
    if (b.title !== void 0) {
      const t = String(b.title || "").trim();
      if (!t || t.length > 200) return jsonError(400, "bad title");
      fields.Title = t;
    }
    if (b.body !== void 0) {
      fields.Body = String(b.body || "").slice(0, 2e3);
    }
    if (!Object.keys(fields).length) return jsonError(400, "no fields");
    await services.works.update(m[1], fields);
    const completed = fields.Type === "\uC644\uB8CC" && cur.fields.Type !== "\uC644\uB8CC";
    const changes = [];
    if (fields.Type !== void 0)
      changes.push(`\uC720\uD615 \u2192 ${escapeHtml(fields.Type)}`);
    if (fields.Date !== void 0)
      changes.push(`\uC77C\uC790 \u2192 ${escapeHtml(fields.Date)}`);
    if (fields.Title !== void 0)
      changes.push(`\uC81C\uBAA9 \u2192 ${escapeHtml(fields.Title)}`);
    if (fields.Body !== void 0) changes.push(`\uB0B4\uC6A9 \uC218\uC815`);
    const brand = await brandOf(services, cur.fields.ClientId);
    notifyWorks(
      env2,
      ctx,
      [
        ...worksHeader(completed ? "\u2705 \uC5C5\uBB34 \uC644\uB8CC\uCC98\uB9AC" : "\u270F\uFE0F \uC5C5\uBB34 \uC218\uC815", brand),
        `\uB300\uC0C1: ${escapeHtml(cur.fields.Title || "(\uC81C\uBAA9\uC5C6\uC74C)")}`,
        `\uBCC0\uACBD: ${changes.join(" \xB7 ")}`,
        "",
        kstNow2()
      ].join("\n")
    );
    return jsonOk({});
  }
  return jsonError(404, "Not Found");
}
__name(handleWorks, "handleWorks");

// src/lib/healthcheck.js
var DAY = 864e5;
var HOUR = 36e5;
var isoSince = /* @__PURE__ */ __name((ms) => new Date(Date.now() - ms).toISOString(), "isoSince");
async function first(env2, sql, ...binds) {
  return env2.DB.prepare(sql).bind(...binds).first();
}
__name(first, "first");
function judgeIntakeGap({ dailyAvg, gapHours, err }) {
  if (err > 0) return "warn";
  if (dailyAvg < 1) return "ok";
  if (gapHours >= 48) return "fail";
  if (gapHours >= 24) return "warn";
  return "ok";
}
__name(judgeIntakeGap, "judgeIntakeGap");
async function checkIntake(env2) {
  try {
    const r = await first(
      env2,
      "SELECT COUNT(*) c, MAX(SubmittedAt) last FROM Estimates WHERE SubmittedAt >= ?",
      isoSince(DAY)
    );
    const e = await first(
      env2,
      "SELECT COUNT(*) c FROM Estimates WHERE Status='\uC624\uB958' AND SubmittedAt >= ?",
      isoSince(DAY)
    );
    const base = await first(
      env2,
      "SELECT COUNT(*) c, MAX(SubmittedAt) last FROM Estimates WHERE SubmittedAt >= ?",
      isoSince(14 * DAY)
    );
    const cnt = r?.c ?? 0;
    const err = e?.c ?? 0;
    const dailyAvg = (base?.c ?? 0) / 14;
    const lastAt = Date.parse(base?.last || "");
    const gapHours = Number.isFinite(lastAt) ? Math.floor((Date.now() - lastAt) / HOUR) : 999;
    const status = judgeIntakeGap({ dailyAvg, gapHours, err });
    const gapText = gapHours >= 24 ? `\uB9C8\uC9C0\uB9C9 \uC811\uC218 ${Math.floor(gapHours / 24)}\uC77C \uC804` : `\uB9C8\uC9C0\uB9C9 \uC811\uC218 ${gapHours}\uC2DC\uAC04 \uC804`;
    return {
      status,
      metric: `\uCD5C\uADFC 24h ${cnt}\uAC74 \xB7 \uC624\uB958 ${err}\uAC74 \xB7 ${gapText}`,
      log: `intake: db=readable count24h=${cnt} errStatus24h=${err} gapH=${gapHours} avg14d=${dailyAvg.toFixed(1)} last=${base?.last || "-"} \u2192 ${status}`
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "D1 \uC811\uADFC \uC2E4\uD328",
      log: `intake: D1 query failed \u2014 ${(ex?.message || "").slice(0, 120)} \u2192 fail`
    };
  }
}
__name(checkIntake, "checkIntake");
async function checkGa4(env2) {
  const rt = String(
    env2.GA4_REFRESH_TOKEN || env2.GOOGLE_ANALYTICS_REFRESH_TOKEN || env2.GOOGLE_REFRESH_TOKEN || ""
  ).trim();
  if (!rt || !env2.GOOGLE_CLIENT_ID || !env2.GOOGLE_CLIENT_SECRET) {
    return {
      status: "fail",
      metric: "\uC790\uACA9\uC99D\uBA85 \uBBF8\uC124\uC815",
      log: "ga4: refresh_token/client \uBBF8\uC124\uC815 \u2192 fail"
    };
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env2.GOOGLE_CLIENT_ID,
        client_secret: env2.GOOGLE_CLIENT_SECRET,
        refresh_token: rt,
        grant_type: "refresh_token"
      })
    });
    if (!res.ok) {
      const b = (await res.text()).slice(0, 120);
      return {
        status: "fail",
        metric: `\uD1A0\uD070 \uAC31\uC2E0 \uC2E4\uD328 (${res.status})`,
        log: `ga4: oauth ${res.status} ${b} \u2192 fail`
      };
    }
    const body = await res.json();
    const ok = !!body.access_token;
    return {
      status: ok ? "ok" : "fail",
      metric: ok ? "OAuth \uC815\uC0C1 \xB7 \uD1A0\uD070 \uBC1C\uAE09" : "access_token \uC5C6\uC74C",
      log: `ga4: oauth=200 access_token=${ok} prop=${env2.GA4_PROPERTY_ID || "-"} \u2192 ${ok ? "ok" : "fail"}`
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "\uC5F0\uACB0 \uC624\uB958",
      log: `ga4: fetch failed \u2014 ${(ex?.message || "").slice(0, 120)} \u2192 fail`
    };
  }
}
__name(checkGa4, "checkGa4");
async function checkMetaData(env2) {
  const token = String(env2.META_AD_ACCESS_TOKEN || "").trim();
  const acct = String(env2.META_AD_ACCOUNT_ID || "").trim();
  if (!token || !acct) {
    return {
      status: "fail",
      metric: "\uD1A0\uD070/\uACC4\uC815 \uBBF8\uC124\uC815",
      log: "meta-data: META_AD_* \uBBF8\uC124\uC815 \u2192 fail"
    };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/act_${acct}?fields=name,account_status&access_token=${encodeURIComponent(token)}`
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body?.error?.message || `${res.status}`).slice(0, 120);
      return {
        status: "fail",
        metric: `\uACC4\uC815 \uC811\uADFC \uC2E4\uD328`,
        log: `meta-data: act_${acct} ${res.status} ${msg} \u2192 fail`
      };
    }
    return {
      status: "ok",
      metric: `${body.name || "\uACC4\uC815"} \uC811\uADFC \uC815\uC0C1`,
      log: `meta-data: act_${acct} name=${body.name || "-"} status=${body.account_status ?? "-"} \u2192 ok`
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "\uC5F0\uACB0 \uC624\uB958",
      log: `meta-data: fetch failed \u2014 ${(ex?.message || "").slice(0, 120)} \u2192 fail`
    };
  }
}
__name(checkMetaData, "checkMetaData");
function judgeSmsDelivery({ intake, ok, fail, skip }) {
  if (fail > 0) return "warn";
  if (intake > 0 && ok === 0) return "fail";
  if (skip > 0) return "warn";
  return "ok";
}
__name(judgeSmsDelivery, "judgeSmsDelivery");
async function checkSmsDelivery(env2) {
  const accessKey = String(env2.NCP_SENS_ACCESS_KEY || "").trim();
  const secretKey = String(env2.NCP_SENS_SECRET_KEY || "").trim();
  const serviceId = String(env2.NCP_SENS_SERVICE_ID || "").trim();
  const from = String(env2.NCP_SENS_FROM_NUMBER || "").replace(/\D/g, "");
  if (!accessKey || !secretKey || !serviceId) {
    return {
      status: "fail",
      metric: "\uC790\uACA9\uC99D\uBA85 \uBBF8\uC124\uC815",
      log: "sms: access/secret/serviceId \uBBF8\uC124\uC815 \u2192 fail"
    };
  }
  if (!from) {
    return {
      status: "fail",
      metric: "\uBC1C\uC2E0\uBC88\uD638 \uBBF8\uB4F1\uB85D",
      log: "sms: from-number \uBBF8\uB4F1\uB85D(\uC804\uAC74 skip) \u2192 fail"
    };
  }
  try {
    const since = isoSince(7 * DAY);
    const r = await first(
      env2,
      `SELECT
         SUM(CASE WHEN Steps LIKE '%"lms":"ok"%' THEN 1 ELSE 0 END) okc,
         SUM(CASE WHEN Steps LIKE '%"lms":"fail"%' THEN 1 ELSE 0 END) failc,
         SUM(CASE WHEN Steps LIKE '%"lms":"skip"%' THEN 1 ELSE 0 END) skipc,
         COUNT(*) total
       FROM IntakeEvents WHERE At >= ?`,
      since
    );
    const s2 = await first(
      env2,
      "SELECT COUNT(*) c FROM SmsLogs WHERE Status='failed' AND SentAt >= ?",
      since
    );
    const ok = r?.okc ?? 0;
    const fail = (r?.failc ?? 0) + (s2?.c ?? 0);
    const skip = r?.skipc ?? 0;
    const intake = r?.total ?? 0;
    const status = judgeSmsDelivery({ intake, ok, fail, skip });
    return {
      status,
      metric: `\uCD5C\uADFC 7\uC77C \uBC1C\uC1A1 ${ok}\uAC74 \xB7 \uC2E4\uD328 ${fail}\uAC74 \xB7 \uAC74\uB108\uB700 ${skip}\uAC74`,
      log: `sms: from=${from} intake7d=${intake} ok=${ok} fail=${fail} skip=${skip} \u2192 ${status}`
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "\uBC1C\uC1A1 \uB85C\uADF8 \uC870\uD68C \uC2E4\uD328",
      log: `sms: query failed \u2014 ${(ex?.message || "").slice(0, 120)} \u2192 fail`
    };
  }
}
__name(checkSmsDelivery, "checkSmsDelivery");
async function checkMetaLead(env2) {
  try {
    const since = isoSince(7 * DAY);
    const l = await first(
      env2,
      "SELECT COUNT(*) c FROM Estimates WHERE Source='meta' AND SubmittedAt >= ?",
      since
    );
    const s2 = await first(
      env2,
      "SELECT COUNT(*) c FROM SmsLogs WHERE SentBy='system:meta-lead' AND SentAt >= ?",
      since
    );
    const leads = l?.c ?? 0;
    const sms = s2?.c ?? 0;
    const mismatch = leads > 0 && sms === 0;
    const status = mismatch ? "fail" : "ok";
    return {
      status,
      metric: `\uCD5C\uADFC 7\uC77C \uB9AC\uB4DC ${leads}\uAC74 \xB7 SMS ${sms}\uAC74`,
      log: `meta-lead: leads7d=${leads} sms7d=${sms}${mismatch ? " MISMATCH" : ""} \u2192 ${status}`
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "\uC870\uD68C \uC2E4\uD328",
      log: `meta-lead: query failed \u2014 ${(ex?.message || "").slice(0, 120)} \u2192 fail`
    };
  }
}
__name(checkMetaLead, "checkMetaLead");
var POLLER_STALE_MINUTES = 90;
function judgePollerFreshness({ lastAt, lastStatus, nowMs }) {
  if (!lastAt) return { status: "ok", stale: null, adopted: false };
  const ms = Date.parse(lastAt);
  if (!Number.isFinite(ms)) return { status: "fail", stale: null, adopted: true };
  const stale = Math.floor((nowMs - ms) / 6e4);
  if (stale > POLLER_STALE_MINUTES) return { status: "fail", stale, adopted: true };
  if (lastStatus === "fail") return { status: "fail", stale, adopted: true };
  return { status: "ok", stale, adopted: true };
}
__name(judgePollerFreshness, "judgePollerFreshness");
async function checkLeadPoller(env2) {
  try {
    const row = await first(
      env2,
      "SELECT At, Status, Detail FROM SystemHeartbeats WHERE Source='meta-lead-poller' ORDER BY At DESC LIMIT 1"
    );
    const j = judgePollerFreshness({
      lastAt: row?.At || "",
      lastStatus: row?.Status || "",
      nowMs: Date.now()
    });
    if (!j.adopted) {
      return {
        status: "ok",
        metric: "\uBBF8\uB3C4\uC785 (Make \uACBD\uC720 \uC218\uC2E0)",
        log: "lead-poller: heartbeat \uC5C6\uC74C(\uD3F4\uB9C1 \uC804\uD658 \uC804) \u2192 ok"
      };
    }
    return {
      status: j.status,
      metric: j.status === "ok" ? `${j.stale}\uBD84 \uC804 \uC815\uC0C1 \xB7 ${row?.Detail || ""}`.trim() : `${j.stale}\uBD84\uAC04 \uC2E0\uD638 \uC5C6\uC74C`,
      log: `lead-poller: last=${row?.At || "-"} status=${row?.Status || "-"} staleMin=${j.stale} \u2192 ${j.status}`
    };
  } catch (ex) {
    return {
      status: "fail",
      metric: "\uD558\uD2B8\uBE44\uD2B8 \uC870\uD68C \uC2E4\uD328",
      log: `lead-poller: query failed \u2014 ${(ex?.message || "").slice(0, 120)} \u2192 fail`
    };
  }
}
__name(checkLeadPoller, "checkLeadPoller");
var CHECK_DEFS = [
  { key: "intake", label: "\uC811\uC218\uCC98\uB9AC \uC0C1\uD0DC", run: /* @__PURE__ */ __name((env2) => checkIntake(env2), "run") },
  { key: "ga4", label: "GA4 \uC5F0\uACB0\uC131", run: /* @__PURE__ */ __name((env2) => checkGa4(env2), "run") },
  {
    key: "metadata",
    label: "Meta \uB370\uC774\uD130 \uC5F0\uACB0\uC131",
    run: /* @__PURE__ */ __name((env2) => checkMetaData(env2), "run")
  },
  { key: "sens", label: "\uACE0\uAC1D\uBB38\uC790 \uBC1C\uC1A1", run: /* @__PURE__ */ __name((env2) => checkSmsDelivery(env2), "run") },
  {
    key: "metalead",
    label: "Meta \uB9AC\uB4DC \uC791\uB3D9\uC131",
    run: /* @__PURE__ */ __name((env2) => checkMetaLead(env2), "run")
  },
  { key: "leadpoll", label: "\uB9AC\uB4DC \uD3F4\uB7EC \uC0DD\uC874", run: /* @__PURE__ */ __name((env2) => checkLeadPoller(env2), "run") }
];
function rollup(results) {
  const st = results.map((r) => r.status);
  if (st.includes("fail")) return "fail";
  if (st.includes("warn")) return "warn";
  return "ok";
}
__name(rollup, "rollup");
async function runHealthChecks(env2, services, triggeredBy = "cron") {
  const results = [];
  for (const def of CHECK_DEFS) {
    let r;
    try {
      r = await def.run(env2);
    } catch (ex) {
      r = {
        status: "fail",
        metric: "\uC810\uAC80 \uC624\uB958",
        log: `${def.key}: ${(ex?.message || "").slice(0, 120)}`
      };
    }
    results.push({ key: def.key, label: def.label, ...r });
  }
  const overall = rollup(results);
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  let id2 = null;
  try {
    const rec = await services.healthChecks.create({
      CheckedAt: checkedAt,
      Overall: overall,
      Results: JSON.stringify(results),
      TriggeredBy: triggeredBy
    });
    id2 = rec.id;
  } catch {
  }
  return { id: id2, checkedAt, overall, results, triggeredBy };
}
__name(runHealthChecks, "runHealthChecks");
var STATUS_ICON = { ok: "\u{1F7E2}", warn: "\u{1F7E1}", fail: "\u{1F534}" };
var OVERALL_LABEL = { ok: "\uC815\uC0C1", warn: "\uC8FC\uC758", fail: "\uC624\uB958" };
function healthReportTarget(env2) {
  const infraToken = String(env2.INFRA_BOT_TOKEN || "").trim();
  const infraChat = String(env2.INFRA_CHAT_ID || "").trim();
  if (infraToken && infraChat) return { botToken: infraToken, chatId: infraChat };
  const hcToken = String(env2.HEALTHCHECK_BOT_TOKEN || "").trim();
  const hcChat = String(env2.HEALTHCHECK_CHAT_ID || "").trim();
  if (hcToken && hcChat) return { botToken: hcToken, chatId: hcChat };
  const adminToken = String(env2.TELEGRAM_BOT_TOKEN || "").trim();
  const adminChat = String(env2.TELEGRAM_ADMIN_CHAT_ID || "").trim();
  if (adminToken && adminChat) return { botToken: adminToken, chatId: adminChat };
  return null;
}
__name(healthReportTarget, "healthReportTarget");
async function sendHealthReport(env2, summary) {
  const target = healthReportTarget(env2);
  if (!target) return;
  const { botToken, chatId } = target;
  const { overall, results, triggeredBy } = summary;
  const head = overall === "ok" ? "\u2705 \uC804\uCCB4 \uC815\uC0C1" : `${STATUS_ICON[overall]} ${OVERALL_LABEL[overall]} \u2014 \uC810\uAC80 \uD544\uC694`;
  const lines = results.map(
    (r) => `${STATUS_ICON[r.status]} ${r.label} \u2014 ${r.metric}`
  );
  const kst = new Date(Date.now() + 9 * 36e5).toISOString().replace("T", " ").slice(0, 19);
  const text = [
    `<b>[day1design/healthcheck]</b> \u{1FA7A} \uC2DC\uC2A4\uD15C \uC810\uAC80 (${triggeredBy === "manual" ? "\uC218\uB3D9" : "\uC790\uB3D9"})`,
    head,
    "",
    ...lines,
    "",
    `${kst} KST`
  ].join("\n");
  await notifyTelegram(env2, text, { botToken, chatId });
}
__name(sendHealthReport, "sendHealthReport");
async function runAndReportHealth(env2, services, { triggeredBy = "cron", alertOnlyOnIssue = false } = {}) {
  const summary = await runHealthChecks(env2, services, triggeredBy);
  if (!alertOnlyOnIssue || summary.overall !== "ok") {
    await sendHealthReport(env2, summary);
  }
  return summary;
}
__name(runAndReportHealth, "runAndReportHealth");

// src/routes/healthcheck.js
function parseResults(row) {
  let results = [];
  try {
    results = JSON.parse(row.fields.Results || "[]");
  } catch {
  }
  return {
    id: row.id,
    checkedAt: row.fields.CheckedAt || "",
    overall: row.fields.Overall || "ok",
    triggeredBy: row.fields.TriggeredBy || "cron",
    results
  };
}
__name(parseResults, "parseResults");
function eventToJson(row) {
  const f = row.fields;
  let steps = {};
  try {
    steps = JSON.parse(f.Steps || "{}");
  } catch {
  }
  return {
    id: row.id,
    at: f.At || "",
    channel: f.Channel || "",
    source: f.Source || "",
    branch: f.Branch || "",
    name: f.RefName || "",
    phone: f.RefPhone || "",
    geo: f.Geo || "",
    estimateId: f.EstimateId || "",
    steps,
    overall: f.Overall || "ok"
  };
}
__name(eventToJson, "eventToJson");
async function handleHealth(request, env2, ctx, services = createServices(env2)) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === "/api/admin/health/run" && method === "POST") {
    const provided = request.headers.get("x-health-secret") || "";
    const expected = env2.HEALTHCHECK_RUN_SECRET || "";
    const internalOk = !!expected && timingSafeEqual(provided, expected);
    if (!internalOk && !await verifyAdmin(request, env2)) {
      return jsonError(403, "Forbidden");
    }
    const summary = await runAndReportHealth(env2, services, {
      triggeredBy: "manual",
      alertOnlyOnIssue: false
    });
    return jsonOk({
      latest: {
        id: summary.id,
        checkedAt: summary.checkedAt,
        overall: summary.overall,
        triggeredBy: summary.triggeredBy,
        results: summary.results
      }
    });
  }
  if (!await verifyAdmin(request, env2)) return jsonError(401, "Unauthorized");
  if (path === "/api/admin/health/events" && method === "GET") {
    const status = url.searchParams.get("status") || "";
    const limit = Math.min(
      500,
      Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200)
    );
    const where = {};
    if (["ok", "warn", "fail"].includes(status)) where.Overall = status;
    const rows = await services.intakeEvents.list({
      where,
      sort: [{ field: "At", direction: "desc" }],
      limit
    });
    return jsonOk({ items: rows.records.map(eventToJson) });
  }
  if (path === "/api/admin/health" && method === "GET") {
    const rows = await services.healthChecks.list({
      sort: [{ field: "CheckedAt", direction: "desc" }],
      limit: 30
    });
    const list = rows.records.map(parseResults);
    return jsonOk({ latest: list[0] || null, history: list });
  }
  return jsonError(404, "Not Found");
}
__name(handleHealth, "handleHealth");

// src/lib/cors.js
function getAllowedOrigins(env2) {
  return (env2.ALLOWED_ORIGINS || "").split(",").map((s2) => s2.trim()).filter(Boolean);
}
__name(getAllowedOrigins, "getAllowedOrigins");
function matchOrigin(origin, list) {
  if (!origin) return null;
  if (list.includes(origin)) return origin;
  return null;
}
__name(matchOrigin, "matchOrigin");
function preflight(request, env2) {
  const origin = request.headers.get("origin");
  const allowed = matchOrigin(origin, getAllowedOrigins(env2));
  const h = new Headers();
  if (allowed) h.set("access-control-allow-origin", allowed);
  h.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  h.set(
    "access-control-allow-headers",
    "content-type,authorization"
  );
  h.set("access-control-allow-credentials", "true");
  h.set("access-control-max-age", "86400");
  h.set("vary", "origin");
  return new Response(null, { status: 204, headers: h });
}
__name(preflight, "preflight");
function cors(res, request, env2) {
  const origin = request.headers.get("origin");
  const allowed = matchOrigin(origin, getAllowedOrigins(env2));
  const h = new Headers(res.headers);
  if (allowed) {
    h.set("access-control-allow-origin", allowed);
    h.set("access-control-allow-credentials", "true");
    h.set("vary", "origin");
  }
  return new Response(res.body, { status: res.status, headers: h });
}
__name(cors, "cors");

// src/lib/access.js
function listEnv(env2, key) {
  return String(env2?.[key] || "").split(",").map((s2) => s2.trim()).filter(Boolean);
}
__name(listEnv, "listEnv");
function hostnameOf(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}
__name(hostnameOf, "hostnameOf");
function isLocalOrigin(origin) {
  const host = hostnameOf(origin);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
__name(isLocalOrigin, "isLocalOrigin");
function isAdminOrigin(origin, env2) {
  if (!origin) return false;
  if (isLocalOrigin(origin)) return true;
  const configured = listEnv(env2, "ADMIN_ORIGINS");
  if (configured.includes(origin)) return true;
  const host = hostnameOf(origin);
  return host === "admin.day1design.co.kr";
}
__name(isAdminOrigin, "isAdminOrigin");
function isMainOrigin(origin, env2) {
  if (!origin) return false;
  if (isLocalOrigin(origin)) return true;
  const configured = listEnv(env2, "MAIN_ORIGINS");
  if (configured.includes(origin)) return true;
  if (configured.length) return false;
  return !isAdminOrigin(origin, env2);
}
__name(isMainOrigin, "isMainOrigin");
function effectiveMethod(request, opts = {}) {
  return String(
    opts.method || request.headers.get("access-control-request-method") || request.method || "GET"
  ).toUpperCase();
}
__name(effectiveMethod, "effectiveMethod");
function classifyAccess(request, opts = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = effectiveMethod(request, opts);
  if (path === "/api/mobile" || path.startsWith("/api/mobile/")) {
    return { role: "integration", method, path };
  }
  if (path === "/api/meta-lead" || path.startsWith("/api/meta-lead/")) {
    return { role: "integration", method, path };
  }
  if (path === "/api/brief" || path.startsWith("/api/brief/")) {
    return { role: "integration", method, path };
  }
  if (path === "/" || path === "/api") return { role: "main", method, path };
  if (path.startsWith("/api/auth") || path.startsWith("/api/upload")) {
    return { role: "admin", method, path };
  }
  if (path === "/api/analytics/visit") {
    return { role: method === "POST" ? "main" : "unknown", method, path };
  }
  if (path.startsWith("/api/analytics")) {
    return { role: "admin", method, path };
  }
  if (path === "/api/heatmap/track") {
    return { role: method === "POST" ? "main" : "unknown", method, path };
  }
  if (path.startsWith("/api/heatmap")) {
    return { role: "admin", method, path };
  }
  if (path === "/api/exit-guard/track") {
    return { role: method === "POST" ? "main" : "unknown", method, path };
  }
  if (path.startsWith("/api/exit-guard")) {
    return { role: "admin", method, path };
  }
  if (path === "/api/estimates" && method === "POST") {
    return { role: "main", method, path };
  }
  if (path.startsWith("/api/estimates")) {
    return { role: "admin", method, path };
  }
  if (path === "/api/hero/slides" && method === "GET") {
    return { role: "main", method, path };
  }
  if (path.startsWith("/api/hero")) return { role: "admin", method, path };
  if (path.startsWith("/api/portfolio")) {
    return { role: method === "GET" ? "main" : "admin", method, path };
  }
  if (path.startsWith("/api/community")) {
    return { role: method === "GET" ? "main" : "admin", method, path };
  }
  if (path.startsWith("/api/marketing-links")) {
    return { role: "admin", method, path };
  }
  if (path.startsWith("/api/meta-ads")) {
    return { role: "admin", method, path };
  }
  if (path.startsWith("/api/admin/search-volume")) {
    return {
      role: method === "POST" ? "integration" : "admin",
      method,
      path
    };
  }
  if (path === "/api/pixel-events") {
    return { role: method === "POST" ? "main" : "unknown", method, path };
  }
  if (path.startsWith("/api/admin/pixel-events")) {
    return { role: "admin", method, path };
  }
  if (path.startsWith("/api/audit")) {
    return { role: "admin", method, path };
  }
  if (path === "/api/whoami" || path === "/api/clients" || path === "/api/works" || path.startsWith("/api/works/")) {
    return { role: "admin", method, path };
  }
  return { role: "unknown", method, path };
}
__name(classifyAccess, "classifyAccess");
function authorizeRequest(request, env2, opts = {}) {
  const rule = classifyAccess(request, opts);
  if (rule.role === "integration") return { ok: true, rule };
  let origin = request.headers.get("origin");
  if (!origin) {
    const xfHost = request.headers.get("x-forwarded-host") || "";
    if (xfHost) {
      const candidate = `https://${xfHost}`;
      if (isAdminOrigin(candidate, env2) || isMainOrigin(candidate, env2)) {
        origin = candidate;
      }
    }
  }
  const allowedOrigin = matchOrigin(origin, getAllowedOrigins(env2));
  if (!allowedOrigin) {
    return {
      ok: false,
      status: 403,
      code: "origin_required",
      message: "Forbidden",
      rule
    };
  }
  if (rule.role === "admin" && !isAdminOrigin(allowedOrigin, env2)) {
    return {
      ok: false,
      status: 403,
      code: "admin_origin_required",
      message: "Forbidden",
      rule
    };
  }
  if (rule.role === "main" && !isMainOrigin(allowedOrigin, env2) && !isAdminOrigin(allowedOrigin, env2)) {
    return {
      ok: false,
      status: 403,
      code: "site_origin_required",
      message: "Forbidden",
      rule
    };
  }
  return { ok: true, origin: allowedOrigin, rule };
}
__name(authorizeRequest, "authorizeRequest");
function accessDenied(access) {
  return jsonError(access.status || 403, access.message || "Forbidden", {
    code: access.code || "forbidden"
  });
}
__name(accessDenied, "accessDenied");

// src/index.js
var API_HOST = "api.day1design.co.kr";
var WORKERS_DEV_HOST = "day1design-api.day1design-co.workers.dev";
var ADMIN_HOST = "admin.day1design.co.kr";
var MAIN_HOSTS = /* @__PURE__ */ new Set(["day1design.co.kr", "www.day1design.co.kr"]);
function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
__name(isLocalHost, "isLocalHost");
function isApiHost(host) {
  return host === API_HOST || host === WORKERS_DEV_HOST || host.startsWith("api.") || isLocalHost(host);
}
__name(isApiHost, "isApiHost");
function isAdminHost(host) {
  return host === ADMIN_HOST || host.startsWith("admin.") || isLocalHost(host);
}
__name(isAdminHost, "isAdminHost");
function isMainHost(host) {
  return MAIN_HOSTS.has(host) || isLocalHost(host);
}
__name(isMainHost, "isMainHost");
function isApiPath(path) {
  return path === "/api" || path.startsWith("/api/");
}
__name(isApiPath, "isApiPath");
function hasExtension(path) {
  const last = path.split("/").pop() || "";
  return last.includes(".");
}
__name(hasExtension, "hasExtension");
function withPath(request, path) {
  const url = new URL(request.url);
  url.pathname = path;
  return new Request(url.toString(), request);
}
__name(withPath, "withPath");
async function fetchAsset(request, env2, path) {
  if (!env2.ASSETS) {
    return jsonError(503, "Static assets are not configured");
  }
  return env2.ASSETS.fetch(withPath(request, path));
}
__name(fetchAsset, "fetchAsset");
function htmlPath(path) {
  if (path === "/" || path === "") return "/index.html";
  if (path.endsWith("/")) return `${path}index.html`;
  if (!hasExtension(path)) return `${path}.html`;
  return path;
}
__name(htmlPath, "htmlPath");
function adminAssetPath(path) {
  if (path === "/" || path === "") return "/admin/login.html";
  const scoped = path.startsWith("/admin/") ? path : `/admin${path}`;
  return htmlPath(scoped);
}
__name(adminAssetPath, "adminAssetPath");
function mainAssetPath(path) {
  return htmlPath(path);
}
__name(mainAssetPath, "mainAssetPath");
function withStaticHeaders(response, host) {
  const headers = new Headers(response.headers);
  if (host === ADMIN_HOST || host.startsWith("admin.")) {
    headers.set("x-robots-tag", "noindex, nofollow");
    headers.set("x-frame-options", "DENY");
    headers.set("referrer-policy", "no-referrer");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(withStaticHeaders, "withStaticHeaders");
async function handleStatic(request, env2, host, path) {
  const assetPath = isAdminHost(host) ? adminAssetPath(path) : mainAssetPath(path);
  let response = await fetchAsset(request, env2, assetPath);
  if (response.status === 404 && assetPath !== path) {
    response = await fetchAsset(request, env2, path);
  }
  return withStaticHeaders(response, host);
}
__name(handleStatic, "handleStatic");
async function handleApi(request, env2, ctx, path) {
  let res;
  const services = createServices(env2);
  const access = authorizeRequest(request, env2);
  if (!access.ok) {
    if (request.method === "POST" && (path === "/api/estimates" || path === "/api/estimates/")) {
      ctx.waitUntil(
        captureRejectedSubmission(request, env2, services, ctx, {
          outcome: "origin_denied",
          error: access.code || "origin"
        })
      );
    }
    return cors(accessDenied(access), request, env2);
  }
  if (path === "/" || path === "/api" || path === "/api/") {
    res = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });
  } else if (path === "/api/meta-lead") {
    if (request.method !== "POST") {
      res = jsonError(405, "Method Not Allowed");
    } else {
      res = await handleMetaLead(request, env2, ctx, services);
    }
  } else if (path === "/api/meta-lead/form-schema") {
    if (request.method !== "POST") {
      res = jsonError(405, "Method Not Allowed");
    } else {
      res = await handleMetaFormSchema(request, env2, ctx, services);
    }
  } else if (path === "/api/meta-lead/heartbeat") {
    if (request.method !== "POST") {
      res = jsonError(405, "Method Not Allowed");
    } else {
      res = await handleMetaLeadHeartbeat(request, env2, ctx, services);
    }
  } else if (path.startsWith("/api/estimates/")) {
    const tail = path.slice("/api/estimates/".length);
    const memosMatch = tail.match(
      /^([a-zA-Z0-9_-]+)\/memos(?:\/([a-zA-Z0-9_-]+))?$/
    );
    const historyMatch = tail.match(/^([a-zA-Z0-9_-]+)\/history$/);
    if (memosMatch) {
      res = await handleMemos(
        request,
        env2,
        ctx,
        memosMatch[1],
        memosMatch[2],
        services
      );
    } else if (historyMatch) {
      res = await handleHistory(request, env2, ctx, historyMatch[1], services);
    } else {
      res = await handleEstimates(request, env2, ctx, services);
    }
  } else if (path.startsWith("/api/estimates")) {
    res = await handleEstimates(request, env2, ctx, services);
  } else if (path.startsWith("/api/hero")) {
    res = await handleHero(request, env2, ctx, services);
  } else if (path.startsWith("/api/popups")) {
    res = await handlePopups(request, env2, ctx, services);
  } else if (path.startsWith("/api/portfolio")) {
    res = await handlePortfolio(request, env2, ctx, services);
  } else if (path.startsWith("/api/community")) {
    res = await handleCommunity(request, env2, ctx, services);
  } else if (path.startsWith("/api/auth")) {
    res = await handleAuth(request, env2, ctx);
  } else if (path.startsWith("/api/analytics")) {
    res = await handleAnalytics(request, env2, ctx, services);
  } else if (path.startsWith("/api/heatmap")) {
    res = await handleHeatmap(request, env2, ctx, services);
  } else if (path.startsWith("/api/exit-guard")) {
    res = await handleExitGuard(request, env2, ctx);
  } else if (path.startsWith("/api/upload")) {
    res = await handleUpload(request, env2, ctx, services);
  } else if (path.startsWith("/api/sms")) {
    res = await handleSms(request, env2, ctx, services);
  } else if (path.startsWith("/api/marketing-links")) {
    res = await handleMarketingLinks(request, env2, ctx);
  } else if (path.startsWith("/api/audit")) {
    res = await handleAudit(request, env2);
  } else if (path.startsWith("/api/meta-ads")) {
    res = await handleMetaAds(request, env2, ctx);
  } else if (path.startsWith("/api/brief")) {
    res = await handleBrief(request, env2, ctx, services);
  } else if (path.startsWith("/api/admin/search-volume")) {
    res = await handleSearchVolume(request, env2, ctx);
  } else if (path === "/api/pixel-events") {
    res = await handlePixelEvents(request, env2, ctx);
  } else if (path.startsWith("/api/admin/pixel-events")) {
    res = await handlePixelEventsAdmin(request, env2);
  } else if (path === "/api/admin/health" || path.startsWith("/api/admin/health/")) {
    res = await handleHealth(request, env2, ctx, services);
  } else if (path === "/api/whoami" || path === "/api/clients" || path === "/api/works" || path.startsWith("/api/works/")) {
    res = await handleWorks(request, env2, ctx, services);
  } else {
    res = jsonError(404, "Not Found");
  }
  return cors(res, request, env2);
}
__name(handleApi, "handleApi");
var index_default = {
  async fetch(request, env2, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      if (!isApiHost(host)) return jsonError(404, "Not Found");
      const access = authorizeRequest(request, env2);
      if (!access.ok) return accessDenied(access);
      return preflight(request, env2);
    }
    try {
      if (path === "/" && isApiHost(host)) {
        return handleApi(request, env2, ctx, path);
      }
      if (isApiPath(path)) {
        if (!isApiHost(host) && !isAdminHost(host))
          return jsonError(404, "Not Found");
        return handleApi(request, env2, ctx, path);
      }
      if (path.startsWith("/r/")) {
        return handleSlugRedirect(request, env2, ctx, path.slice(3));
      }
      if (isMainHost(host) || isAdminHost(host)) {
        return handleStatic(request, env2, host, path);
      }
      return jsonError(404, "Not Found");
    } catch (e) {
      console.error(`[day1design/${path}]`, e);
      ctx.waitUntil(
        notifyInfra(
          env2,
          `<b>[day1design${path}]</b> \u{1F534} 500 \uC11C\uBC84 \uC5D0\uB7EC
${e.message?.slice(0, 200) || "unknown"}`
        )
      );
      queueAudit(ctx, env2, request, {
        type: "error_5xx",
        severity: "error",
        status: 500,
        message: e?.message?.slice(0, 200) || "unknown error",
        payload: {
          name: e?.name || "",
          stack: (e?.stack || "").slice(0, 4e3)
        }
      });
      return cors(jsonError(500, "Internal Server Error"), request, env2);
    }
  },
  // Cron 두 종류:
  //   "0 19 * * *" 매일 KST 04:00 — meta-ads sync + analytics snapshot + 풀 헬스점검(다이제스트)
  //   "0 * * * *"  매시간 정각 — 헬스 하트비트 점검(기록만, 오류 시 텔레그램). 전원 인디케이터용.
  async scheduled(event, env2, ctx) {
    const isDaily = event.cron === "0 19 * * *";
    const isQuarter = event.cron === "*/15 * * * *";
    ctx.waitUntil(
      (async () => {
        try {
          await runConsultReminders(env2);
        } catch (e) {
          await notifyTelegram(
            env2,
            `[day1design/cron] \uC0C1\uB2F4 \uB9AC\uB9C8\uC778\uB4DC \uC2E4\uD328 (cron=${event.cron})
${(e?.message || "").slice(0, 200)}`
          );
        }
      })()
    );
    if (isQuarter) return;
    ctx.waitUntil(
      (async () => {
        if (isDaily) {
          try {
            await runScheduledSync(env2, ctx);
            try {
              await prewarmOverviewCache(env2);
            } catch {
            }
          } catch (e) {
            await notifyTelegram(
              env2,
              `[day1design/cron] meta-ads scheduled sync \uC2E4\uD328
${(e?.message || "").slice(0, 200)}`,
              {
                botToken: env2.META_RATE_TELEGRAM_BOT_TOKEN,
                chatId: env2.META_RATE_TELEGRAM_CHAT_ID
              }
            );
          }
          try {
            await runScheduledAnalyticsSnapshot(env2, ctx);
          } catch (e) {
            await notifyTelegram(
              env2,
              `[day1design/cron] analytics snapshot \uC2E4\uD328
${(e?.message || "").slice(0, 200)}`,
              {
                botToken: env2.TELEGRAM_BOT_TOKEN,
                chatId: env2.TELEGRAM_ADMIN_CHAT_ID
              }
            );
          }
        }
        try {
          const chunk = await runBackfillChunks(env2, ctx);
          if (chunk?.ran) {
            const span = chunk.processed.length ? `${chunk.processed[0].start}~${chunk.processed[chunk.processed.length - 1].end}` : "";
            await notifyTelegram(
              env2,
              `[day1design/cron] Meta \uC9C0\uD45C \uBC31\uD544 ${chunk.ok ? "\uC644\uB8CC" : "\uC2E4\uD328"} \u2014 ${span} ${chunk.processed.length}\uAD6C\uAC04 (\uB0A8\uC740 \uAD6C\uAC04 ${chunk.remaining}/${chunk.total})`,
              {
                botToken: env2.META_RATE_TELEGRAM_BOT_TOKEN,
                chatId: env2.META_RATE_TELEGRAM_CHAT_ID
              }
            );
          }
        } catch (e) {
          await notifyTelegram(
            env2,
            `[day1design/cron] Meta \uC9C0\uD45C \uBC31\uD544 \uC624\uB958
${(e?.message || "").slice(0, 200)}`,
            {
              botToken: env2.META_RATE_TELEGRAM_BOT_TOKEN,
              chatId: env2.META_RATE_TELEGRAM_CHAT_ID
            }
          );
        }
        try {
          const recount = await runLeadRecountBackfill(env2, ctx);
          if (recount?.ran) {
            await notifyTelegram(
              env2,
              `[day1design/cron] Meta \uB9AC\uB4DC \uC7AC\uC9D1\uACC4 \uBC31\uD544 ${recount.ok ? "\uC644\uB8CC" : "\uC2E4\uD328"}`,
              {
                botToken: env2.META_RATE_TELEGRAM_BOT_TOKEN,
                chatId: env2.META_RATE_TELEGRAM_CHAT_ID
              }
            );
          }
        } catch (e) {
          await notifyTelegram(
            env2,
            `[day1design/cron] Meta \uB9AC\uB4DC \uC7AC\uC9D1\uACC4 \uBC31\uD544 \uC624\uB958
${(e?.message || "").slice(0, 200)}`,
            {
              botToken: env2.META_RATE_TELEGRAM_BOT_TOKEN,
              chatId: env2.META_RATE_TELEGRAM_CHAT_ID
            }
          );
        }
        try {
          await runAndReportHealth(env2, createServices(env2), {
            triggeredBy: isDaily ? "cron" : "hourly",
            alertOnlyOnIssue: !isDaily
          });
        } catch (e) {
          await notifyTelegram(
            env2,
            `[day1design/cron] healthcheck \uC2E4\uD328
${(e?.message || "").slice(0, 200)}`,
            healthReportTarget(env2) || {}
          );
        }
      })()
    );
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
