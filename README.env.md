# 环境变量与部署说明

本指南整理了 Overleaf Community Edition（带管理扩展）的主要环境变量、默认值与配置步骤，并附带一份可直接修改使用的 `docker-compose.env.example.yml` 示例。

## 快速开始
- 复制并修改 `docker-compose.env.example.yml`，至少调整 `OVERLEAF_SITE_URL`、`OVERLEAF_ADMIN_EMAIL`、`OVERLEAF_SESSION_SECRET`/`SESSION_SECRET`、邮箱或 LDAP 信息（如需）。
- 准备宿主机目录：`mkdir -p data/overleaf data/mongo data/redis`，确保当前用户能读写。
- 如要启用沙箱编译或 gitbackup，确认宿主机已安装 Docker 并将 `/var/run/docker.sock` 挂载给容器。
- 启动：`docker compose -f docker-compose.env.example.yml up -d`。首次启动会自动初始化 Mongo 副本集。
- 观察日志确认服务就绪：`docker compose logs -f overleaf`。

## docker-compose 示例
- 完整示例位于 `docker-compose.env.example.yml`，包含必填与常用可选项（SMTP、LDAP、沙箱编译、Texlab、LLM、gitbackup、S3）。
- `overleaf` 服务需要持久化卷 `./data/overleaf`，其中会包含项目文件、编译产物、gitbackup 数据等。
- `mongo` 使用本仓库的初始化脚本创建副本集；`redis` 为会话与实时协作所用。

## 环境变量速查

### 核心/站点信息
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OVERLEAF_APP_NAME` | `Overleaf Community Edition` | 产品名称，出现在标题等处。 |
| `OVERLEAF_SITE_URL` | `http://localhost` | 对外站点地址，用于邮件和链接生成。 |
| `OVERLEAF_NAV_TITLE` | 同 `OVERLEAF_APP_NAME` | 顶栏标题。 |
| `OVERLEAF_ADMIN_EMAIL` | `placeholder@example.com` | 联系邮箱/管理邮箱。 |
| `OVERLEAF_SITE_LANGUAGE` | `en` | 默认站点语言。 |
| `OVERLEAF_ALLOW_PUBLIC_ACCESS` | `false` | 是否允许未登录访问公开页面。 |
| `OVERLEAF_ALLOW_ANONYMOUS_READ_AND_WRITE_SHARING` | `false` | 允许匿名读写分享。 |
| `EMAIL_CONFIRMATION_DISABLED` | `false` | 关闭邮箱验证流程。 |
| `ENABLED_LINKED_FILE_TYPES` | 空 | 允许的外链文件类型列表，逗号分隔。 |
| `OVERLEAF_MAINTENANCE_MESSAGE` / `_HTML` | 空 | 维护模式提示（纯文本/HTML）。 |
| `OVERLEAF_STATUS_PAGE_URL` | 空 | 状态页地址，维护/错误页展示。 |
| `OVERLEAF_RESTRICT_INVITES_TO_EXISTING_ACCOUNTS` | `false` | 仅允许邀请已注册账号。 |

