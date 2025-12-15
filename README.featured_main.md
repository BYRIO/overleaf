# featured_main 增强功能说明

本分支将多个独立特性串成一条线性提交，方便统一试用和验证。下文按模块概述新增功能、入口与使用方式，并列出已知依赖与注意事项。

## 1. 管理员项目列表（admin-project-list）
- 入口：站点管理员访问 `/admin/project`。
- 功能：分页浏览项目（GET `/admin/project/list?page=1&perPage=20`，返回 `projects/total/totalPages`），可导出（POST `/admin/project/:projectId/export`）或删除项目（POST `/admin/project/:projectId/delete`）。
- 权限：通过 `AuthorizationMiddleware.ensureUserIsSiteAdmin` 限制，仅管理员可见。
- 补充：新增自助注册页面 `/self-register`（公开访问），填写邮箱后会发送激活邮件，引导用户设置密码完成注册。

## 2. 沙箱编译（sandbox-compile）
- 设置：`services/web/config/settings.defaults.js` 新增 `sandbox` 配置块，可用环境变量控制（见下文），默认开启并指定 TexLive Docker 镜像。
- CLI/脚本：
  - `bin/pre-pull-texlive-images.sh` 预拉取镜像。
  - `server-ce/health/check-texlive-images.sh` 健康检查，可用作 Docker HEALTHCHECK。
- 构建：仍用默认 `Makefile` 目标，必要时先 `make pre-pull-texlive-images` 以减少首次启动失败。
- 运行要点：需要挂载 `/var/run/docker.sock` 以及宿主机编译/输出目录（`SANDBOXED_COMPILES_HOST_DIR_COMPILES`、`SANDBOXED_COMPILES_HOST_DIR_OUTPUT`）；常用变量包含 `SANDBOX_ENABLED`、`SANDBOX_DOCKER_RUNNER`、`SANDBOX_SIBLING_CONTAINERS`、`TEX_LIVE_DOCKER_IMAGE`、`AUTO_PULL_TEXLIVE_IMAGE`、`FAIL_ON_*`。

## 3. Git 备份（gitbackup）
- 新镜像：`server-ce/Dockerfile-gitbridge`，`make build-gitbackup` 生成 gitbackup 镜像。
- 服务脚本：`server-ce/runit/gitbackup-manager/run`、`server-ce/gitbackup/gitbackup-manager.js`。
- 配套脚本：`gitbackup/*.sh`、`gitbackup/*.py` 及 `gitbackup_test_tools` 用于创建测试用户、拉取项目列表等。
- 用户字段：新增 `sshPublicKey` / `sshPrivateKey` 便于备份集成。

## 4. LaTeX 可视化公式编辑器（latex-editor）
- 模块：`services/web/modules/latex-editor`；已加入 `moduleImportSequence` 与 `sourceEditorToolbarComponents`。
- 前端：在源代码编辑器的数学工具组中出现“符号/公式”按钮，弹出 KaTeX 渲染的可视化公式面板与符号面板。
- 样式：`services/web/frontend/stylesheets/pages/editor/latex-editor.scss`。

## 5. 参考文献检索器（references）
- 工具栏：新增“搜索参考文献”按钮（调用 `commands.openReferencePicker`），提供检索/插入引用。
- 组件：`services/web/frontend/js/features/ide-react/references/ReferencePickerModal.tsx` 等。
- 依赖：`fuse.js` 移入生产依赖，用于本地模糊检索。

## 6. 修订/评论整合（track-changes-and-comments）
- 模块：`services/web/modules/track-changes`，已加入 `moduleImportSequence`。
- 路由：仅在 `moduleImportSequence` 包含 `track-changes` 时注册修订与线程操作（保存修订、获取线程、发送/编辑/删除消息、解析 ranges 等）。
- 调试：新增 `debugRoutes` 开关，可输出已注册路由。

## 7. LLM Chat（ai_assistent）
- 用户设置：账户设置页“LLM Settings”可勾选“Use my own LLM settings”，现支持多条个人模型和供应商预设（OpenAI-compatible / Anthropic / Google Gemini），每条包含 Base URL、Model、API Key、默认标记，可“Check Connection”并保存。
- 项目端点：`/project/:Project_id/llm/chat`、`/project/:Project_id/llm/models`（需项目读取权限），由后端代理请求，不在前端暴露密钥。
- UI：编辑器工具栏聊天面板入口、PDF 日志“Ask AI”按钮等；样式位于 `frontend/stylesheets/pages/editor/llm-chat.scss`。无模型时，侧边栏内置快速设置表单（含 provider 选择）。
- 文档：`doc/llm-providers.md` 说明支持的供应商预设和填写示例。
- 工具：`tools/llm/list_llm_models.sh` 列出可用模型。
- 环境配置：可选全局模型/密钥 `LLM_AVAILABLE_MODELS`、`LLM_MODEL_NAME`、`LLM_API_URL`、`LLM_API_KEY`；否则走用户自填。无网络或未配置时会提示缺模型。

