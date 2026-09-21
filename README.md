# dsh-ssh-manager

SSH 主机管理器，作为 DeepSeek Harness 的 **profile bundle** 常驻在 web profile 里。

## 两个半部分

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 宿主半部分：清单读写（`~/.dsh/ssh-manager/hosts.json`）、六个 loopback-only 的 `/api/ssh-manager/*` 端点、两个模型工具 `ssh_hosts` / `ssh_run`。SSH 一律走 `execFile('ssh', argv)`，不拼 shell 字符串，所以用户名、私钥路径、远程命令都不需要引号转义 |
| `lib/client.js` | 浏览器半部分：手写 `__ModuleLoader__` bundle（无构建步骤），会话标题栏右侧的「SSH 管理」按钮 + 全高浮层面板 |

## 首次运行

包里**没有任何内置主机**：清单文件不存在时会写入一个空清单，然后在面板里用
「＋ 新增主机」添加。主机记录属于个人基础设施（地址、用户名、私钥路径），
所以这个包不带任何默认值，`lib/client.js` 里的表单占位符也都是通用示例。

## 它是怎么被装上的

1. 包目录软链进 profile：`~/.dsh/profiles/web/node_modules/dsh-ssh-manager` → 本目录
2. `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里列出 `dsh-ssh-manager`
3. 本包 `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，那一行把
   `id: ssh-manager` 插进宿主 composition；`dsh.client` 声明让浏览器半部分
   被 client-modules 扫描并注入页面
4. 重启 `dsh web` 后生效（bundle 列表在启动时读取）

`node_modules/@deepseek-ai/dsh-tools` 是本目录内的解析软链。宿主半部分需要
`import { defineTool } from '@deepseek-ai/dsh-tools'`，而这个包通常放在 profile 之外
（例如 `~/.dsh/ssh-manager/pkg`，再软链进 `profiles/web/node_modules`），Node 从真实
路径向上走找不到 profile 的 node_modules，所以用这个软链把唯一的宿主依赖接上。

## 自检命令

```sh
# 行是否进入 composition（不启动服务）
dsh --profile web --dump-config | grep -A2 dsh-ssh-manager

# 另起一个实例做端到端验证，不影响正在跑的 3080
dsh --profile web --no-open --port 3099
# 启动日志里会打印带 token 的地址；用它取 /api/ssh-manager/hosts
```

## 端点

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/ssh-manager/hosts` | 列出主机 |
| POST | `/api/ssh-manager/save` | 新增/编辑主机 |
| POST | `/api/ssh-manager/remove` | 删除主机 |
| POST | `/api/ssh-manager/test` | 连接测试 |
| POST | `/api/ssh-manager/probe` | 探测主机信息 |
| POST | `/api/ssh-manager/exec` | 执行命令 |

全部只接受 loopback 来源；非本机请求返回 403。