### 数据库与缓存
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OVERLEAF_MONGO_URL` | `mongodb://dockerhost/sharelatex` | 服务器主 Mongo 连接串。 |
| `MONGO_CONNECTION_STRING` / `MONGO_URL` | `mongodb://127.0.0.1/sharelatex` | Web/辅助服务 Mongo 连接。 |
| `MONGO_HOST` | `127.0.0.1` | 便捷主机名（若未直接提供连接串）。 |
| `MONGO_POOL_SIZE` | `100` | Mongo 连接池大小。 |
| `MONGO_SERVER_SELECTION_TIMEOUT` | `60000` ms | Mongo server selection 超时时间。 |
| `MONGO_SOCKET_TIMEOUT` | `60000` ms | Mongo socket 超时时间。 |
| `MONGO_HAS_SECONDARIES` | `false` | 指示是否存在 secondary。 |
| `OVERLEAF_REDIS_HOST` | `dockerhost` | Server CE 的 Redis 主机。 |
| `OVERLEAF_REDIS_PORT` | `6379` | Redis 端口。 |
| `OVERLEAF_REDIS_PASS` | 空 | Redis 密码。 |
| `OVERLEAF_REDIS_TLS` | `false` | Redis TLS 开关。 |
| `REDIS_HOST` | `127.0.0.1` | Web 服务使用的 Redis 主机。 |
| `REDIS_PORT` | `6379` | Redis 端口。 |
| `REDIS_PASSWORD` | 空 | Redis 密码。 |
| `REDIS_DB` | 空 | 指定 Redis DB。 |
| `REDIS_MAX_RETRIES_PER_REQUEST` | `20` | Redis 最大重试次数。 |

### 安全、会话与 Cookie
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OVERLEAF_SESSION_SECRET` / `CRYPTO_RANDOM` | 空 | Server CE Cookie 签名密钥（必填其一）。 |
| `SESSION_SECRET` / `_UPCOMING` / `_FALLBACK` | 空 | Web 服务 Session 密钥轮换。 |
| `BCRYPT_ROUNDS` | `12` | 密码哈希轮数。 |
| `OVERLEAF_SECURE_COOKIE` | 未设置 | 设置任意值即启用 `Secure` 标记。 |
| `OVERLEAF_TRUSTED_PROXY_IPS` | `loopback` | 受信代理地址，需包含 loopback/localhost/127.0.0.1。 |
| `OVERLEAF_COOKIE_SESSION_LENGTH` | `432000000` ms | 会话有效期，默认 5 天。 |
| `COOKIE_DOMAIN` | 空 | Cookie 域。 |
| `COOKIE_NAME` | `overleaf.sid` | Cookie 名称。 |
| `OVERLEAF_CSP_ENABLED` | `true` | 内容安全策略开关。 |
| `SUBNET_RATE_LIMITER_DISABLED` | Server CE: `true` / Web: `false` | 子网限速器（Server CE 默认关闭限速，Web 默认开启限速）。 |
| `BLOCK_CROSS_ORIGIN_REQUESTS` | `false` | 阻止跨域请求。 |
| `ALLOWED_ORIGINS` | `siteUrl` | 允许的跨域来源列表，逗号分隔。 |

### UI 与注册控制
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OVERLEAF_HEADER_IMAGE_URL` | 空 | 顶栏 Logo URL。 |
| `OVERLEAF_HEADER_EXTRAS` | 空 | 顶栏额外链接 JSON。 |
| `OVERLEAF_LEFT_FOOTER` / `OVERLEAF_RIGHT_FOOTER` | 空 | 页脚 JSON 配置。 |
| `OVERLEAF_LOGIN_SUPPORT_TITLE` / `_TEXT` | 空 | 登录页支持信息。 |
| `OVERLEAF_PASSWORD_VALIDATION_PATTERN` | `aA$3` | 密码复杂度模式。 |
| `OVERLEAF_PASSWORD_VALIDATION_MIN_LENGTH` | `8` | 密码最短长度。 |
| `OVERLEAF_PASSWORD_VALIDATION_MAX_LENGTH` | `72` | 密码最长长度。 |
| `OVERLEAF_DISABLE_CHAT` | `false` | 关闭聊天功能。 |
| `OVERLEAF_DISABLE_LINK_SHARING` | `false` | 禁用分享链接。 |
| `ENABLE_ONBOARDING_EMAILS` | `false` | 启用新手引导邮件。 |
| `SELF_REGISTER_ALLOWED_DOMAINS` | 空 | 允许自助注册的邮箱后缀，逗号分隔。 |
| `SELF_REGISTER_RATE_POINTS` | `5` | 注册限流积分。 |
| `SELF_REGISTER_RATE_DURATION` | `3600` s | 注册限流窗口。 |
| `SELF_REGISTER_RATE_BLOCK_DURATION` | `3600` s | 超限封禁时长。 |
| `CONTACT_SUPPORT_TEXT` | 空 | 自助注册被拦截时的提示。 |

