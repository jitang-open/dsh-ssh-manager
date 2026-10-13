/**
 * dsh-ssh-manager — server half.
 *
 * Owns the SSH inventory and the plugin's preferences at
 * `~/.dsh/ssh-manager/hosts.json`, serves nine loopback-only endpoints under
 * `/api/ssh-manager` for the browser half, and
 * registers two model-facing tools (`ssh_hosts`, `ssh_run`), and — when the
 * profile carries dsh-tui's panel service — a side panel listing the hosts.
 *
 * Imports nothing from the Harness: a profile bundle resolves only `node:`
 * builtins and its own relative files, so tool definitions are written as plain
 * JSON-Schema objects instead of going through a DSL helper.
 *
 * Everything SSH runs through `execFile('ssh', argv)` — no shell string is ever
 * built, so user names, key paths and remote commands need no quoting.
 *
 * @module dsh-ssh-manager
 */
import { execFile } from 'node:child_process'
import { connect } from 'node:net'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Hard dependencies: the HTTP carrier and the tool registry. */
export const inject = ['webServer', 'tools']

/** Route namespace owned by this plugin. */
const API_PREFIX = '/api/ssh-manager'

/** Durable inventory path. */
const STORE_PATH = join(homedir(), '.dsh', 'ssh-manager', 'hosts.json')

/** Repo whose published manifest the update check reads. */
const REPO_URL = 'https://github.com/jitang-open/dsh-ssh-manager'
const MANIFEST_API = 'https://api.github.com/repos/jitang-open/dsh-ssh-manager/contents/package.json'
const UPDATE_CACHE_MS = 10 * 60 * 1000

const STORE_VERSION = 1

/** Defaults for the plugin's own preferences. */
const DEFAULT_SETTINGS = { autoCheckUpdate: true, autoTestHosts: true, connectTimeoutSec: 10 }
const DEFAULT_TIMEOUT_MS = 60000
const MAX_TIMEOUT_MS = 300000
const TEST_TIMEOUT_MS = 25000
const CONNECT_TIMEOUT_SEC = 10
const MAX_OUTPUT_BYTES = 512 * 1024
const MAX_BODY_BYTES = 256 * 1024

/** Cached own version, filled on first read. */
let ownVersion = ''

/** Cached update report, so a panel open does not re-spend the rate limit. */
let updateCache = null

/**
 * Trim a possibly-absent string field.
 * @param value - raw field value.
 * @returns the trimmed string, or `''`.
 */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Whether a decoded JSON value is a plain object.
 * @param value - candidate value.
 * @returns true for a non-null, non-array object.
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @returns the current time as an ISO string. */
function nowIso() {
  return new Date().toISOString()
}

/**
 * Normalize a tag-like field into a bounded string list.
 * @param value - array or comma-separated string.
 * @returns at most eight non-empty entries.
 */
function toList(value) {
  if (Array.isArray(value)) {
    return value.map(textOf).filter((item) => item !== '').slice(0, 8)
  }
  const text = textOf(value)
  if (text === '') return []
  return text.split(/[,，]/).map(textOf).filter((item) => item !== '').slice(0, 8)
}

/**
 * Clamp a caller-supplied timeout.
 * @param value - raw timeout in milliseconds.
 * @returns a positive timeout within the plugin's ceiling.
 */
function clampTimeout(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.floor(number), MAX_TIMEOUT_MS)
}

/**
 * Initial inventory for a machine that has no store file yet.
 *
 * Deliberately empty: host records are personal infrastructure (addresses, user
 * names, key paths), so this package ships none. A fresh install starts with an
 * empty list and the panel's own add-host form; the real inventory lives only in
 * the store file above.
 * @returns the hosts to seed.
 */
function seedHosts() {
  return []
}

/**
 * Normalize the plugin's preferences, filling defaults for absent fields.
 * @param value - the stored `settings` object, however malformed.
 * @returns a complete settings object.
 */
function normalizeSettings(value) {
  const raw = isObject(value) ? value : {}
  const seconds = Number(raw.connectTimeoutSec)
  return {
    autoCheckUpdate: raw.autoCheckUpdate !== false,
    autoTestHosts: raw.autoTestHosts !== false,
    connectTimeoutSec: Number.isFinite(seconds)
      ? Math.min(60, Math.max(3, Math.floor(seconds)))
      : DEFAULT_SETTINGS.connectTimeoutSec
  }
}

