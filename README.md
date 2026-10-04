# VLA / WAM 文献库

本目录可以作为 GitHub Pages 的仓库根目录。

## 上传与部署
1. 解压文件包。
2. 将 index.html、style.css、app.js、data.js 和 .nojekyll 上传到仓库根目录（不要只上传 ZIP）。
3. 如确认允许网站公开访问：Settings → Pages → Deploy from a branch → main → /(root) → Save。
4. 等待 GitHub Actions 部署成功，使用 Pages 页面给出的 URL 访问。

GitHub Pages 通常公开访问，即使代码仓库私有。GitHub Free 仅支持公开仓库的 Pages；私有仓库需支持该功能的付费方案。现有私密网站的登录权限不会随这些静态文件迁移。

文章添加、修改、删除和导入需要逐次输入编辑密钥。该保护运行在浏览器端，不能替代服务器端权限验证。记录修改保存在当前浏览器，不会自动写回 GitHub，也不会跨设备同步；更换站点域名之前请先导出 JSON，迁移后再导入。