### 邮件发送
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OVERLEAF_EMAIL_FROM_ADDRESS` | 空 | 发件人地址，设置后邮件功能启用。 |
| `OVERLEAF_EMAIL_DRIVER` | 空 | 邮件驱动，如 `smtp` 或 `ses`。 |
| `OVERLEAF_EMAIL_REPLY_TO` | 空 | 默认回复地址。 |
| `OVERLEAF_EMAIL_SMTP_HOST` / `_PORT` | 空 / 空 | SMTP 服务器与端口。 |
| `OVERLEAF_EMAIL_SMTP_SECURE` | `null` | SMTP `secure` 选项。 |
| `OVERLEAF_EMAIL_SMTP_IGNORE_TLS` | `null` | 忽略 TLS。 |
| `OVERLEAF_EMAIL_SMTP_USER` / `_PASS` | 空 | SMTP 认证。 |
| `OVERLEAF_EMAIL_SMTP_TLS_REJECT_UNAUTH` | `null` | 校验证书。 |
| `OVERLEAF_EMAIL_SMTP_NAME` | 空 | HELO 名称。 |
| `OVERLEAF_EMAIL_SMTP_LOGGER` | `false` | 输出 SMTP 日志。 |
| `OVERLEAF_EMAIL_AWS_SES_ACCESS_KEY_ID` | 空 | AWS SES Key。 |
| `OVERLEAF_EMAIL_AWS_SES_SECRET_KEY` | 空 | AWS SES Secret。 |
| `OVERLEAF_EMAIL_AWS_SES_REGION` | `us-east-1` | AWS SES 区域。 |
| `OVERLEAF_CUSTOM_EMAIL_FOOTER` | 空 | 自定义邮件页脚。 |

### 编译、沙箱与 Tex Live
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SANDBOX_ENABLED` | `true` | 启用编译沙箱。 |
| `SANDBOX_DOCKER_RUNNER` | `true` | 使用 Docker 运行编译。 |
| `SANDBOX_SIBLING_CONTAINERS` | `true` | 兄弟容器模式。 |
| `DOCKER_SOCKET_PATH` | `/var/run/docker.sock` | Docker 套接字路径。 |
| `TEX_LIVE_DOCKER_IMAGE` | `texlive/texlive:latest-full` | 默认 Tex Live 镜像。 |
| `ALL_TEX_LIVE_DOCKER_IMAGES` | 同上 | 允许的镜像列表，逗号分隔。 |
| `ALL_TEX_LIVE_DOCKER_IMAGE_NAMES` | `TeXLive Latest` | 镜像展示名称列表。 |
| `TEX_LIVE_IMAGE_USER` | `www-data` | 编译容器用户。 |
| `TEX_COMPILER_EXTRA_FLAGS` | `-shell-escape` | 全局编译额外参数。 |
| `COMPILE_TIMEOUT` | `180` s | 编译超时。 |
| `AUTO_PULL_TEXLIVE_IMAGE` | `true` | 启动时自动拉取镜像。 |
| `FAIL_ON_MISSING_TEXLIVE_IMAGE` | `true` | 缺镜像时阻止启动。 |
| `FAIL_ON_IMAGE_PULL_FAILURE` | `true` | 拉取失败是否阻塞。 |
| `AUTO_BACKFILL_TEXLIVE_IMAGE` | `true` | 自动补全镜像缺口。 |
| `AUTO_FALLBACK_TEXLIVE_IMAGE` | `true` | 失败时回退到默认镜像。 |
| `OVERLEAF_HOST_DATA_DIR` | `/var/lib/overleaf` | 宿主机数据根路径（供沙箱、gitbackup 参考）。 |
| `SANDBOXED_COMPILES_HOST_DIR_COMPILES` | 必填 | 宿主机编译目录，沙箱模式必填。 |
| `SANDBOXED_COMPILES_HOST_DIR_OUTPUT` | 建议 | 宿主机输出目录。 |
| `SANDBOXED_COMPILES_VALIDATE_HOST_DIR_VIA_DOCKER` | `true` | 通过 Docker 校验宿主目录。 |
| `SANDBOXED_COMPILES_DIR_VALIDATION_IMAGE` | `busybox:1` | 校验使用的镜像。 |
| `DOCKER_RUNTIME` | 空 | 指定容器 runtime（如 `nvidia`）。 |
| `TEX_LIVE_IMAGE_NAME_OVERRIDE` | 空 | CLSI 侧镜像名称覆写。 |