/**
 * Read the inventory, seeding it on first use.
 * @returns the decoded inventory document.
 */
async function readStore() {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, 'utf8'))
    if (isObject(parsed) && Array.isArray(parsed.hosts)) {
      parsed.settings = normalizeSettings(parsed.settings)
      return parsed
    }
  } catch {
    // Absent or unreadable: fall through to the seed below.
  }
  const seeded = { version: STORE_VERSION, updatedAt: nowIso(), hosts: seedHosts() }
  await writeStore(seeded)
  return seeded
}

/**
 * Atomically replace the inventory.
 * @param data - the document to persist.
 * @returns the same document.
 */
async function writeStore(data) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  const staged = `${STORE_PATH}.tmp`
  await writeFile(staged, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await chmod(staged, 0o600)
  await rename(staged, STORE_PATH)
  return data
}

/**
 * Validate and normalize one host record.
 * @param input - candidate record.
 * @param existingId - id to preserve when editing an existing host.
 * @returns the normalized record.
 * @throws when a required field is missing.
 */
function normalizeHost(input, existingId) {
  const raw = isObject(input) ? input : {}
  const hostName = textOf(raw.name)
  const address = textOf(raw.host)
  if (hostName === '') throw new Error('主机名称不能为空')
  if (address === '') throw new Error('主机地址不能为空')
  const port = Number(raw.port)
  const id = existingId !== '' ? existingId : textOf(raw.id)
  return {
    id: id !== '' ? id : `host-${Date.now().toString(36)}`,
    name: hostName,
    host: address,
    port: Number.isFinite(port) && port > 0 && port < 65536 ? Math.floor(port) : 22,
    user: textOf(raw.user) === '' ? 'root' : textOf(raw.user),
    keyPath: textOf(raw.keyPath),
    kind: raw.kind === 'windows' ? 'windows' : 'linux',
    note: textOf(raw.note),
    tags: toList(raw.tags),
    extraOptions: toList(raw.extraOptions),
    createdAt: textOf(raw.createdAt) === '' ? nowIso() : textOf(raw.createdAt),
    updatedAt: nowIso()
  }
}

/**
 * Resolve one host by id or display name.
 * @param data - the inventory document.
 * @param key - id or name.
 * @returns the stored record.
 * @throws when nothing matches.
 */
function findHost(data, key) {
  const wanted = textOf(key)
  const found = data.hosts.find((item) => item.id === wanted || item.name === wanted)
  if (found === undefined) throw new Error(`未找到主机：${wanted === '' ? '(空)' : wanted}`)
  return found
}

/**
 * Project a stored record onto the wire shape.
 * @param item - stored record.
 * @returns the browser-facing projection.
 */
function publicHost(item) {
  return {
    id: item.id,
    name: item.name,
    host: item.host,
    port: item.port,
    user: item.user,
    keyPath: item.keyPath,
    kind: item.kind,
    note: item.note,
    tags: item.tags,
    extraOptions: item.extraOptions,
    updatedAt: item.updatedAt
  }
}

/**
 * Build the ssh argv for one remote command.
 * @param item - stored host record.
 * @param command - command to run on the remote side.
 * @returns argv for `execFile`, with no shell involved.
 */
