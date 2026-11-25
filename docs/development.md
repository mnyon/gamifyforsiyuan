# 开发与发布

## 目录约定

| 目录                 | 内容                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `src/`               | 正式插件源码；按功能划分 Domain、Application、Adapters、Presentation |
| `tests/`             | 自动化测试、测试替身与虚构数据                                       |
| `tools/`             | 构建、只读本地服务、浏览器检查及宣传图生成                           |
| `dev/`               | 按 Feature 组织的开发模块、模拟插件、历史实验和 HTML 模板；不进入正式插件依赖图 |
| `third_party/`       | 固定版本的第三方源码及许可证；不参与自有 TypeScript 迁移             |
| `docs/`              | 架构与开发流程说明                                                   |
| `assets/`、`images/` | 插件使用的美术资源和说明截图                                         |
| `dist/`              | 自动生成的安装包、调试模块和离线预览；不提交到仓库                   |

根目录保留 npm / TypeScript / 格式配置、思源插件清单、README、许可证，以及市场需要的图标和预览图。三个 tsconfig 分别检查正式源码、开发工具和测试，全部使用 strict。

`src` 中不放测试或开发服务器。新增测试放 `tests`，维护命令放 `tools`。生成的 JavaScript 和独立 HTML 只写入 `dist`。领域与应用层的依赖边界见 [架构说明](architecture.md)。

## 本地验证

需要 Node.js 22.15+；首次执行 `npm ci`，日常命令都从项目根目录执行：

```sh
npm run check
npm run build
npm run build:test
npm run preview:build
```

正式安装包为 `dist/package.zip`，测试包为 `dist/package-test.zip`。构建会先清理对应生成目录，避免旧文件混入。离线实验页面在 `dist/previews/`。

安装 Chrome 后可执行 `npm run verify:adventure`、`npm run verify:activity` 和 `npm run verify:previews`。这些检查使用虚构数据；运行前先生成上面的安装包和预览。

## 发布

1. 确认 `package.json`、`package-lock.json` 和 `plugin.json` 的版本一致；根据实际发布决定新版本号。
2. 运行完整检查及构建，并完成上述浏览器验证；在思源中安装正式包，检查奖励入账、连接设置与角色面板。
3. 检查待提交文件，提交源码、锁文件及文档，不提交 `dist`、`node_modules` 或 `.local`。
4. 推送与版本一致的 `v版本号` 标签。Release 工作流会安装锁定依赖、执行完整检查、构建正式包，并创建附带安装包的草稿 Release。
5. 核对草稿内容和安装包后再发布。

普通提交和 PR 也会执行完整检查并生成正式、测试两个安装包。本地打包不会创建标签或发布 Release。
