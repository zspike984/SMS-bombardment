# SMS 短信压力测试系统

一个基于 Cloudflare Pages 的短信测压工具，仅用于学习交流目的。

## ⚠️ 免责声明

本程序仅用于短信测压和学习交流，请勿用于非法用途。使用本程序造成的一切后果由使用
者自行承担。

---

## 📣 快速部署（新开发者必读）

### 前置条件

- 一个 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费）
- 一个 [GitHub 账号](https://github.com/)（免费）

### 第一步：Fork 仓库

1. 点击本仓库右上角的 **Fork** 按钮
2. 将仓库 Fork 到你自己的 GitHub 账号下

### 第二步：创建 Cloudflare Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单选择 **Workers 和 Pages**
3. 点击 **创建** → **Pages** → **连接到 Git**
4. 授权 GitHub 并选择你 Fork 的仓库
5. 配置构建设置：

   | 设置项       | 值                             |
   | ------------ | ------------------------------ |
   | 项目名称     | `sms-bombing-tool`（可自定义） |
   | 生产分支     | `main`                         |
   | 构建命令     | 留空                           |
   | 构建输出目录 | `.`                            |

6. 点击 **保存并部署**

### 第三步：等待部署完成

- 首次部署约需 1-2 分钟
- 部署成功后会获得一个域名：`https://你的项目名.pages.dev`

### ✅ 完成！

无需额外配置 proxy 或 Workers，**Cloudflare Pages 会自动处理 `functions/` 目录下
的代理函数**。

### 第四步：部署后自检（必做）

```bash
./selfcheck.sh https://你的项目名.pages.dev
```

| 检查项 | 正常结果 | 异常含义 |
| --- | --- | --- |
| `GET /proxy` | `{"ok":true,"service":"cors-proxy"}` | 返回 HTML 说明 `functions/` 没被编译部署 |
| `POST /proxy?url=...` | `200` 且 body 被透传 | `405` 说明请求被静态资源层截走 |
| `GET /proxy?url=https://example.com` | `200` + example.com 页面 | 返回本页 HTML 说明代理未生效 |

> ⚠️ 代理入口是 `/proxy?url=<encodeURIComponent(目标)>`。不要把入口写成站点根 `/`：
> Cloudflare Pages 的静态资源层会接管 `POST /` 并返回 `405`，`GET /` 则返回首页
> HTML，前端会显示成「代理异常」。

---

## 📦 项目结构

```
├── index.html          # 主页面（前端代码）
├── functions/
│   └── [[path]].js     # CORS 代理函数（入口 /proxy?url=...）
├── _headers            # CDN 缓存策略配置
├── wrangler.json       # Wrangler 配置文件
├── logo.ico            # 网站图标
├── logo.gif            # 页面 Logo
└── README.md           # 项目说明
```

---

## 🛠️ 开发与维护

### 本地开发

```bash
# 1. 克隆 Fork 仓库
git clone https://github.com/Huo-zai-feng-lang-li/SMS-bombardment.git
cd SMS-bombardment

# 2. 安装 Wrangler CLI
npm install -g wrangler

# 3. 登录 Cloudflare
wrangler login

# 4. 本地预览（会启动本地服务器）
wrangler pages dev .
```

### 提交代码

```bash
# 1. 修改代码后，添加文件
git add .

# 2. 提交（写清楚修改内容）
git commit -m "feat: 你的修改描述"

# 3. 推送到 main 分支（自动触发部署）
git push origin main
```

> ⚠️ **重要**：Cloudflare Pages 只监听 `main` 分支，推送到其他分支不会触发部署。

### 手动部署

如果自动部署未生效，可手动部署：

```bash
npx wrangler pages deploy . --project-name 你的项目名 --branch main
```

### 清除 CDN 缓存

如果部署后页面未更新：

1. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择你的域名 → **Caching** → **Configuration**
3. 点击 **Purge Everything**

---

## 🔧 常见问题

### Q: 页面一直显示「状态码405」和「代理异常」怎么办？

这两个现象都是**请求没有进入代理函数**：

- `405` = `POST` 打到了静态资源（Pages 静态层只接受 GET/HEAD）
- `代理异常` = `GET` 拿回的是本站首页 HTML（含 `Safety box` / `服务器内部接口` 字样被判定为异常）

先跑 `./selfcheck.sh 你的域名` 确认函数是否生效，再检查：

1. `functions/[[path]].js` 是否在仓库根目录（不是 `src/functions/`）
2. Pages 构建输出目录是否为 `.`
3. Pages 项目的生产分支是否为 `main`（与 `.github/workflows/deploy.yml` 一致）

### Q: 需要单独创建 Workers 或 proxy 吗？

**不需要。** Cloudflare Pages 会自动将 `functions/` 目录下的文件部署为
Functions（类似于 Workers）。

### Q: 免费额度是多少？

- **Cloudflare Pages**：无限请求
- **Cloudflare Functions**：每天 10 万次免费请求

### Q: 超过额度会怎样？

超过 10 万次后，代理请求会失败，页面会显示"连续失败 XX 次，已自动停止"。等待次日
额度重置即可。

### Q: 如何使用自定义域名？

1. Cloudflare Dashboard → Pages → 你的项目 → 自定义域
2. 添加你的域名并配置 DNS

---

## 🤖 功能特性

- ✅ 支持多个短信接口同时发送
- ✅ 实时日志显示发送状态
- ✅ 连续失败自动停止（保护代理额度）
- ✅ 按钮状态颜色区分（绿色开始/红色停止）
- ✅ 失败原因准确显示
- ✅ 现代化 UI 界面
- ✅ CORS 代理支持
- ✅ 响应式设计

---

## 📝 使用说明

1. 打开部署后的网站
2. 输入目标手机号（11 位中国手机号）
3. 点击"🚀 开始发送"按钮
4. 查看实时日志输出
5. 点击"⏹️ 停止发送"可随时停止

---

## 🌐 演示地址

- **生产环境**：`https://sms-bombing-tool.pages.dev`

---

## 📄 许可证

本项目仅供学习研究使用，请勿用于商业用途或非法活动。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。

## 作者其他项目

- [Online-Mirror-master](https://github.com/Huo-zai-feng-lang-li/Online-Mirror-master) -
  **远程拍照源码，一键式部署 Cloudflare 服务实现全免费远程拍照**
