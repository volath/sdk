'use strict';
/**
 * Starts the code of a plugin in its own Node process and talks to it (host.js is the other end). Used by the server and
 * by the plugin tool, so `plugin test` runs a plugin exactly the way Volath does.
 *
 * Sandbox: the process is started with Node's permission model, which blocks child processes, workers, native addons and
 * every file outside the plugin's own folder. The network cannot be closed by Node, so a plugin that wants to be
 * trusted with the network uses ctx.http (checked against permissions.network); plugin code is still code you install,
 * so the install screen shows what it asks for. VOLATH_PLUGIN_SANDBOX=off turns the sandbox off (for runtimes without it).
 */
const { fork } = require('child_process');
const path = require('path');

const HOST = path.join(__dirname, 'host.js');
const START_TIMEOUT_MS = 10000;
const CALL_TIMEOUT_MS = 60000;

function sandboxFlag() {
  if (process.env.VOLATH_PLUGIN_SANDBOX === 'off') return null;
  const flags = process.allowedNodeEnvironmentFlags;
  if (flags.has('--permission')) return '--permission';
  if (flags.has('--experimental-permission')) return '--experimental-permission';
  return null;
}

class PluginProcess {
  /**
   * onMetric({ kind: 'call' | 'rpc', method, ms, ok }) is told about every call of Volath to the plugin (call) and of the plugin to Volath (rpc);
   * stats: memory and cpu the process reported (see host.js), null until the first heartbeat.
   * @param {{ dir: string, main: string, rpc: (method: string, args: any[]) => Promise<any>, onLog?: (level: string, message: string) => void, onExit?: (code: number | null) => void, callTimeoutMs?: number }} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.child = null;
    this.waiting = new Map();
    this.nextId = 1;
    this.sandboxed = false;
    this.startedAt = null;
    /** { memoryMb, cpuPercent, at } of the last heartbeat of the process */
    this.stats = null;
    this.lastCpu = null;
  }

  get running() {
    return Boolean(this.child && this.child.connected);
  }

  start() {
    const { dir, main, onLog } = this.opts;
    const flag = sandboxFlag();
    if (!flag && process.env.VOLATH_PLUGIN_SANDBOX !== 'off') {
      return Promise.reject(new Error('This Node.js has no permission sandbox (needs Node 22 or newer), so plugin code is not started. Set VOLATH_PLUGIN_SANDBOX=off to run it without one.'));
    }
    this.sandboxed = Boolean(flag);
    const execArgv = ['--max-old-space-size=256', ...(flag ? [flag, `--allow-fs-read=${dir}`, `--allow-fs-read=${__dirname}`] : [])];
    return new Promise((resolve, reject) => {
      const child = fork(HOST, [dir, main], {
        cwd: dir,
        execArgv,
        // Nothing from the environment of Volath (tokens, keys) reaches the plugin
        env: { ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      });
      this.child = child;
      this.startedAt = Date.now();
      let settled = false;
      const settle = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
      const timer = setTimeout(() => { child.kill(); settle(reject, new Error('The plugin did not start within 10 seconds.')); }, START_TIMEOUT_MS);

      child.stderr.on('data', (d) => onLog && onLog('error', String(d).trim().slice(0, 2000)));
      child.stdout.on('data', (d) => onLog && onLog('info', String(d).trim().slice(0, 2000)));
      child.on('message', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'ready') settle(resolve);
        else if (msg.t === 'fatal') settle(reject, new Error(msg.error));
        else if (msg.t === 'log') onLog && onLog(msg.level, msg.message);
        else if (msg.t === 'result') this.finish(msg);
        else if (msg.t === 'rpc') this.answer(msg);
        else if (msg.t === 'stats') this.sample(msg);
      });
      child.on('error', (err) => settle(reject, err));
      child.on('exit', (code) => {
        for (const w of this.waiting.values()) { clearTimeout(w.timer); this.metric('call', w.method, w.started, false); w.reject(new Error(`The plugin process stopped (exit code ${code}).`)); }
        this.waiting.clear();
        this.child = null;
        this.stats = null;
        settle(reject, new Error(`The plugin process stopped while starting (exit code ${code}).`));
        this.opts.onExit && this.opts.onExit(code);
      });
    });
  }

  /** A heartbeat of the process: cpu is the share of one core used since the last one (since the start, for the first) */
  sample(msg) {
    if (typeof msg.rss !== 'number' || typeof msg.cpu !== 'number') return;
    const now = Date.now();
    const prev = this.lastCpu;
    const wallMicros = prev ? (now - prev.at) * 1000 : Number(msg.uptime || 0) * 1e6;
    const usedMicros = prev ? msg.cpu - prev.cpu : msg.cpu;
    const cpuPercent = wallMicros > 0 ? Math.max(0, Math.min(100 * 8, Math.round((usedMicros / wallMicros) * 1000) / 10)) : 0;
    this.lastCpu = { at: now, cpu: msg.cpu };
    this.stats = { memoryMb: Math.round((msg.rss / 1048576) * 10) / 10, cpuPercent, at: now };
  }

  metric(kind, method, started, ok) {
    if (this.opts.onMetric) {
      try { this.opts.onMetric({ kind, method, ms: Date.now() - started, ok }); } catch { /* a metric never breaks a call */ }
    }
  }

  finish(msg) {
    const w = this.waiting.get(msg.id);
    if (!w) return;
    this.waiting.delete(msg.id);
    clearTimeout(w.timer);
    this.metric('call', w.method, w.started, Boolean(msg.ok));
    if (msg.ok) w.resolve(msg.value);
    else w.reject(new Error(msg.error));
  }

  async answer(msg) {
    let reply;
    const started = Date.now();
    try {
      reply = { t: 'rpc-result', id: msg.id, ok: true, value: await this.opts.rpc(msg.method, msg.args || []) };
    } catch (err) {
      reply = { t: 'rpc-result', id: msg.id, ok: false, error: String((err && err.message) || err) };
    }
    this.metric('rpc', msg.method, started, reply.ok);
    if (this.running) this.child.send(reply);
  }

  /** Calls onLoad / onEvent / onRequest / task of the plugin; a call that takes too long kills the process. */
  call(method, args, ctx) {
    if (!this.running) return Promise.reject(new Error('The plugin is not running.'));
    const id = this.nextId++;
    const ms = this.opts.callTimeoutMs || CALL_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        this.metric('call', method, started, false);
        reject(new Error(`${method} took more than ${ms / 1000} seconds, so the plugin was stopped.`));
        this.stop();
      }, ms);
      this.waiting.set(id, { resolve, reject, timer, method, started });
      this.child.send({ t: 'call', id, method, args, ctx });
    });
  }

  /** Stops the process; resolves once it is gone (a folder in use cannot be deleted on Windows before that). */
  stop() {
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
      setTimeout(resolve, 3000).unref();
    });
  }
}

module.exports = { PluginProcess, sandboxFlag };