function sshArgv(item, command, connectTimeoutSec) {
  const argv = ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${connectTimeoutSec ?? CONNECT_TIMEOUT_SEC}`, '-o', 'StrictHostKeyChecking=accept-new']
  if (item.port !== 22) argv.push('-p', String(item.port))
  if (item.keyPath !== '') argv.push('-i', item.keyPath, '-o', 'IdentitiesOnly=yes')
  for (const option of item.extraOptions ?? []) argv.push('-o', option)
  argv.push(`${item.user}@${item.host}`)
  // Windows OpenSSH runs the command through cmd.exe, whose default code page
  // mangles non-ASCII output; force UTF-8 before the real command.
  argv.push(item.kind === 'windows' ? `chcp 65001>nul & ${command}` : command)
  return argv
}

/**
 * Test one host: TCP handshake latency plus a real authenticated SSH round trip.
 *
 * Shared by the HTTP route and the TUI panel so both report the same numbers.
 * @param item - stored host record.
 * @param connectTimeoutSec - configured ssh ConnectTimeout.
 * @returns the report the browser half and the panel both render.
 */
async function testHost(item, connectTimeoutSec) {
  const latencyMs = await measureTcpRtt(item)
  const result = await execRemote(item, 'echo DSH_SSH_OK', TEST_TIMEOUT_MS, undefined, connectTimeoutSec)
  const stdout = result.stdout.trim()
  const stderr = result.stderr.trim()
  const ok = result.exitCode === 0 && stdout.includes('DSH_SSH_OK')
  const detail = ok ? '连接成功' : (stderr !== '' ? stderr : (stdout !== '' ? stdout : `退出码 ${result.exitCode}`))
  return { ok, id: item.id, ms: result.ms, latencyMs, exitCode: result.exitCode, timedOut: result.timedOut, message: detail.slice(0, 400) }
}

/**
 * Measure the TCP handshake round trip to a host's SSH port.
 *
 * This is the network latency the panel shows: the equivalent of a ping, except
 * it also works where ICMP is filtered and it measures the port actually used.
 * @param item - stored host record.
 * @param timeoutMs - give up after this long.
 * @returns milliseconds, or null when the handshake does not complete.
 */
function measureTcpRtt(item, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = connect({ host: item.host, port: item.port })
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(Date.now() - started))
    socket.once('timeout', () => finish(null))
    socket.once('error', () => finish(null))
  })
}

/**
 * Run one command on a remote host.
 * @param item - stored host record.
 * @param command - remote command.
 * @param timeoutMs - cooperative timeout.
 * @param signal - optional cancellation from the caller.
 * @returns the outcome, including both streams and the elapsed time.
 */
function execRemote(item, command, timeoutMs, signal, connectTimeoutSec) {
  return new Promise((resolve) => {
    const started = Date.now()
    execFile(
      'ssh',
      sshArgv(item, command, connectTimeoutSec),
      { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8', signal },
      (error, stdout, stderr) => {
        const failed = error !== null
        const exitCode = !failed ? 0 : (typeof error.code === 'number' ? error.code : -1)
        resolve({
          id: item.id,
          name: item.name,
          target: `${item.user}@${item.host}:${item.port}`,
          command,
          exitCode,
          timedOut: failed && error.killed === true,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          truncated: failed && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          ms: Date.now() - started
        })
      }
    )
  })
}

/**
 * Whether a request originates from this machine.
 * @param req - the incoming request.
 * @returns true for loopback peers only.
 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Write one JSON response.
 * @param res - the server response.
 * @param status - HTTP status code.
 * @param value - JSON-serializable body.
 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

/**
 * Read and decode a bounded JSON request body.
 * @param req - the incoming request.
 * @returns the decoded value, or `{}` when the body is empty.
 * @throws when the body is too large or not valid JSON.
 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  return JSON.parse(text)
}

/**
 * Wrap one endpoint so every failure becomes a JSON error instead of a hang.
 * @param handler - the endpoint body.
 * @returns a WebRoute handler.
 */
function route(handler) {
  return async (req, res) => {
    try {
      if (!isLoopback(req)) {
        sendJson(res, 403, { ok: false, error: '仅允许本机访问' })
        return
      }
      const value = await handler(req)
      sendJson(res, 200, value)
    } catch (error) {
      sendJson(res, 200, { ok: false, error: String(error?.message ?? error) })
    }
  }
}

/**
 * This package's own version, read once from its manifest.
 * @returns the version string, or `'unknown'` when the manifest is unreadable.
 */
async function readOwnVersion() {
  if (ownVersion !== '') return ownVersion
  try {
    const text = await readFile(new URL('./package.json', import.meta.url), 'utf8')
    ownVersion = textOf(JSON.parse(text).version) || 'unknown'
  } catch {
    ownVersion = 'unknown'
  }
  return ownVersion
}

/**
 * Compare two dotted versions.
 * @param a - left version.
 * @param b - right version.
 * @returns 1 when `a` is newer, -1 when older, 0 when equal.
 */
function compareVersions(a, b) {
  const segments = (value) => String(value).replace(/^v/, '').split(/[.+-]/).map((part) => {
    const number = Number.parseInt(part, 10)
    return Number.isFinite(number) ? number : 0
  })
  const left = segments(a)
  const right = segments(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const mine = left[index] ?? 0
    const theirs = right[index] ?? 0
    if (mine !== theirs) return mine > theirs ? 1 : -1
  }
  return 0
}

/**
 * Report the installed version and the version published in the repo.
 *
 * One GitHub API read per cache window: the endpoint is loopback-only, but an
 * unauthenticated caller still shares a 60/hour rate limit.
 * @param force - bypass the in-memory cache (the panel's explicit button).
 * @returns the report; `status` is `current`, `outdated`, `unknown` or `error`.
 *   The `/version?local=1` mode reports `local` instead and skips this path.
 */
async function checkUpdate(force) {
  const current = await readOwnVersion()
  if (!force && updateCache !== null && Date.now() - updateCache.at < UPDATE_CACHE_MS) {
    return updateCache.value
  }
  const report = { current, latest: '', status: 'current', url: REPO_URL, checkedAt: nowIso(), error: '' }
  try {
    const response = await fetch(MANIFEST_API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-ssh-manager' },
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
    const payload = await response.json()
    const manifest = JSON.parse(Buffer.from(String(payload.content ?? ''), 'base64').toString('utf8'))
    report.latest = textOf(manifest.version)
    report.status = report.latest === '' ? 'unknown' : (compareVersions(report.latest, current) > 0 ? 'outdated' : 'current')
  } catch (error) {
    report.status = 'error'
    report.error = String(error?.message ?? error)
  }
  updateCache = { at: Date.now(), value: report }
  return report
}

/** Model-facing schema of one host row. */
const HOST_ROW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'target', 'kind', 'keyPath', 'note'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    target: { type: 'string' },
    kind: { type: 'string' },
    keyPath: { type: 'string' },
    note: { type: 'string' }
  }
}

/** `ssh_hosts` definition; plain JSON Schema, no Harness import. */
const HOSTS_TOOL = {
  name: 'ssh_hosts',
  description: '列出 SSH 管理器中保存的远程主机（腾讯云服务器、Windows 电脑等）：名称、用户名、地址、端口、系统类型、私钥路径与用途备注。需要用 ssh_run 在远程执行命令前，先用它确认主机 id。',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['storePath', 'hosts'],
      properties: {
        storePath: { type: 'string' },
        hosts: { type: 'array', items: HOST_ROW_SCHEMA }
      }
    },
    render: (_args, value) => {
      const lines = [`已保存 ${value.hosts.length} 台 SSH 主机（清单文件：${value.storePath}）`]
      for (const item of value.hosts) {
        lines.push(`- ${item.name}  id=${item.id}  ${item.target}  ${item.kind}${item.note === '' ? '' : `  # ${item.note}`}`)
      }
      return [{ type: 'text', text: lines.join('\n') }]
    }
  },
  execute: async () => {
    const data = await readStore()
    return {
      storePath: STORE_PATH,
      hosts: data.hosts.map((item) => ({
        id: item.id,
        name: item.name,
        target: `${item.user}@${item.host}:${item.port}`,
        kind: item.kind,
        keyPath: item.keyPath,
        note: item.note
      }))
    }
  }
}

/** `ssh_run` definition; plain JSON Schema, no Harness import. */
const RUN_TOOL = {
  name: 'ssh_run',
  description: '在 SSH 管理器保存的远程主机上执行一条命令并返回输出。host 参数传主机 id 或名称（可先用 ssh_hosts 查看，例如 tencent-cloud 或 腾讯云服务器）。Windows 主机的命令会自动切换 UTF-8 代码页。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['host', 'command'],
    properties: {
      host: { type: 'string', description: '主机 id 或名称，例如 tencent-cloud / windows-pc / 腾讯云服务器' },
      command: { type: 'string', description: '要在远程主机上执行的命令' },
      timeoutMs: { type: 'integer', description: '超时毫秒数，默认 60000，最大 300000' }
    }
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['host', 'target', 'command', 'exitCode', 'timedOut', 'ms', 'stdout', 'stderr', 'truncated'],
      properties: {
        host: { type: 'string' },
        target: { type: 'string' },
        command: { type: 'string' },
        exitCode: { type: 'integer' },
        timedOut: { type: 'boolean' },
        ms: { type: 'integer' },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        truncated: { type: 'boolean' }
      }
    },
    render: (_args, value) => {
      const lines = [`$ ssh ${value.target}  # ${value.host}`, `$ ${value.command}`, '', value.stdout === '' ? '(无标准输出)' : value.stdout]
      if (value.stderr !== '') lines.push('', '[stderr]', value.stderr)
      lines.push('', `[退出码 ${value.exitCode} · ${value.ms} ms${value.timedOut ? ' · 已超时' : ''}${value.truncated ? ' · 输出已截断' : ''}]`)
      return [{ type: 'text', text: lines.join('\n') }]
    }
  },
  execute: async (args, exec) => {
    const data = await readStore()
    const item = findHost(data, args?.host)
    const result = await execRemote(item, textOf(args?.command), clampTimeout(args?.timeoutMs), exec?.signal, data.settings?.connectTimeoutSec)
    return {
      host: result.name,
      target: result.target,
      command: result.command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      ms: result.ms,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.truncated
    }
  }
}