## 8. Logo 工具（logo-tools）
- 目录：`logo_tools/` 提供生成 favicon、icons、额外 logo 的脚本与 Python 工具（如 `generate_icons.py`、`create_sw_versions.py`）。
- 用法：在 repo 根执行对应脚本，按 README 指示生成资源。

## 9. 自助注册与域名白名单
- 页面：公开入口 `/self-register`，用户输入邮箱后收到激活邮件，设置密码完成注册。
- 白名单：支持逗号分隔的邮箱域名（例如 `bupt.edu.cn`），不在白名单则拒绝并展示支持提示。
- 限流：按积分和时长进行频控，超限后阻断并提示。
- 配置：`SELF_REGISTER_ALLOWED_DOMAINS`、`SELF_REGISTER_RATE_POINTS`、`SELF_REGISTER_RATE_DURATION`、`SELF_REGISTER_RATE_BLOCK_DURATION`、`CONTACT_SUPPORT_TEXT`。

## 10. Texlab 补全与日志增强
- 功能：后端集成 Texlab LSP，提供代码补全、诊断和符号服务。
- 运行：可设定进程池大小、超时、空闲清理策略，支持持久化工作区根或临时工作区。
- 日志：独立 Texlab 日志文件（默认 `/var/log/overleaf/texlab.log`，不可写时回退 `/tmp/texlab.log`），便于定位 LSP 问题。
- 配置：`TEXLAB_PATH`、`TEXLAB_ARGS`、`TEXLAB_MAX_PROCS`、`TEXLAB_IDLE_MS`、`TEXLAB_RESPONSE_TIMEOUT_MS`、`TEXLAB_WORKSPACE_TTL_MS`、`TEXLAB_WORKDIR_BASE`、`TEXLAB_PROJECT_ROOT`、`TEXLAB_LOG_PATH`。

## 11. BYRIO 品牌与自托管模板
- Compose 示例：`docker-compose.env.example.yml` 和 `docker-compose.yml` 的默认标题为 `BYRIO OVERLEAF`，示例自助注册白名单为 `bupt.edu.cn`。
- 文档：`README.env.md` 汇总所有环境变量、默认值与配置教程（SMTP、LDAP、沙箱编译、Texlab、LLM、gitbackup、S3）。
- 快速启动：复制 compose 示例、设置站点 URL/管理员邮箱/密钥和邮件或 LDAP，再运行 `docker compose -f docker-compose.env.example.yml up -d`。

## 依赖与构建
- 新增生产依赖：`katex`、`react-markdown`、`remark-gfm`、`remark-math`、`rehype-katex`、`fuse.js`。
- `server-ce/Dockerfile` 会全局安装 `npm@11.4.2`、`patch-package`、`dockerode`；构建 gitbackup 镜像需 `Dockerfile-gitbridge`。

