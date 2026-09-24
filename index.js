/**
 * dsh-ssh-manager — server half.
 *
 * Owns the SSH inventory at `~/.dsh/ssh-manager/hosts.json`, serves six
 * loopback-only endpoints under `/api/ssh-manager` for the browser half, and
 * registers two model-facing tools (`ssh_hosts`, `ssh_run`).
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
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Hard dependencies: the HTTP carrier and the tool registry. */
export const inject = ['webServer', 'tools']

/** Route namespace owned by this plugin. */
const API_PREFIX = '/api/ssh-manager'

/** Durable inventory path. */
const STORE_PATH = join(homedir(), '.dsh', 'ssh-manager', 'hosts.json')

const STORE_VERSION = 1
const DEFAULT_TIMEOUT_MS = 60000
const MAX_TIMEOUT_MS = 300000
const TEST_TIMEOUT_MS = 25000
const CONNECT_TIMEOUT_SEC = 10
const MAX_OUTPUT_BYTES = 512 * 1024
const MAX_BODY_BYTES = 256 * 1024

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
 * Read the inventory, seeding it on first use.
 * @returns the decoded inventory document.
 */
async function readStore() {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, 'utf8'))
    if (isObject(parsed) && Array.isArray(parsed.hosts)) return parsed
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
function sshArgv(item, command) {
  const argv = ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${CONNECT_TIMEOUT_SEC}`, '-o', 'StrictHostKeyChecking=accept-new']
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
 * Run one command on a remote host.
 * @param item - stored host record.
 * @param command - remote command.
 * @param timeoutMs - cooperative timeout.
 * @param signal - optional cancellation from the caller.
 * @returns the outcome, including both streams and the elapsed time.
 */
function execRemote(item, command, timeoutMs, signal) {
  return new Promise((resolve) => {
    const started = Date.now()
    execFile(
      'ssh',
      sshArgv(item, command),
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
    const result = await execRemote(item, textOf(args?.command), clampTimeout(args?.timeoutMs), exec?.signal)
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
    const result = await execRemote(item, 'echo DSH_SSH_OK', TEST_TIMEOUT_MS)
    const stdout = result.stdout.trim()
    const stderr = result.stderr.trim()
    const ok = result.exitCode === 0 && stdout.includes('DSH_SSH_OK')
    const detail = ok ? '连接成功' : (stderr !== '' ? stderr : (stdout !== '' ? stdout : `退出码 ${result.exitCode}`))
    return { ok, id: item.id, ms: result.ms, exitCode: result.exitCode, timedOut: result.timedOut, message: detail.slice(0, 400) }
  })

  const probe = route(async (req) => {
    const body = await readJsonBody(req)
    const data = await readStore()
    const item = findHost(data, body?.id)
    const remote = item.kind === 'windows'
      ? 'hostname & whoami & ver & (ipconfig | findstr /I "IPv4")'
      : 'hostname; whoami; uname -sr; uptime -p; head -n 2 /etc/os-release'
    const result = await execRemote(item, remote, 30000)
    return { ...result, ok: result.exitCode === 0 }
  })

  const exec = route(async (req) => {
    const body = await readJsonBody(req)
    const command = textOf(body?.command)
    if (command === '') throw new Error('命令不能为空')
    const data = await readStore()
    const item = findHost(data, body?.id)
    const result = await execRemote(item, command, clampTimeout(body?.timeoutMs))
    return { ...result, ok: result.exitCode === 0 }
  })

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/hosts`, handler: list }), 'ssh-manager: list route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/save`, handler: save }), 'ssh-manager: save route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/remove`, handler: remove }), 'ssh-manager: remove route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/test`, handler: test }), 'ssh-manager: test route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/probe`, handler: probe }), 'ssh-manager: probe route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}/exec`, handler: exec }), 'ssh-manager: exec route')

  ctx.effect(() => ctx.tools.register(HOSTS_TOOL), 'ssh-manager: ssh_hosts tool')
  ctx.effect(() => ctx.tools.register(RUN_TOOL), 'ssh-manager: ssh_run tool')

  console.log(`[ssh-manager] mounted; inventory at ${STORE_PATH}`)
}