### Texlab（LaTeX LSP）
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TEXLAB_PATH` | `texlab` | Texlab 可执行路径。 |
| `TEXLAB_ARGS` | 空 | 启动额外参数，空格分隔。 |
| `TEXLAB_RESPONSE_TIMEOUT_MS` | `20000` | 单次请求超时。 |
| `TEXLAB_IDLE_MS` | `1200000` (20 分钟) | 进程空闲回收时间。 |
| `TEXLAB_MAX_PROCS` | `4` | 并发 Texlab 进程上限。 |
| `TEXLAB_WORKSPACE_TTL_MS` | `300000` | 工作区生存时间。 |
| `TEXLAB_WORKDIR_BASE` | `/tmp/texlab-workspaces` | 工作区根目录。 |
| `TEXLAB_PROJECT_ROOT` | 空 | 挂载真实项目根时设置。 |
| `TEXLAB_LOG_PATH` | `/var/log/overleaf/texlab.log` 或 `/tmp/texlab.log` | Texlab 专用日志路径。 |

### LLM 对话（实验特性）
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LLM_AVAILABLE_MODELS` | 空 | 全局可用模型列表，逗号分隔。 |
| `LLM_MODEL_NAME` | 空 | 兼容单模型旧变量。 |
| `LLM_API_URL` | 空 | LLM API 基础地址（自动补 `/chat/completions`）。 |
| `LLM_API_KEY` | 空 | LLM API 密钥。 |

### Gitbackup
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GITBACKUP_ENABLED` | `false` | 启用 gitbackup sidecar。 |
| `GITBACKUP_IMAGE` | `sharelatex/sharelatex-gitbackup:latest` | gitbackup 镜像。 |
| `GITBACKUP_CONTAINER_NAME` | `gitbackup` | 容器名。 |
| `GITBACKUP_SSH_PORT` | `2222` | SSH 暴露端口。 |
| `GITBACKUP_PUID` / `GITBACKUP_PGID` | `1000` / `1000` | 运行用户与用户组。 |
| `GITBACKUP_DATA_DIR` | `/var/lib/overleaf/gitbackup` | 容器内数据目录。 |
| `GITBACKUP_HOST_DATA_DIR` | 空 | 宿主机数据目录（建议与 `GITBACKUP_DATA_DIR` 对应）。 |
| `GITBACKUP_HOST_LOG_DIR` | `${HOST_DATA}/log` | 宿主机日志目录。 |
| `GITBACKUP_HOST_ETC_DIR` | `${HOST_DATA}/etc` | 宿主机配置目录。 |
| `GITBACKUP_CHECK_INTERVAL` | `30000` ms | 状态检测间隔。 |
| `GITBACKUP_PULL_IMAGE` | `false` | 启动前主动拉镜像。 |
| `DOCKER_NETWORK` | `bridge` | gitbackup 容器使用的网络。 |

### LDAP/身份集成
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OVERLEAF_LDAP_URL` | 空 | LDAP 服务地址。 |
| `OVERLEAF_LDAP_SEARCH_BASE` | 空 | 搜索基准 DN。 |
| `OVERLEAF_LDAP_SEARCH_FILTER` | 空 | 用户过滤器，支持 `{{username}}`。 |
| `OVERLEAF_LDAP_BIND_DN` / `_CREDENTIALS` | 空 | 绑定账户与密码。 |
| `OVERLEAF_LDAP_EMAIL_ATT` | `mail` | 邮箱属性名。 |
| `OVERLEAF_LDAP_NAME_ATT` | `cn` | 显示名属性。 |
| `OVERLEAF_LDAP_LAST_NAME_ATT` | `sn` | 姓氏属性。 |
| `OVERLEAF_LDAP_UPDATE_USER_DETAILS_ON_LOGIN` | `true` | 登录时同步属性。 |