/**
 * TUI side-panel body: the host list with live status, the selected host's
 * details, and a key hint.
 *
 * dsh-tui hands the component its own React and a narrowed UI kit, so this
 * function imports nothing at all: every element and hook comes from `props`.
 * @param props - TuiPanelProps supplied by the host.
 * @returns the panel tree.
 */
function SshHostsPanel(props) {
  const React = props.React
  const { Box, Text } = props.ui
  const h = React.createElement
  const [hosts, setHosts] = React.useState([])
  const [status, setStatus] = React.useState({})
  const [cursor, setCursor] = React.useState(0)
  const [note, setNote] = React.useState('')

  // 键盘处理器注册一次就够，靠 ref 读最新状态
  const live = React.useRef({ hosts: [], cursor: 0 })
  live.current = { hosts: hosts, cursor: cursor }

  // 面板内唯一合法的定时源；不可见时传 null 暂停
  const tick = props.ui.useAnimationTime(props.visible ? 30000 : null)

  const reload = React.useCallback(async () => {
    try {
      const data = await readStore()
      const list = data.hosts.map(publicHost)
      setHosts(list)
      setNote('')
      return list
    } catch (error) {
      setNote('读取清单失败：' + String(error?.message ?? error))
      return []
    }
  }, [])

  const testOne = React.useCallback(async (id) => {
    setStatus((prev) => ({ ...prev, [id]: { state: 'testing' } }))
    try {
      const data = await readStore()
      const report = await testHost(findHost(data, id), data.settings?.connectTimeoutSec)
      setStatus((prev) => ({ ...prev, [id]: { state: report.ok ? 'ok' : 'fail', latencyMs: report.latencyMs, ms: report.ms, message: report.message } }))
    } catch (error) {
      setStatus((prev) => ({ ...prev, [id]: { state: 'fail', message: String(error?.message ?? error) } }))
    }
  }, [])

  const testAll = React.useCallback((list) => {
    for (const item of (list ?? live.current.hosts)) testOne(item.id)
  }, [testOne])

  // 进入面板先读清单；按设置决定是否自动测；tick 每 30s 触发一轮刷新
  React.useEffect(() => {
    let alive = true
    reload().then((list) => {
      if (!alive) return
      readStore().then((data) => {
        if (alive && data.settings?.autoTestHosts !== false) testAll(list)
      }).catch(() => {})
    })
    return () => { alive = false }
  }, [reload, testAll, tick])

  React.useEffect(() => props.host.onKey((event) => {
    const list = live.current.hosts
    const move = (delta) => {
      if (list.length === 0) return
      setCursor((prev) => Math.min(list.length - 1, Math.max(0, prev + delta)))
      event.preventDefault()
    }
    if (event.key.upArrow === true || event.input === 'k') return move(-1)
    if (event.key.downArrow === true || event.input === 'j') return move(1)
    const current = list[live.current.cursor]
    if (event.input === 't' && current !== undefined) {
      testOne(current.id)
      return event.preventDefault()
    }
    if (event.input === 'r') {
      testAll()
      return event.preventDefault()
    }
    return undefined
  }), [props.host, testOne, testAll])

  const current = hosts[cursor]
  const rows = hosts.map((item, index) => {
    const st = status[item.id] ?? { state: 'idle' }
    const active = index === cursor
    const dot = st.state === 'ok' ? '●' : (st.state === 'fail' ? '●' : (st.state === 'testing' ? '◌' : '○'))
    const dotColor = st.state === 'ok' ? 'success' : (st.state === 'fail' ? 'error' : (st.state === 'testing' ? 'warning' : 'inactive'))
    const line = st.state === 'ok'
      ? '在线 · ' + (typeof st.latencyMs === 'number' ? st.latencyMs : st.ms) + ' ms'
      : (st.state === 'fail' ? '离线' : (st.state === 'testing' ? '测试中…' : '未测试'))
    return h(Box, { key: item.id, flexDirection: 'column', paddingX: 1 },
      h(Box, { flexDirection: 'row' },
        h(Text, { color: active ? 'accent' : 'subtle' }, active ? '▸ ' : '  '),
        h(Text, { color: dotColor }, dot + ' '),
        h(Text, { color: 'text', bold: active }, item.name)
      ),
      h(Box, { flexDirection: 'row' },
        h(Text, { color: 'subtle' }, '   ' + item.user + '@' + item.host),
        h(Text, { color: st.state === 'ok' ? 'success' : 'subtle' }, '  ' + line)
      )
    )
  })

  const detail = current === undefined ? null : h(Box, { flexDirection: 'column', paddingX: 1, marginTop: 1 },
    h(Text, { color: 'subtle' }, '─'.repeat(Math.max(8, props.width - 4))),
    h(Text, { color: 'subtle' }, '地址  ' + current.host + ':' + current.port),
    h(Text, { color: 'subtle' }, '用户  ' + current.user),
    h(Text, { color: 'subtle' }, '系统  ' + (current.kind === 'windows' ? 'Windows' : 'Linux')),
    current.note === '' ? null : h(Text, { color: 'subtle', wrap: 'wrap' }, '备注  ' + current.note)
  )

  return h(Box, { flexDirection: 'column', width: props.width, height: props.height },
    hosts.length === 0
      ? h(Text, { color: 'subtle' }, '清单为空 —— 在 Web 面板里添加主机')
      : h(Box, { flexDirection: 'column' }, rows),
    note === '' ? null : h(Text, { color: 'error', wrap: 'wrap' }, note),
    detail,
    h(Text, { color: props.focused ? 'subtle' : 'inactive' }, '↑↓ 选择 · t 测试 · r 全测')
  )
}

