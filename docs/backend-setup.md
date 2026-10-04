# 启用网站编辑后自动提交 GitHub

代码已支持共享数据同步，但初次使用需要部署 API 并配置凭证。GitHub Pages 只能提供静态页面，无法安全保管写入 GitHub 所需的令牌；本项目使用一个独立的 Cloudflare Worker 执行写入。

## 结构

- GitHub Pages：提供前端页面。
- Cloudflare Worker：验证编辑密钥、读取最新版本、提交修改。
- `papers.json`：所有文章的正式数据源。
- `config.js`：只配置 API 网址，不存放任何密钥。

添加、修改、删除和导入成功时会创建一个 Git commit。查询和筛选不产生提交。GitHub Pages 重新部署后静态数据会更新；已配置 API 的网页点击“刷新文献”可直接读取 GitHub 最新内容，不必等待 Pages 发布。

## 1. 准备账户和 GitHub 令牌

需要一个 Cloudflare 账户和 Node.js 22 或更新版本。

在 GitHub 的个人设置中打开 **Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**：

1. Resource owner 选择你的账户。
2. Repository access 选择 **Only select repositories**，仅选择 `ReadPaper`。
3. Repository permissions 中，将 **Contents** 设为 **Read and write**。
4. 选择适当的有效期，并记得在过期前更新后端中的令牌。

令牌只保存在 Cloudflare 的 Secret 中。不要发送到聊天、提交到仓库或填入 `config.js`。你在 ChatGPT 中连接的 GitHub 插件，不会自动授权部署后的 Worker 使用该连接。

## 2. 部署后端

在终端运行：

```bash
git clone https://github.com/SabeR0222/ReadPaper.git
cd ReadPaper
npx wrangler@4 login
npx wrangler@4 deploy
```

浏览器会引导你登录 Cloudflare。第一次部署后的 API 会拒绝访问，直到下面的三个 Secret 配置完毕。

逐个运行命令，按照终端提示输入对应值：

```bash
npx wrangler@4 secret put GITHUB_TOKEN
npx wrangler@4 secret put EDIT_KEY
npx wrangler@4 secret put SESSION_SECRET
```

| Secret | 输入内容 |
| --- | --- |
| `GITHUB_TOKEN` | 第一步创建的 GitHub 令牌 |
| `EDIT_KEY` | 你指定的文章编辑密钥 |
| `SESSION_SECRET` | 至少 32 字符的随机值，用于签署短期会话 |

可以在本机运行以下命令生成随机值，再粘贴到 `SESSION_SECRET` 的输入提示中：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

最后运行：

```bash
npx wrangler@4 deploy
```

记下终端给出的实际 Worker URL，例如 `https://readpaper-api.<你的子域>.workers.dev`。示例里的子域不能原样使用。

`wrangler.jsonc` 已指定 `SabeR0222/ReadPaper`、`main` 分支及 GitHub Pages 的来源 `https://saber0222.github.io`。若更换域名，请同步修改 `ALLOWED_ORIGINS`；多个精确来源以逗号分隔，不包含路径或末尾斜线。

## 3. 连接网站

在 GitHub 仓库中编辑 `config.js`，将空的 `apiBase` 换成刚才取得的真实 API URL：

```js
window.READPAPER_CONFIG = {
  apiBase: 'https://readpaper-api.<你的子域>.workers.dev'
};
```

提交后，等待 GitHub Pages 更新，再刷新网站。状态应从“只读 · 后端未配置”变成“已同步 GitHub”。

此修改不会自动更新另一个 `chatgpt.site` 站点；两个托管地址的前端版本需要分别部署。

## 4. 确认同步正常

1. 输入编辑密钥，添加一篇自己的真实阅读记录。
2. 网站显示“已提交”以及提交编号后，检查仓库的 `papers.json` 和提交历史。
3. 在另一台设备打开网站，点击“刷新文献”，确认读到同一条记录。

保存未成功时不会更新页面中的文章，也不会退回本地保存。网络中断时，GitHub 可能已接收提交但响应未返回，请先查看提交历史或刷新确认，再决定是否重试。

## 旧记录迁移

正式数据源已从 `data.js` 转为 `papers.json`。旧版浏览器中的 localStorage 不会覆盖共享数据。

如果页面显示“导出旧浏览器记录”，可以点击下载旧数据，核对后使用“导入 JSON”提交到共享库。同 ID 的文章会被导入记录覆盖，因此请先检查文件内容。

## 权限、并发和数据范围

- 编辑密钥在后端验证。浏览器只持有最长 15 分钟的会话令牌，不持有 GitHub 凭证；每次打开新编辑操作仍需输入密钥。
- 限流器限制密钥验证频率。Cloudflare 的计数按服务位置维护，并非严格的全球次数上限。
- 写入前检查文献文件 SHA。发生并发冲突时拒绝保存，防止覆盖别人刚提交的内容；复制当前草稿、刷新并重新打开文章核对后再保存。
- API 的写入范围固定为指定仓库、分支上的 `papers.json`；客户端不能指定其他文件。
- 原始文章数量上限为 1000，文献文件上限为 900 KB（保持在 GitHub Contents API 的常规读取范围内），导入请求上限为 2 MB。
- 本配置的 `READ_PUBLIC=true` 允许公开读取文献。编辑密钥只保护写入，不保护阅读。如果需要私密阅读，不要把私有资料接到这个公开读取的默认配置；应另行配置完整的访问控制。
- 仓库分支保护规则可能拒绝直接写入。请不要为排错随意扩大令牌权限；先核查目标分支及规则。

## 本地测试

```bash
npm test
```

测试使用模拟 GitHub 响应，不会修改真实仓库或需要真实令牌。

官方参考：[GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)、[Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。