### 对象存储与历史
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OVERLEAF_FILESTORE_BACKEND` | `fs` | 文件存储后端：`fs` 或 `s3`。 |
| `OVERLEAF_FILESTORE_TEMPLATE_FILES_BUCKET_NAME` | 空 | 模板文件桶名（S3）。 |
| `OVERLEAF_HISTORY_PROJECT_BLOBS_BUCKET` | 空 | 项目历史桶。 |
| `OVERLEAF_HISTORY_BLOBS_BUCKET` | 空 | 全局历史桶。 |
| `OVERLEAF_FILESTORE_S3_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | 空 | S3 凭据。 |
| `OVERLEAF_FILESTORE_S3_ENDPOINT` | 空 | S3 兼容端点。 |
| `OVERLEAF_FILESTORE_S3_REGION` | `AWS_DEFAULT_REGION` | 区域。 |
| `OVERLEAF_FILESTORE_S3_PATH_STYLE` | `false` | 路径式访问开关。 |
| `V1_HISTORY_URL` | `http://127.0.0.1:3100/api` | 历史服务地址。 |
| `OVERLEAF_HISTORY_V1_HTTP_REQUEST_TIMEOUT` | `300000` ms | 历史请求超时。 |
| `STAGING_PASSWORD` | 空 | 历史服务基本认证密码。 |
| `OVERLEAF_REDIS_LOCK_TTL_SECONDS` | `60` | Redis 分布式锁 TTL。 |

### 其他运营与调试
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OPTIMISE_PDF` | `false` | PDF 优化开关。 |
| `OVERLEAF_LANG_DOMAIN_MAPPING` | 空 | 语言与域名映射 JSON。 |
| `OVERLEAF_ELASTICSEARCH_URL` | 空 | 引用搜索的 ES 地址。 |
| `ALL_TEX_LIVE_DOCKER_IMAGE_NAMES` | `TeXLive Latest` | 编译镜像展示名列表。 |
| `ROBOTS_NOINDEX` | `false` | 搜索引擎索引控制。 |
| `MAX_JSON_REQUEST_SIZE` | `12582912` (约 12MB) | 最大 JSON 请求体。 |

## 配置建议流程
1) **基础信息**：先设置站点地址、名称、管理员邮箱与 Session 密钥。  
2) **存储**：确认 Mongo/Redis 地址；如需 S3，设置 `OVERLEAF_FILESTORE_BACKEND=s3` 及桶/凭据。  
3) **编译与沙箱**：若宿主机允许 Docker，保留沙箱开关并设置 `SANDBOXED_COMPILES_HOST_DIR_*`；若禁用沙箱，将相关开关设为 `false` 并移除 Docker socket 挂载。  
4) **邮件与登录**：填写 SMTP/SES 或 LDAP 变量，按需开启自助注册限流或域名白名单。  
5) **可选能力**：启用 Texlab、LLM、gitbackup 时，确保对应二进制/API/挂载路径可用。  
6) **上线检查**：运行 `docker compose config` 检查语法，启动后访问 `/health_check`、登录页面与编译功能验证。
