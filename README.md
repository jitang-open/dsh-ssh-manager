# dsh-ssh-manager

SSH 主机管理器，作为 DeepSeek Harness 的 **profile bundle** 常驻：会话标题栏右侧一个按钮，
点开是全高浮层面板；同一份主机清单还注册成两个模型工具，可以直接在对话里说
「登到腾讯云看看磁盘」。

## 三个面

| 文件 | 作用 |
|---|---|
| `index.js` | 宿主半部分：清单读写（`~/.dsh/ssh-manager/hosts.json`）、九个 loopback-only 的 `/api/ssh-manager/*` 端点、两个模型工具 `ssh_hosts` / `ssh_run` |
| `client.js` | 浏览器半部分：手写 `__ModuleLoader__` bundle（无构建步骤），标题栏右侧的「SSH 管理」按钮 + 全高浮层面板 |
| `index.js` 里的 `SshHostsPanel` | TUI 半部分：dsh-tui 的侧栏面板（同一进程内直接读清单，不走 HTTP） |

## 一条硬约束：不 import 任何 harness 包

两个半部分都**只依赖 `node:` 内置模块和自身相对文件**（浏览器侧额外用模块表提供的
`react`）。这不是洁癖：profile bundle 的模块解析只覆盖 dsh 安装与自身目录，
`import '@deepseek-ai/dsh-tools'` 这类写法在 profile 里解析不到，会让整行加载失败、
插件**静默消失**——组装树里还看得见那一行，但它永远激活不了。

所以两个工具的定义是**手写的原生 JSON Schema 对象**，直接交给 `ctx.tools.register`，
而不是走 `defineTool` DSL。同理，客户端只用 `ctx.slots`，不 require 任何
`@deepseek-ai/dsh-client-*`。

## TUI 侧栏面板（dsh-tui）

profile 里挂着 dsh-tui 时，宿主半部分会**特性探测**地注册一个侧栏面板
（`ctx.get('tuiPanels')`，Web-only profile 没有这个服务就跳过，同一份包两处都能装）。
面板显示主机列表、实时状态与**网络 RTT**，选中行下面是地址/用户/系统/备注：

| 键 | 作用 |
|---|---|
| `↑` / `↓`（或 `k` / `j`） | 选择主机 |
| `t` | 测试当前主机 |
| `r` | 全部重测 |
| `Esc` | 焦点回到输入框（不关面板） |

面板组件只用宿主传进来的 `props.React` 与 `props.ui`（`Box` / `Text`），**不 import 任何包**，
与「不 import harness 包」那条硬约束一致；定时刷新走宿主唯一允许的
`ui.useAnimationTime`，面板不可见时自动暂停。

**插件面板默认不在标签栏里**——侧栏的启用清单是一份逗号分隔的设置，默认只有内置的
8 个面板。装好后要到 **`/settings` → 侧栏 → 「启用的面板」** 里勾上「SSH 管理器」，
再按 `Ctrl+B` 打开侧栏（分栏要求 fullscreen 且内容区 ≥93 列）才看得到。

以 profile bundle 身份安装的插件拿不到 TUI 生态的 `dsh-plugin.json` 组件身份，面板 id 会
走宿主发的 fallback 序号（形如 `act1:hosts`）——实测跨会话稳定，但换用插件准入后才会是
稳定的 `<组件名>:hosts`。

## 安装

用 plugin_manager 的 `install_bundle`，**不要**在 profile 里手写 `package.json`、
`cordis.patch.yml` 或跑 pnpm：

```
plugin_manager action=install_bundle target=<本目录绝对路径>
```

它会把本目录装进 profile（`link:` 依赖）并把 `dsh-ssh-manager` 选进
`dsh.profile.bundles`；包内 `cordis.patch.yml` 负责把 `id: ssh-manager` 这行插进宿主
composition，`dsh.client` 声明让浏览器半部分被 client-modules 扫描并注入页面。

返回值里的 `application` 决定是否已生效：`applied` 是热的，`restart-required` 需要
重启一次 `dsh web`——**替换已安装的包一定会给这个**，因为运行中的进程握着旧的
JavaScript 模块世代。

## 首次运行

包里**没有任何内置主机**：清单文件不存在时写入空清单，在面板里用「＋ 新增主机」添加。
主机记录属于个人基础设施（地址、用户名、私钥路径），所以这个包不带任何默认值，
表单占位符也都是通用示例。

## 打包注意：`files` 白名单会吃掉 patch 文件

`dsh.bundle.patch` 指向的 `cordis.patch.yml` 必须出现在 `files` 里。漏掉它时本地源码
目录一切正常，但任何一次打包（`npm pack`、git 安装、pnpm 的 `file:` 协议）生成的副本
里都没有这个文件，profile 会在组装阶段直接抛错退出：

```
Error: dsh: failed to read overlay
  .../node_modules/dsh-ssh-manager/cordis.patch.yml:
  Error: ENOENT: no such file or directory
```

而且它是**延迟发作**的：改白名单的那一刻不会报错，要等下一次依赖安装重新生成副本才炸。

改完 `files` 或 `dsh.*` 之后跑一遍守卫：

```sh
npm run check        # node scripts/check-manifest.mjs
```

它校验 manifest 引用的每个路径（`exports`、`dsh.bundle.patch`）都存在、且都被 `files`
覆盖，不满足就非零退出。

## 自检命令

```sh
# 行是否进入 composition（不启动服务）
dsh --profile web --dump-config | grep -A2 dsh-ssh-manager

# 另起一个实例做端到端验证，不影响正在跑的 3080
dsh --profile web --no-open --port 3099
# 启动日志会打印带 token 的地址；用它取 /api/ssh-manager/hosts
```

## 几个关键决定

- **不拼 shell 字符串**：SSH 一律 `execFile('ssh', argv)`。用户名（含中文）、私钥路径、
  远程命令都作为独立 argv 传递，不需要引号转义，也没有注入面。
- **Windows 编码**：远程命令前加 `chcp 65001>nul &`。否则中文用户名输出是
  `chickensoup-big\????`——那是 GBK 控制台在乱码。
- **只认公钥**：`-o BatchMode=yes`，不会卡在密码提示；配 `ConnectTimeout=10` 与
  `StrictHostKeyChecking=accept-new`。
- **清单原子写**：临时文件 + `rename`，权限 600。

## 端点

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/ssh-manager/hosts` | 列出主机 |
| POST | `/api/ssh-manager/save` | 新增/编辑主机 |
| POST | `/api/ssh-manager/remove` | 删除主机 |
| POST | `/api/ssh-manager/test` | 连接测试 |
| POST | `/api/ssh-manager/probe` | 探测主机信息 |
| POST | `/api/ssh-manager/exec` | 执行命令 |
| GET | `/api/ssh-manager/version` | 版本 / 检测更新（`?force=1` 绕缓存，`?local=1` 只读本地不联网） |
| GET | `/api/ssh-manager/settings` | 读插件设置 |
| POST | `/api/ssh-manager/settings/save` | 写插件设置 |

全部只接受 loopback 来源；非本机请求返回 403。