## 环境变量清单（按模块）
- **沙箱编译**：`SANDBOX_ENABLED`（默认 true，可设为 `false` 关闭）、`SANDBOX_DOCKER_RUNNER`、`SANDBOX_SIBLING_CONTAINERS`、`DOCKER_SOCKET_PATH`、`TEX_LIVE_DOCKER_IMAGE`、`ALL_TEX_LIVE_DOCKER_IMAGES`、`ALL_TEX_LIVE_DOCKER_IMAGE_NAMES`、`TEX_COMPILER_EXTRA_FLAGS`、`TEX_LIVE_IMAGE_USER`、`AUTO_PULL_TEXLIVE_IMAGE`、`FAIL_ON_MISSING_TEXLIVE_IMAGE`、`FAIL_ON_IMAGE_PULL_FAILURE`、`AUTO_BACKFILL_TEXLIVE_IMAGE`、`AUTO_FALLBACK_TEXLIVE_IMAGE`。
- **Track-changes 调试**：`DEBUG_ROUTES=true` 可输出路由列表。
- **Gitbackup**：`GITBACKUP_ENABLED`（默认 false）、`GITBACKUP_IMAGE`、`GITBACKUP_CONTAINER_NAME`、`GITBACKUP_SSH_PORT`（宿主对外 SSH 端口）、`GITBACKUP_PUID`/`GITBACKUP_PGID`（运行用户/组）、`GITBACKUP_DATA_DIR`（容器内路径，默认 `/var/lib/overleaf/gitbackup`）、`GITBACKUP_HOST_DATA_DIR`（宿主挂载路径）、`GITBACKUP_HOST_LOG_DIR`、`GITBACKUP_HOST_ETC_DIR`、`GITBACKUP_CHECK_INTERVAL`（ms，默认 30000）、`GITBACKUP_PULL_IMAGE`（true 时启动前拉镜像）、`DOCKER_NETWORK`（默认 bridge，用于 gitbackup sidecar）。脚本操作 Mongo 时仍需 `OVERLEAF_MONGO_URL`、`OVERLEAF_CONTAINER_NAME`。
- **LLM Chat**：由用户在界面输入 API URL/Key/Model，无必填环境变量。
- **自助注册限流/域名**：`SELF_REGISTER_RATE_POINTS`（默认 5 次）、`SELF_REGISTER_RATE_DURATION`（默认 3600 秒）、`SELF_REGISTER_RATE_BLOCK_DURATION`（默认 3600 秒）、`SELF_REGISTER_ALLOWED_DOMAINS`（逗号分隔域名列表，例如 `bupt.edu.cn,bupt.cn`，为空则不限制）。
- **通用受限页提示**：`CONTACT_SUPPORT_TEXT`（如“如需开通访问，请联系 support@example.com”），在 403 受限页显示。
- **SSH 公钥**：无额外环境变量，用户可在账号设置中自行粘贴公钥（私钥不存储）。
- **Texlab 补全**：
  - 路径与参数：`TEXLAB_PATH`（默认 `texlab`）、`TEXLAB_ARGS`（默认空）。
  - 进程池与超时：`TEXLAB_MAX_PROCS`（默认 4）、`TEXLAB_IDLE_MS`（默认 20 分钟）、`TEXLAB_RESPONSE_TIMEOUT_MS`（默认 20000ms）。
  - 工作区选择（两者择一）：
    - `TEXLAB_PROJECT_ROOT`：直接把已有项目根作为工作区，路径为 `<TEXLAB_PROJECT_ROOT>/<projectId>`，适合已挂载/持久化的项目数据。
    - `TEXLAB_WORKDIR_BASE`：用于生成临时工作区根（默认 `/tmp/texlab-workspaces`），实际工作区 `<base>/<projectId>`，启动时会同步项目内容并按 `TEXLAB_WORKSPACE_TTL_MS`（默认 5 分钟）清理。
  - 日志：`TEXLAB_LOG_PATH`（默认 `/var/log/overleaf/texlab.log`，失败时回退 `/tmp/texlab.log`）。

## 已知风险与排查提示
- LLM 与 gitbackup 的敏感字段（`llmApiKey`、`sshPrivateKey` 等）以明文存入用户文档，需确保数据库/备份的访问安全。
- LLM Chat 对外 API 依赖可用的 `apiUrl` 与模型，未设置或网络受限时会报错；当前无额外速率限制，需在反向代理或网关侧限制滥用。
- 沙箱编译：在无 Docker/镜像的环境请显式设置 `SANDBOX_ENABLED=false` 或关闭 `AUTO_PULL_TEXLIVE_IMAGE`、`FAIL_ON_*` 以避免启动失败，或预先运行预拉取脚本。
- 管理员项目列表已分页，但导出/删除仍属于重操作，建议限制管理员账号使用并考虑后端限流。
- Gitbackup 构建链路对全局 npm 版本有依赖，若基础镜像中自带 npm 版本冲突可能导致安装失败。
- Track-changes 仅在模块启用时注册路由，如 404/403 请检查 `moduleImportSequence` 与权限，并可通过 `DEBUG_ROUTES=true` 输出路由用于排查。

## 自托管示例（BYRIO OVERLEAF）
- 参考 `docker-compose.env.example.yml` 作为一键示例，默认标题 `BYRIO OVERLEAF`，自助注册白名单示例 `bupt.edu.cn`。
- 全部环境变量与配置说明见 `README.env.md`（SMTP、LDAP、沙箱编译、Texlab、LLM、gitbackup、S3 等）。
- 快速步骤：
  1. 复制 compose 示例，至少修改 `OVERLEAF_SITE_URL`、`OVERLEAF_ADMIN_EMAIL`、`OVERLEAF_SESSION_SECRET`/`SESSION_SECRET`、邮件或 LDAP 信息。
  2. 准备数据目录 `data/overleaf data/mongo data/redis`，如启用沙箱编译或 gitbackup，需挂载 `/var/run/docker.sock`。
  3. 启动 `docker compose -f docker-compose.env.example.yml up -d`，观察 `docker compose logs -f overleaf` 并打开配置的 `OVERLEAF_SITE_URL`。

如需进一步验证，建议在本分支运行完整测试/构建流程，并在有外网的环境下验证 LLM Chat 与沙箱编译镜像拉取。 
