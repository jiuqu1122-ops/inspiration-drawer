# Gitee 发行版上传

`GITEE_RELEASE_TAG` 只指定上传目标，不会构建、下载或切换安装包。
默认输入目录是 `dist-updater`；GitHub Actions 打包不会更新本机这个目录。
上传前必须确认标签、`latest.json.version`、安装包、签名、SHA256 和大小一致。

## 使用已下载并校验的正式包

在 PowerShell 设置目标仓库、版本和文件目录。访问令牌只在本机私下设置，不能提交到代码或截图中。

```powershell
$env:GITEE_OWNER = "zibinyou"
$env:GITEE_REPO = "inspiration-drawer"
$env:GITEE_RELEASE_TAG = "v8.0.28"
$env:GITEE_DIST_DIR = "$env:USERPROFILE\Desktop\灵感抽屉8.0.28_Gitee手动上传"
npm run updater:sync:gitee -- --dry-run
```

预检不需要令牌，不访问网络，也不改写输入文件。看到 `Verified asset version: 8.0.28` 后，确认目录和三个文件名，再在已配置有效令牌的终端执行：

```powershell
npm run updater:sync:gitee
```

脚本先上传安装包和签名，再替换 `latest.json`，最后同步发行版标题和说明。
只替换当前发行版中的同名附件，不修改旧版本发行版、分支或已有标签指向。
如果曾把 8.0.27 附件误传到 v8.0.28，修正后仍需在网页编辑 v8.0.28，移除其中两个 8.0.27 安装包/签名附件；不要删除正常的 v8.0.27 发行版。

## 补传固定更新入口与 Rhino 独立组件

在已经设置好有效 `GITEE_TOKEN`、`GITEE_OWNER` 和 `GITEE_REPO` 的同一个终端执行：

```powershell
npm run updater:sync:gitee -- --remaining
```

此模式以 `dist-updater` 为根目录（或 `GITEE_DIST_DIR`），不使用旧的版本标签、下载基址或标题覆盖设置。它校验桌面索引与本地安装包、Rhino 目录签名和组件哈希，确认版本发行页已有安装包和签名，然后先上传 `rhino-updates` 的组件与索引，最后上传 `latest` 的桌面固定索引；不重传桌面安装包，不改写签名索引或发行页说明。内容一致的已发布组件会校验后跳过；同名但内容不同的组件要求发布新的 revision。

仅预检可追加 `--dry-run`，不需要令牌、不访问网络，也不改写文件：

```powershell
npm run updater:sync:gitee -- --remaining --dry-run
```

## 常见错误

- `Release tag ... does not match latest.json version ...`：输入目录还是旧版本，不能只修改标签或重命名文件来修复。
- `Release download URL tag ... does not match ...`：清除或修正旧的 `GITEE_RELEASE_BASE_URL` / `UPDATE_GITEE_BASE_URL`。
- `SHA256 / size / signature ... does not match`：混用了不同构建的文件。重新取回同一正式发布的三个原始附件，不要手动改版本号、散列或签名。
- 既有发行版的正文不对：上传成功后会同步 `latest.json.notes`；如果设置过 `GITEE_RELEASE_BODY`，请先清除这个覆盖值。
- 截图中暴露了令牌：先在 Gitee 撤销该令牌，重新配置；不要把新令牌发到聊天中。