/**
 * Register the TUI side panel when the profile carries the panel service.
 *
 * dsh-tui provides `tuiPanels`; a Web-only profile does not, so this is a
 * no-op there and the Web half keeps working unchanged.
 * @param ctx - the host context.
 */
function mountTuiPanel(ctx) {
  const panels = ctx.get('tuiPanels')
  if (panels === undefined || panels === null) {
    console.log('[ssh-manager] 无 tuiPanels 服务，跳过 TUI 侧栏面板（Web-only profile）')
    return
  }
  const dispose = panels.register({
    apiVersion: 1,
    id: 'hosts',
    title: 'SSH 管理器',
    minColumns: 28,
    order: 40,
    component: SshHostsPanel
  }, ctx)
  console.log(dispose === undefined
    ? '[ssh-manager] TUI 侧栏面板被拒绝（原因见上面 warn）'
    : '[ssh-manager] TUI 侧栏面板已注册；当前面板列表=' + JSON.stringify(panels.list()))
  ctx.effect(() => dispose ?? (() => {}), 'ssh-manager: tui hosts panel')
}

/**
 * Mount the SSH manager.
 * @param ctx - the host context carrying `webServer` and `tools`.
 */
export function apply(ctx) {
  const list = route(async () => {
    const data = await readStore()
    return { ok: true, storePath: STORE_PATH, hosts: data.hosts.map(publicHost) }
  })

  const save = route(async (req) => {
    const body = await readJsonBody(req)
    const input = isObject(body?.host) ? body.host : {}
    const data = await readStore()
    const wanted = textOf(input.id)
    const existing = wanted === '' ? undefined : data.hosts.find((item) => item.id === wanted)
    const next = normalizeHost({ ...(existing ?? {}), ...input }, existing?.id ?? '')
    const hosts = existing === undefined
      ? [...data.hosts, next]
      : data.hosts.map((item) => (item.id === existing.id ? next : item))
    await writeStore({ version: STORE_VERSION, updatedAt: nowIso(), hosts })
    return { ok: true, host: publicHost(next), hosts: hosts.map(publicHost) }
  })

  const remove = route(async (req) => {
    const body = await readJsonBody(req)
    const data = await readStore()
    const item = findHost(data, body?.id)
    const hosts = data.hosts.filter((entry) => entry.id !== item.id)
    await writeStore({ version: STORE_VERSION, updatedAt: nowIso(), hosts })
    return { ok: true, removed: item.id, hosts: hosts.map(publicHost) }
  })

  const test = route(async (req) => {
    const body = await readJsonBody(req)
    const data = await readStore()
    const item = findHost(data, body?.id)
    return testHost(item, data.settings?.connectTimeoutSec)
  })

  const probe = route(async (req) => {
    const body = await readJsonBody(req)
    const data = await readStore()
    const item = findHost(data, body?.id)
    const remote = item.kind === 'windows'
      ? 'hostname & whoami & ver & (ipconfig | findstr /I "IPv4")'
      : 'hostname; whoami; uname -sr; uptime -p; head -n 2 /etc/os-release'
    const result = await execRemote(item, remote, 30000, undefined, data.settings?.connectTimeoutSec)
    return { ...result, ok: result.exitCode === 0 }
  })

  const exec = route(async (req) => {
    const body = await readJsonBody(req)
    const command = textOf(body?.command)
    if (command === '') throw new Error('命令不能为空')
    const data = await readStore()
    const item = findHost(data, body?.id)
    const result = await execRemote(item, command, clampTimeout(body?.timeoutMs), undefined, data.settings?.connectTimeoutSec)
    return { ...result, ok: result.exitCode === 0 }
  })

  mountTuiPanel(ctx)

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/hosts`, handler: list }), 'ssh-manager: list route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/save`, handler: save }), 'ssh-manager: save route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/remove`, handler: remove }), 'ssh-manager: remove route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/test`, handler: test }), 'ssh-manager: test route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/probe`, handler: probe }), 'ssh-manager: probe route')
  const settingsGet = route(async () => {
    const data = await readStore()
    return { ok: true, settings: normalizeSettings(data.settings) }
  })

  const settingsSave = route(async (req) => {
    const body = await readJsonBody(req)
    const data = await readStore()
    const merged = normalizeSettings({ ...normalizeSettings(data.settings), ...(isObject(body?.settings) ? body.settings : {}) })
    await writeStore({ version: STORE_VERSION, updatedAt: nowIso(), settings: merged, hosts: data.hosts })
    return { ok: true, settings: merged }
  })

  const version = route(async (req) => {
    const query = String(req.url ?? '')
    // `local=1` reports this package's own version without touching the network,
    // so the panel can show a version while automatic checking is switched off.
    if (query.includes('local=1')) {
      return { ok: true, current: await readOwnVersion(), latest: '', status: 'local', url: REPO_URL, checkedAt: '', error: '' }
    }
    const force = query.includes('force=1')
    return { ok: true, ...(await checkUpdate(force)) }
  })

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/exec`, handler: exec }), 'ssh-manager: exec route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/settings`, handler: settingsGet }), 'ssh-manager: settings read route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/settings/save`, handler: settingsSave }), 'ssh-manager: settings save route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/version`, handler: version }), 'ssh-manager: version route')

  ctx.effect(() => ctx.tools.register(HOSTS_TOOL), 'ssh-manager: ssh_hosts tool')
  ctx.effect(() => ctx.tools.register(RUN_TOOL), 'ssh-manager: ssh_run tool')

  console.log(`[ssh-manager] mounted; inventory at ${STORE_PATH}`)
}
