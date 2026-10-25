# 安卓 APK（Capacitor 套壳）

项目提供 `apps/mobile`：用 [Capacitor](https://capacitorjs.com/) 把已部署的医档通站点包成
安卓 App，APK 由 **GitHub Actions** 构建，产物在 Actions 运行的 Artifacts 里下载。

> 这是一层 WebView 壳：页面、接口、权限仍来自线上站点。原生能力（后台任务、推送、
> 原生相机）不在壳里实现；日常更新站点即可，只有改壳/插件/图标时才需要重打 APK。

## 1. 构建（推荐：GitHub Actions）

工作流：`.github/workflows/android-apk.yml`

两种触发方式：

1. **手动**：仓库 → Actions → `android-apk` → Run workflow，填 `server_url`
   （你的 HTTPS 站点地址，如 `https://medihub.example.com`）。
2. **打 tag 自动构建**：先设置仓库变量 `CAPACITOR_SERVER_URL`（Settings → Secrets and
   variables → Actions → Variables），之后推送 `v*` tag 就会自动构建。

构建完成后：Actions 运行页 → 底部 **Artifacts** → 下载 `medihub-debug-apk`，
解压得到 `app-debug.apk`。

```bash
# 本机也可以直接触发（需要 gh CLI 并登录）
gh workflow run android-apk.yml -f server_url=https://medihub.example.com
gh run watch
```

## 2. 本地构建（不想用 CI 时）

前置：JDK 21、Android SDK（platform 35 / build-tools 35）、Node 24、pnpm 12。

```bash
pnpm install
pnpm --filter @medihub/web run build

cd apps/mobile
CAPACITOR_SERVER_URL=https://medihub.example.com pnpm run sync:android
cd android
chmod +x gradlew
./gradlew assembleDebug
```

产物：`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`。

## 3. 安装与更新

- 把 `app-debug.apk` 发到安卓手机，允许「安装未知来源应用」后安装；
- debug 包由 CI 的临时 debug keystore 签名，**可以直接安装，但不能上架应用商店**；
- 站点更新不需要重装 App（壳加载的是线上地址）；换域名/改图标/加插件才需要重新构建；
- 首次打开若白屏，检查手机能否访问该地址、证书是否有效（不要用自签 HTTPS）。

## 4. 远程加载 vs 打包本地资源

`apps/mobile/scripts/write-config.mjs` 根据 `CAPACITOR_SERVER_URL` 生成配置：

| 模式             | 条件                          | 行为                                                                       |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------- |
| 远程加载（推荐） | 设置了 `CAPACITOR_SERVER_URL` | WebView 直接打开线上站点；相机、上传、预览与浏览器一致                     |
| 本地资源         | 未设置                        | 打包 `apps/web/dist`；**接口是相对路径，登录与数据不可用**，只适合 UI 预览 |

注意：

- 远程模式必须 **HTTPS**；HTTP 会被 WebView 拦截混合内容且无法注册 Service Worker；
- 登录 Cookie 属于该域名，换域名需要重新登录；
- 没有实现「离线写入」：断网时只能看到站点自带的离线提示页。

## 5. 签名与上架（未包含）

工作流只产出 debug APK。要发布到应用商店需要：

1. 生成 release keystore（`keytool -genkeypair ...`），不要提交到仓库；
2. 在 `apps/mobile/android/app/build.gradle` 增加 `signingConfigs.release`；
3. 把 keystore 与密码放进 GitHub Secrets，在 workflow 里解码并传给 Gradle；
4. 构建 `bundleRelease` 得到 AAB，再按商店要求填写隐私政策、医疗类应用资质等。

## 6. 常见问题

| 现象                   | 原因与处理                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- |
| Actions 报缺少站点地址 | 手动运行填 `server_url`，或配置仓库变量 `CAPACITOR_SERVER_URL`               |
| 白屏 / 一直加载        | 地址不可达、证书无效、或站点做了 UA/来源限制；先用手机浏览器打开同一地址     |
| 相机按钮没反应         | 远程模式需 HTTPS；部分 ROM 需在系统设置里给浏览器/WebView 相机权限           |
| 上传大文件失败         | 与浏览器相同：受 Nginx `client_max_body_size` 与科室/全站配额限制            |
| 安装被拒               | 允许未知来源；已安装同名不同签名版本时先卸载                                 |
| 想换 App 名称/图标     | 改 `apps/mobile/capacitor.config.json`（appName）与 `res/mipmap-*`，重新构建 |

## 7. 与 PWA 的关系

- **PWA**（`docs/MOBILE-PWA.md`）：浏览器安装，无安装包，随站点即时更新；
- **APK**（本文）：有安装包、可分发/上架，但仍加载线上站点；
- 两者可以并存：先给同事发 PWA 链接，需要独立分发时再发 APK。
