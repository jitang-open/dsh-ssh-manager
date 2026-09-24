/**
 * dsh-ssh-manager — browser half.
 *
 * Hand-written `__ModuleLoader__` bundle (no build step): a right-aligned
 * session-header button that toggles a full-height floating panel over the
 * frame. Data comes from the server half's loopback-only `/api/ssh-manager`
 * endpoints via same-origin fetch. React comes from the browser module table.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ssh-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Route namespace owned by the server half. */
    const API = '/api/ssh-manager'

    const CSS = [
      '.dsh-ssh-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}',
      '.dsh-ssh-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;flex-wrap:wrap}',
      '.dsh-ssh-title{font-size:14px;font-weight:600;margin:0 0 2px}',
      '.dsh-ssh-sub{color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-ssh-grow{flex:1;min-width:0}',
      '.dsh-ssh-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}',
      '.dsh-ssh-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-ssh-btn:disabled{opacity:.5;cursor:default}',
      '.dsh-ssh-btn.is-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.dsh-ssh-btn.is-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.dsh-ssh-body{display:flex;flex:1;min-height:0}',
      '.dsh-ssh-list{width:272px;flex:none;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box}',
      '.dsh-ssh-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:12px;padding:10px 12px;cursor:pointer}',
      '.dsh-ssh-card:hover{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-ssh-card.is-active{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-ssh-row{display:flex;align-items:center;gap:8px}',
      '.dsh-ssh-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-ssh-target{color:var(--dsw-alias-label-secondary);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-ssh-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-label-secondary);opacity:.45}',
      '.dsh-ssh-dot.ok{background:var(--dsw-alias-state-success-primary);opacity:1}',
      '.dsh-ssh-dot.fail{background:var(--dsw-alias-state-error-primary);opacity:1}',
      '.dsh-ssh-dot.testing{background:var(--dsw-alias-state-warn-primary);opacity:1}',
      '.dsh-ssh-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
      '.dsh-ssh-tag{border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 7px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dsh-ssh-detail{flex:1;min-width:0;overflow:auto;padding:16px 18px;box-sizing:border-box}',
      '.dsh-ssh-tabs{display:flex;gap:6px;margin-bottom:14px}',
      '.dsh-ssh-tab{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit}',
      '.dsh-ssh-tab.is-active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}',
      '.dsh-ssh-grid{display:grid;grid-template-columns:92px minmax(0,1fr);gap:7px 12px;font-size:12px}',
      '.dsh-ssh-key{color:var(--dsw-alias-label-secondary)}',
      '.dsh-ssh-val{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}',
      '.dsh-ssh-term{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;max-height:360px;overflow:auto}',
      '.dsh-ssh-input{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 9px;font-size:12px;font-family:inherit}',
      '.dsh-ssh-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-ssh-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}',
      '.dsh-ssh-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}',
      '.dsh-ssh-label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-ssh-notice{border-radius:8px;padding:7px 10px;font-size:12px;margin-bottom:12px;border:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-ssh-notice.ok{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-ssh-notice.error{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-ssh-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}',
      '.dsh-ssh-empty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:14px}',
      '.dsh-ssh-cmdrow{display:flex;gap:8px;align-items:flex-start}',
      '.dsh-ssh-hint{color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:6px}',
      '.dsh-ssh-util{display:inline-flex;align-items:center;gap:6px;appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:999px;padding:4px 10px;font-size:12px;line-height:1.4;cursor:pointer;font-family:inherit;white-space:nowrap}',
      '.dsh-ssh-util:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-ssh-util.is-open{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-ssh-util-count{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-ssh-overlay{position:fixed;top:84px;right:16px;bottom:16px;width:min(900px,calc(100vw - 32px));pointer-events:auto;z-index:60;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.34);overflow:hidden}',
      '.dsh-ssh-panel{display:flex;flex-direction:column;flex:1;min-height:0}'
    ].join('')

    /** Owned stylesheet: created on apply, removed with the effect. */
    function installStyles() {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-ssh-manager'
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    const QUICK = {
      linux: ['uptime', 'df -h', 'free -h', 'docker ps', 'who'],
      windows: ['hostname', 'ipconfig', 'tasklist | findstr /I node', 'systeminfo | findstr /B /C:"OS Name" /C:"OS Version"']
    }

    /** Call one server-half endpoint. */
    async function api(method, path, body) {
      const response = await fetch(API + path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return await response.json()
    }

    /** A blank editor draft. */
    function emptyDraft() {
      return { id: '', name: '', host: '', port: '22', user: '', keyPath: '', kind: 'linux', note: '', tags: '', isNew: true }
    }

    /** Shared panel-open state plus the last known host/status snapshot. */
    const uiStore = {
      open: false,
      hosts: [],
      statuses: {},
      listeners: [],
      snapshot() {
        return { open: uiStore.open, hosts: uiStore.hosts, statuses: uiStore.statuses }
      },
      set(patch) {
        if (patch.open !== undefined) uiStore.open = patch.open
        if (patch.hosts !== undefined) uiStore.hosts = patch.hosts
        if (patch.statuses !== undefined) uiStore.statuses = patch.statuses
        for (const listener of uiStore.listeners) listener()
      },
      subscribe(listener) {
        uiStore.listeners.push(listener)
        return () => {
          uiStore.listeners = uiStore.listeners.filter((item) => item !== listener)
        }
      }
    }

    function useUiStore() {
      const [snapshot, setSnapshot] = React.useState(uiStore.snapshot())
      React.useEffect(() => uiStore.subscribe(() => setSnapshot(uiStore.snapshot())), [])
      return snapshot
    }

    function Dot(props) {
      return h('span', { className: 'dsh-ssh-dot ' + (props.state || '') })
    }

    function TerminalGlyph(props) {
      const size = props && props.size ? props.size : 13
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true'
      },
        h('rect', { x: 2.5, y: 4, width: 19, height: 16, rx: 3 }),
        h('path', { d: 'M7 9.5l2.5 2.5L7 14.5' }),
        h('path', { d: 'M12.5 15h4.5' })
      )
    }

    function HeaderButton() {
      const snapshot = useUiStore()
      React.useEffect(() => {
        let alive = true
        api('GET', '/hosts').then((result) => {
          if (alive && result && Array.isArray(result.hosts)) uiStore.set({ hosts: result.hosts })
        }).catch(() => {})
        return () => { alive = false }
      }, [])
      let online = 0
      let offline = 0
      for (const item of snapshot.hosts) {
        const state = (snapshot.statuses[item.id] || {}).state
        if (state === 'ok') online += 1
        else if (state === 'fail') offline += 1
      }
      const dotState = online > 0 && offline === 0 ? 'ok' : (offline > 0 && online === 0 ? 'fail' : '')
      return h('button', {
        type: 'button',
        className: 'dsh-ssh-util' + (snapshot.open ? ' is-open' : ''),
        title: 'SSH 管理器 · ' + snapshot.hosts.length + ' 台主机' + (online > 0 ? ' · ' + online + ' 在线' : '') + (offline > 0 ? ' · ' + offline + ' 离线' : ''),
        onClick: () => uiStore.set({ open: !uiStore.open })
      },
        h(Dot, { state: dotState }),
        h(TerminalGlyph, { size: 13 }),
        h('span', null, 'SSH 管理'),
        snapshot.hosts.length === 0 ? null : h('span', { className: 'dsh-ssh-util-count' }, String(snapshot.hosts.length))
      )
    }

    function ManagerPanel(props) {
      const [hosts, setHosts] = React.useState([])
      const [status, setStatus] = React.useState({})
      const [selectedId, setSelectedId] = React.useState('')
      const [tab, setTab] = React.useState('overview')
      const [probe, setProbe] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [command, setCommand] = React.useState('')
      const [output, setOutput] = React.useState(null)
      const [history, setHistory] = React.useState([])
      const [notice, setNotice] = React.useState(null)
      const [storePath, setStorePath] = React.useState('')
      const [confirmId, setConfirmId] = React.useState('')
      const statusMirror = {}

      const selected = hosts.find((item) => item.id === selectedId) || null

      function say(kind, text) {
        setNotice({ kind, text })
      }

      function patchStatus(id, value) {
        statusMirror[id] = value
        setStatus({ ...statusMirror })
        uiStore.set({ statuses: { ...statusMirror } })
      }

      function testOne(id) {
        patchStatus(id, { state: 'testing' })
        return api('POST', '/test', { id }).then((result) => {
          const ok = result && result.ok === true
          patchStatus(id, { state: ok ? 'ok' : 'fail', ms: result ? result.ms : 0, message: result ? result.message : '' })
          return result
        }).catch((error) => {
          patchStatus(id, { state: 'fail', message: String(error?.message ?? error) })
        })
      }

      function applyList(result) {
        const list = result && Array.isArray(result.hosts) ? result.hosts : []
        setHosts(list)
        uiStore.set({ hosts: list })
        setStorePath(result && typeof result.storePath === 'string' ? result.storePath : '')
        setSelectedId((prev) => (prev !== '' && list.some((item) => item.id === prev) ? prev : (list[0]?.id ?? '')))
        return list
      }

      function load() {
        return api('GET', '/hosts').then((result) => {
          if (result && result.ok === false) { say('error', result.error || '读取主机清单失败'); return [] }
          const list = applyList(result)
          for (const item of list) testOne(item.id)
          return list
        }).catch((error) => {
          say('error', '读取主机清单失败：' + String(error?.message ?? error))
          return []
        })
      }

      React.useEffect(() => { load() }, [])

      function openEditor(item) {
        setNotice(null)
        setDraft(item === null ? emptyDraft() : {
          id: item.id,
          name: item.name,
          host: item.host,
          port: String(item.port),
          user: item.user,
          keyPath: item.keyPath,
          kind: item.kind,
          note: item.note,
          tags: (item.tags || []).join(', '),
          isNew: false
        })
        setTab('edit')
      }

      function saveDraft() {
        if (draft === null) return
        setBusy(true)
        api('POST', '/save', {
          host: {
            id: draft.id,
            name: draft.name,
            host: draft.host,
            port: Number(draft.port) || 22,
            user: draft.user,
            keyPath: draft.keyPath,
            kind: draft.kind,
            note: draft.note,
            tags: draft.tags
          }
        }).then((result) => {
          if (result && result.ok === false) { say('error', result.error || '保存失败'); return }
          applyList(result)
          if (result && result.host) setSelectedId(result.host.id)
          setDraft(null)
          setTab('overview')
          say('ok', '已保存到 ' + (storePath === '' ? '主机清单' : storePath))
          if (result && result.host) testOne(result.host.id)
        }).catch((error) => {
          say('error', '保存失败：' + String(error?.message ?? error))
        }).finally(() => setBusy(false))
      }

      function removeHost(id) {
        setBusy(true)
        api('POST', '/remove', { id }).then((result) => {
          if (result && result.ok === false) { say('error', result.error || '删除失败'); return }
          applyList(result)
          setConfirmId('')
          setProbe(null)
          setOutput(null)
          say('ok', '已删除该主机')
        }).catch((error) => {
          say('error', '删除失败：' + String(error?.message ?? error))
        }).finally(() => setBusy(false))
      }

      function probeHost(id) {
        setBusy(true)
        setProbe('探测中…')
        api('POST', '/probe', { id }).then((result) => {
          if (result && result.ok === false && !result.stdout) { setProbe('探测失败：' + (result.error || result.stderr || '未知错误')); return }
          const text = [result.stdout, result.stderr].filter((part) => part && part !== '').join('\n')
          setProbe(text === '' ? '(无输出)' : text)
        }).catch((error) => {
          setProbe('探测失败：' + String(error?.message ?? error))
        }).finally(() => setBusy(false))
      }

      function runCommand(text) {
        const line = typeof text === 'string' ? text.trim() : command.trim()
        if (line === '' || selected === null) return
        setBusy(true)
        setCommand(line)
        api('POST', '/exec', { id: selected.id, command: line }).then((result) => {
          setOutput({
            command: line,
            stdout: typeof result?.stdout === 'string' ? result.stdout : '',
            stderr: typeof result?.stderr === 'string' ? result.stderr : '',
            exitCode: typeof result?.exitCode === 'number' ? result.exitCode : -1,
            ms: typeof result?.ms === 'number' ? result.ms : 0,
            timedOut: result?.timedOut === true,
            truncated: result?.truncated === true,
            error: result?.error ? result.error : ''
          })
          setHistory((prev) => [line, ...prev.filter((item) => item !== line)].slice(0, 12))
          testOne(selected.id)
        }).catch((error) => {
          setOutput({ command: line, stdout: '', stderr: String(error?.message ?? error), exitCode: -1, ms: 0 })
        }).finally(() => setBusy(false))
      }

      function field(label, control) {
        return h('div', { className: 'dsh-ssh-field' }, h('span', { className: 'dsh-ssh-label' }, label), control)
      }

      function input(key, placeholder) {
        return h('input', {
          className: 'dsh-ssh-input',
          value: draft[key] || '',
          placeholder: placeholder || '',
          onChange: (event) => setDraft({ ...draft, [key]: event.target.value })
        })
      }

      function renderEditor() {
        return h('div', null,
          h('div', { className: 'dsh-ssh-sub', style: { marginBottom: '12px' } }, draft.isNew ? '新增 SSH 主机' : '编辑「' + draft.name + '」'),
          h('div', { className: 'dsh-ssh-form' },
            field('名称', input('name', '我的服务器')),
            field('系统类型', h('select', {
              className: 'dsh-ssh-input',
              value: draft.kind,
              onChange: (event) => setDraft({ ...draft, kind: event.target.value })
            }, h('option', { value: 'linux' }, 'Linux / macOS'), h('option', { value: 'windows' }, 'Windows'))),
            field('主机地址', input('host', '192.168.1.10')),
            field('端口', input('port', '22')),
            field('用户名', input('user', 'root')),
            field('私钥路径（留空则用默认密钥/agent）', input('keyPath', '~/.ssh/id_ed25519'))
          ),
          field('备注', input('note', '用途说明')),
          field('标签（逗号分隔）', input('tags', '生产, 内网')),
          h('div', { className: 'dsh-ssh-chips' },
            h('button', { className: 'dsh-ssh-btn is-primary', disabled: busy, onClick: saveDraft }, busy ? '保存中…' : '保存'),
            h('button', { className: 'dsh-ssh-btn', onClick: () => { setDraft(null); setTab('overview') } }, '取消')
          ),
          h('div', { className: 'dsh-ssh-hint' }, '连接方式：ssh -o BatchMode=yes（仅公钥认证，不会卡在密码提示）。')
        )
      }

      function renderOverview(item) {
        const st = status[item.id] || {}
        return h('div', null,
          h('div', { className: 'dsh-ssh-row', style: { marginBottom: '14px' } },
            h(Dot, { state: st.state }),
            h('div', { className: 'dsh-ssh-grow' },
              h('div', { style: { fontSize: '16px', fontWeight: 600 } }, item.name),
              h('div', { className: 'dsh-ssh-sub' }, st.state === 'ok' ? '在线 · ' + st.ms + ' ms' : (st.state === 'fail' ? '离线 · ' + String(st.message || '') : (st.state === 'testing' ? '测试中…' : (item.note || '未测试'))))
            ),
            h('span', { className: 'dsh-ssh-tag' }, item.kind === 'windows' ? 'Windows' : 'Linux')
          ),
          h('div', { className: 'dsh-ssh-grid' },
            h('span', { className: 'dsh-ssh-key' }, '地址'), h('span', { className: 'dsh-ssh-val' }, item.host),
            h('span', { className: 'dsh-ssh-key' }, '端口'), h('span', { className: 'dsh-ssh-val' }, String(item.port)),
            h('span', { className: 'dsh-ssh-key' }, '用户名'), h('span', { className: 'dsh-ssh-val' }, item.user),
            h('span', { className: 'dsh-ssh-key' }, '登录命令'), h('span', { className: 'dsh-ssh-val' }, 'ssh ' + (item.keyPath ? '-i ' + item.keyPath + ' ' : '') + item.user + '@' + item.host),
            h('span', { className: 'dsh-ssh-key' }, '私钥'), h('span', { className: 'dsh-ssh-val' }, item.keyPath || '(默认密钥 / agent)'),
            h('span', { className: 'dsh-ssh-key' }, '备注'), h('span', { className: 'dsh-ssh-val' }, item.note || '—')
          ),
          h('div', { className: 'dsh-ssh-chips' },
            h('button', { className: 'dsh-ssh-btn is-primary', disabled: busy || st.state === 'testing', onClick: () => testOne(item.id) }, '测试连接'),
            h('button', { className: 'dsh-ssh-btn', disabled: busy, onClick: () => probeHost(item.id) }, '探测信息'),
            h('button', { className: 'dsh-ssh-btn', disabled: busy, onClick: () => setTab('shell') }, '执行命令'),
            h('button', { className: 'dsh-ssh-btn', disabled: busy, onClick: () => openEditor(item) }, '编辑'),
            confirmId === item.id
              ? h('button', { className: 'dsh-ssh-btn is-danger', disabled: busy, onClick: () => removeHost(item.id) }, '确认删除')
              : h('button', { className: 'dsh-ssh-btn', disabled: busy, onClick: () => { setConfirmId(item.id); say('error', '再次点击「确认删除」才会移除该主机'); } }, '删除'),
            confirmId === item.id ? h('button', { className: 'dsh-ssh-btn', onClick: () => setConfirmId('') }, '取消') : null
          ),
          probe === null ? null : h('div', { className: 'dsh-ssh-term', style: { marginTop: '14px' } }, probe)
        )
      }

      function renderShell(item) {
        const quick = QUICK[item.kind === 'windows' ? 'windows' : 'linux']
        return h('div', null,
          h('div', { className: 'dsh-ssh-cmdrow' },
            h('input', {
              className: 'dsh-ssh-input',
              value: command,
              placeholder: '在 ' + item.name + ' 上执行命令，回车运行',
              onChange: (event) => setCommand(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') runCommand() }
            }),
            h('button', { className: 'dsh-ssh-btn is-primary', disabled: busy || command.trim() === '', onClick: () => runCommand() }, busy ? '运行中…' : '运行')
          ),
          h('div', { className: 'dsh-ssh-chips' }, quick.map((item2) =>
            h('button', { key: item2, className: 'dsh-ssh-btn', disabled: busy, onClick: () => runCommand(item2) }, item2)
          )),
          output === null ? h('div', { className: 'dsh-ssh-empty' }, '尚无输出。') : h('div', { className: 'dsh-ssh-term', style: { marginTop: '14px' } },
            '$ ' + output.command + '\n' + (output.stdout === '' ? '' : output.stdout) + (output.stderr === '' ? '' : (output.stdout === '' ? '' : '\n') + '[stderr]\n' + output.stderr) + (output.error ? '\n' + output.error : '') + '\n[退出码 ' + output.exitCode + ' · ' + output.ms + ' ms' + (output.timedOut ? ' · 已超时' : '') + (output.truncated ? ' · 输出已截断' : '') + ']'
          ),
          history.length === 0 ? null : h('div', null,
            h('div', { className: 'dsh-ssh-label', style: { marginTop: '14px' } }, '本次会话执行过的命令'),
            h('div', { className: 'dsh-ssh-chips' }, history.map((item2) =>
              h('button', { key: item2, className: 'dsh-ssh-btn', disabled: busy, onClick: () => runCommand(item2) }, item2.length > 40 ? item2.slice(0, 40) + '…' : item2)
            ))
          )
        )
      }

      function renderDetail(item) {
        const tabs = [['overview', '概览'], ['shell', '命令'], ['edit', '编辑']]
        return h('div', null,
          h('div', { className: 'dsh-ssh-tabs' }, tabs.map((pair) =>
            h('button', {
              key: pair[0],
              className: 'dsh-ssh-tab' + (tab === pair[0] ? ' is-active' : ''),
              onClick: () => {
                if (pair[0] === 'edit') { openEditor(item); return }
                setTab(pair[0])
              }
            }, pair[1])
          )),
          tab === 'shell' ? renderShell(item) : renderOverview(item)
        )
      }

      return h('div', { className: 'dsh-ssh-root' },
        h('div', { className: 'dsh-ssh-head' },
          h('div', { className: 'dsh-ssh-grow' },
            h('h2', { className: 'dsh-ssh-title' }, 'SSH 管理器'),
            h('div', { className: 'dsh-ssh-sub', title: storePath }, hosts.length + ' 台主机 · 清单 ' + (storePath === '' ? '~/.dsh/ssh-manager/hosts.json' : storePath))
          ),
          h('button', { className: 'dsh-ssh-btn', onClick: () => openEditor(null) }, '＋ 新增主机'),
          h('button', { className: 'dsh-ssh-btn', disabled: busy || hosts.length === 0, onClick: () => { for (const item of hosts) testOne(item.id) } }, '测试全部'),
          h('button', { className: 'dsh-ssh-btn', disabled: busy, onClick: () => { load() } }, '刷新'),
          h('button', { className: 'dsh-ssh-btn', title: '关闭面板', onClick: () => { if (props && props.onClose) props.onClose() } }, '✕')
        ),
        h('div', { className: 'dsh-ssh-body' },
          h('div', { className: 'dsh-ssh-list' },
            hosts.length === 0 ? h('div', { className: 'dsh-ssh-empty' }, '暂无主机，点击「新增主机」添加。') : null,
            hosts.map((item) => {
              const st = status[item.id] || {}
              return h('div', {
                key: item.id,
                className: 'dsh-ssh-card' + (item.id === selectedId ? ' is-active' : ''),
                onClick: () => { setSelectedId(item.id); setProbe(null); setOutput(null); setConfirmId(''); setTab('overview') }
              },
                h('div', { className: 'dsh-ssh-row' },
                  h(Dot, { state: st.state }),
                  h('div', { className: 'dsh-ssh-name dsh-ssh-grow' }, item.name),
                  h('span', { className: 'dsh-ssh-tag' }, item.kind === 'windows' ? 'Windows' : 'Linux')
                ),
                h('div', { className: 'dsh-ssh-target' }, item.user + '@' + item.host + (item.port === 22 ? '' : ':' + item.port)),
                st.state === 'ok' ? h('div', { className: 'dsh-ssh-sub' }, '在线 · ' + st.ms + ' ms') : null,
                st.state === 'testing' ? h('div', { className: 'dsh-ssh-sub' }, '测试中…') : null,
                st.state === 'fail' ? h('div', { className: 'dsh-ssh-sub', title: st.message }, '离线 · ' + String(st.message || '').slice(0, 42)) : null,
                (item.tags || []).length === 0 ? null : h('div', { className: 'dsh-ssh-tags' }, item.tags.map((tag) =>
                  h('span', { key: tag, className: 'dsh-ssh-tag' }, tag)
                ))
              )
            })
          ),
          h('div', { className: 'dsh-ssh-detail' },
            notice === null ? null : h('div', { className: 'dsh-ssh-notice ' + notice.kind }, notice.text),
            draft !== null ? renderEditor() : (selected === null ? h('div', { className: 'dsh-ssh-empty' }, '从左侧选择一台主机，或新增一台。') : renderDetail(selected))
          )
        )
      )
    }

    function Overlay() {
      const snapshot = useUiStore()
      if (!snapshot.open) return null
      return h('div', { className: 'dsh-ssh-overlay' },
        h('div', { className: 'dsh-ssh-panel' },
          h(ManagerPanel, { onClose: () => uiStore.set({ open: false }) })
        )
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(installStyles, 'ssh-manager: styles')
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'ssh-manager',
          order: 10,
          label: 'SSH 管理'
        }, HeaderButton))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'ssh-manager-panel',
          order: 30,
          label: 'SSH 管理'
        }, Overlay))
      }
    }
  }
})
