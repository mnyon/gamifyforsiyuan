# 架构与维护

## 当前状态

自有运行时、测试、构建和开发工具已统一为 TypeScript，启用 strict，关闭 allowJs。领域和应用层按功能划分，浏览器与思源、Habitica 的实现位于适配器或展示层。安装包和独立 HTML 中的 JavaScript 由构建生成。

```text
src/
  features/progress/
    domain/           # TodoProgress、ActivityProgress、奖励收据与 v1 类型
    application/      # 奖励结算、人工核对、仓储契约与有序写入
    adapters/         # Habitica 奖励网关、思源进度仓储、格式校验
    presentation/     # EditTracker：可信输入、中文输入法、编辑差分
  features/companion/
    domain/           # 购买与施法资格、角色与目录类型
    application/      # 操作用例、人工核对、展示投影与接口
    adapters/         # Habitica 网关、本机操作记录
    presentation/     # AdventureView：商店、背包、技能与宝箱交互
  features/connection/
    domain/           # 凭据类型与格式规则
    application/      # 本机与共享连接的恢复、保存、同步选择
    adapters/         # 本机偏好、思源连接文件、格式校验
  adapters/
    habitica/         # HTTP 客户端、缓存、限流、所用响应字段校验
    siyuan/           # JSON 文件传输、TODO/更新时间查询、外部时间统计读取
  presentation/       # GamifyView、DOM 元素访问、动画状态、图标
  plugin/
    main.ts           # 思源组合根、生命周期、主写窗口、操作互斥
    siyuan.d.ts       # 仅声明实际使用的宿主接口
    styles.ts         # 样式资源入口
dev/                  # 按 Feature 组织的模拟插件、Note World、历史预览与模板
tools/                # 构建、开发服务、浏览器验证、示意图生成
tests/                # 单元、集成、架构测试与虚构数据
dist/                 # 生成的安装包、离线预览与调试文件（不提交）
```

## 依赖规则

- Domain 依赖领域自身；不访问网络、DOM、存储和宿主 SDK。
- Application 依赖自身 ports 和 Domain；通过参数接收仓储、时钟、远端接口及通知。
- Adapters 实现应用契约；Application 不导入 Adapters。
- Presentation 负责 DOM、三维场景和界面生命周期，调用领域规则与展示投影。
- plugin/main.ts 是组合根，负责结算、购买、核对、刷新之间的互斥和宿主事件；独立用例不应被任意并发调用。
- 只在需要身份和生命周期时使用实体；不为纯函数额外引入基类、事件总线或仓储。

tests/architecture.test.ts 检查实际构建依赖图与源码导入，包括类型导入。正式插件不能导入 dev、tools 或 tests；领域与应用层不能通过适配器绕过分层。

## 数据与行为边界

progress.json 保持 version 1、原有字段与奖励规则。奖励收据允许历史记录省略 activity、kind 和可选收据字段；未知扩展字段原样保留。读写边界拒绝损坏或未知版本，只有思源明确返回文件不存在（202）才初始化，不自动清空旧进度。

发奖前先保存 sending 状态与计数收据；保存失败不得加分。结果不确定时保留暂停；成功后的保存或视觉反馈失败不能把奖励改回 queued。核对使用累计历史证据；缺少证据不表示未到账，重试保留人工确认和等待时间。

奖励与连接的核对历史写入 `data/storage/petal/gamify-for-siyuan/reward-audit.json`（最近 200 条，不含 User ID、Token 或笔记正文）。后台补齐队列按 1/2/5/10 分钟退避重连；凭据被拒绝后停止自动重连，等待用户重新连接。

ProgressWriter 在调用时复制状态，按顺序保存。保存失败或其他设备进度变更会停止排队写入；已发出的请求无法撤回。这不是跨设备事务或并发合并机制。

购买与施法在提交前读取新账户快照，重新检查余额、等级、生命、法力、持有状态及目录资格。操作标记沿用 `工作空间:action:账号` 与 `{kind,key,at}`；任何无法解析的非空标记仍暂停，不自动清除或重发。成功但清除标记失败仍保持暂停。人工解除暂停只读账户并清除标记，不重复执行。

连接同步由用户主动选择。关闭同步先写原有禁用标记，再保存本机偏好；共享保存失败不更新本机。共享文件和本机存储不是原子事务。

思源查询与 Habitica 响应在进入业务状态前校验实际使用字段。TypeScript 不代替运行时校验，不宣称所有扩展字段都有完整 schema。

## 构建与验证

开发需要 Node.js 22.15+，使用 npm ci 安装锁定依赖。

```sh
npm run check              # strict 运行时 + 工具 + 测试、全部测试与格式检查
npm run build              # dist/package.zip
npm run build:test         # dist/package-test.zip
npm run preview:build      # 重建光标和历史地形的独立 HTML
npm run verify:activity    # 桌面/手机输入、IME、光标、金币与清理
npm run verify:adventure   # 桌面/手机技能、背包、商店、宝箱
npm run verify:previews    # 两个独立 HTML 的离线交互
```

check 分别使用 tsconfig.json、tsconfig.tools.json、tsconfig.tests.json，全部继承 strict。测试中的损坏 JSON 通过 unknown 或显式 invalidFixture 输入，不用 any、ts-ignore 或 ts-nocheck 隐藏错误；局部宿主替身只实现该场景实际使用的接口。

构建通过 esbuild 的显式模块图打包，仅 siyuan 由宿主提供，CSS 作为文本资源。正式入口为 src/plugin/main.ts；模拟入口为 dev/plugin-simulation/TestPlugin.ts，继承宿主装配并提供 TestGamifyView 和模拟动作。构建保持思源要求的 CommonJS 类导出。

浏览器验证依赖 Chrome 和 Playwright，可用 GAMIFY_RENDER_NODE_MODULES 指向已有依赖目录；playwright-core 提供浏览器自动化接口与类型。验证使用虚构账户，不请求真实 Habitica 账户接口。

光标实验的 HTML 模板和 TypeScript 位于 dev/caret-playground/，早期 Canvas 地图位于 dev/note-world/legacy/canvas/。执行 preview:build 后可直接打开 dist/previews/ 中的离线预览。当前 Note World 地图和素材画廊的入口位于 dev/note-world/presentation/。不要手改生成文件。

## 验证范围

浏览器检查使用虚构数据，不执行真实购买、施法或奖励请求。发布前仍需在思源中安装试用；浏览器中的手机布局检查不能代替 Android / iOS 实际输入法验证。
