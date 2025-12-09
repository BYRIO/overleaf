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
- 用户设置：账户设置页新增“LLM Settings”，可勾选“Use my own LLM settings”，填写 API URL、模型名、API Key，支持“Check Connection”和保存。
- 项目端点：`/project/:Project_id/llm/chat`、`/project/:Project_id/llm/models`（需项目读取权限）。
- UI：编辑器工具栏新增聊天面板入口、PDF 日志“Ask AI”按钮等；样式位于 `frontend/stylesheets/pages/editor/llm-chat.scss`。
- 工具：`tools/llm/list_llm_models.sh` 列出可用模型。

## 8. Logo 工具（logo-tools）
- 目录：`logo_tools/` 提供生成 favicon、icons、额外 logo 的脚本与 Python 工具（如 `generate_icons.py`、`create_sw_versions.py`）。
- 用法：在 repo 根执行对应脚本，按 README 指示生成资源。

## 依赖与构建
- 新增生产依赖：`katex`、`react-markdown`、`remark-gfm`、`remark-math`、`rehype-katex`、`fuse.js`。
- `server-ce/Dockerfile` 会全局安装 `npm@11.4.2`、`patch-package`、`dockerode`；构建 gitbackup 镜像需 `Dockerfile-gitbridge`。

## 环境变量清单（按模块）
- **沙箱编译**：`SANDBOX_ENABLED`（默认 true，可设为 `false` 关闭）、`SANDBOX_DOCKER_RUNNER`、`SANDBOX_SIBLING_CONTAINERS`、`DOCKER_SOCKET_PATH`、`TEX_LIVE_DOCKER_IMAGE`、`ALL_TEX_LIVE_DOCKER_IMAGES`、`ALL_TEX_LIVE_DOCKER_IMAGE_NAMES`、`TEX_COMPILER_EXTRA_FLAGS`、`TEX_LIVE_IMAGE_USER`、`AUTO_PULL_TEXLIVE_IMAGE`、`FAIL_ON_MISSING_TEXLIVE_IMAGE`、`FAIL_ON_IMAGE_PULL_FAILURE`、`AUTO_BACKFILL_TEXLIVE_IMAGE`、`AUTO_FALLBACK_TEXLIVE_IMAGE`。
- **Track-changes 调试**：`DEBUG_ROUTES=true` 可输出路由列表。
- **Gitbackup 脚本**：`OVERLEAF_MONGO_URL`、`OVERLEAF_CONTAINER_NAME`（与 docker-compose 保持一致）、`GITBACKUP_SSH_PORT`（测试脚本默认 22）。
- **LLM Chat**：由用户在界面输入 API URL/Key/Model，无必填环境变量。
- **自助注册限流/域名**：`SELF_REGISTER_RATE_POINTS`（默认 5 次）、`SELF_REGISTER_RATE_DURATION`（默认 3600 秒）、`SELF_REGISTER_RATE_BLOCK_DURATION`（默认 3600 秒）、`SELF_REGISTER_ALLOWED_DOMAINS`（逗号分隔域名列表，例如 `bupt.edu.cn,bupt.cn`，为空则不限制）。
- **通用受限页提示**：`CONTACT_SUPPORT_TEXT`（如“如需开通访问，请联系 support@example.com”），在 403 受限页显示。

## 已知风险与排查提示
- LLM 与 gitbackup 的敏感字段（`llmApiKey`、`sshPrivateKey` 等）以明文存入用户文档，需确保数据库/备份的访问安全。
- LLM Chat 对外 API 依赖可用的 `apiUrl` 与模型，未设置或网络受限时会报错；当前无额外速率限制，需在反向代理或网关侧限制滥用。
- 沙箱编译：在无 Docker/镜像的环境请显式设置 `SANDBOX_ENABLED=false` 或关闭 `AUTO_PULL_TEXLIVE_IMAGE`、`FAIL_ON_*` 以避免启动失败，或预先运行预拉取脚本。
- 管理员项目列表已分页，但导出/删除仍属于重操作，建议限制管理员账号使用并考虑后端限流。
- Gitbackup 构建链路对全局 npm 版本有依赖，若基础镜像中自带 npm 版本冲突可能导致安装失败。
- Track-changes 仅在模块启用时注册路由，如 404/403 请检查 `moduleImportSequence` 与权限，并可通过 `DEBUG_ROUTES=true` 输出路由用于排查。

如需进一步验证，建议在本分支运行完整测试/构建流程，并在有外网的环境下验证 LLM Chat 与沙箱编译镜像拉取。 
