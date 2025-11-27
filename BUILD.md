# Git Tags Commit 差異比較 - 打包部署指南

## 概述

本專案使用 Electron Builder 將 Node.js 應用程式打包成跨平台的桌面應用程式。支援 macOS、Windows 和 Linux 三個平台。

**特色**：
- 🎯 **自包含設計**：單一 DMG/EXE/AppImage 檔案，無需外部相依檔案
- 💾 **設定持久化**：使用者設定自動儲存在應用程式內部目錄
- 🔒 **安全隔離**：設定檔存放在系統標準的應用程式資料目錄

## 環境需求

- Node.js 18+
- npm 或 yarn
- 各平台特定要求：
  - **macOS**: 需要 macOS 10.15+ 系統
  - **Windows**: 需要 Windows 7+ 系統
  - **Linux**: 需要支援 AppImage 的 Linux 發行版

## 安裝依賴

```bash
npm install
```

## 打包指令

### 開發模式

```bash
# 啟動開發模式
npm start

# 啟動並開啟開發者工具
npm run dev
```

### 生產環境打包

```bash
# 打包所有平台
npm run build

# 只打包 macOS (生成 .dmg 檔案)
npm run build-mac

# 只打包 Windows (生成 .exe 安裝檔)
npm run build-win

# 只打包 Linux (生成 AppImage)
npm run build-linux
```

## 打包設定詳解

### package.json 設定

```json
{
  "build": {
    "appId": "com.kathylai.git-tags-commit-diff",
    "productName": "Git Tags Commit 差異比較",
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer.js",
      "index.html",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        }
      ]
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": "AppImage"
    }
  }
}
```

### 各平台設定說明

#### macOS 設定
- **target**: `dmg` - 生成 macOS 磁碟映像檔
- **arch**: `["x64", "arm64"]` - 同時支援 Intel 和 Apple Silicon
- **category**: 開發工具類別
- **icon**: `assets/icon.icns` (需要 1024x1024 的 .icns 檔案)

#### Windows 設定
- **target**: `nsis` - 使用 NSIS 安裝程式
- **oneClick**: `false` - 允許自訂安裝目錄
- **icon**: `assets/icon.ico` (需要 256x256 的 .ico 檔案)

#### Linux 設定
- **target**: `AppImage` - 生成可攜式 AppImage 檔案
- **icon**: `assets/icon.png` (需要 512x512 的 .png 檔案)

## 輸出檔案

打包完成後，檔案會放在 `dist/` 目錄：

```
dist/
├── Git Tags Commit 差異比較-1.0.0.dmg           # macOS Intel 版本
├── Git Tags Commit 差異比較-1.0.0-arm64.dmg      # macOS Apple Silicon 版本
├── Git Tags Commit 差異比較 Setup 1.0.0.exe     # Windows 安裝檔
└── Git Tags Commit 差異比較-1.0.0.AppImage       # Linux AppImage
```

## 檔案大小參考

- **macOS DMG**: 約 90-100 MB
- **Windows EXE**: 約 80-90 MB
- **Linux AppImage**: 約 85-95 MB

## 程式碼簽署 (可選)

### macOS 簽署
如需在 macOS 上避免安全警告，需要 Apple Developer 帳號：

```bash
# 需要先設定 Apple Developer 憑證
export CSC_NAME="Developer ID Application: Your Name"
npm run build-mac
```

### Windows 簽署
Windows 需要程式碼簽署憑證：

```bash
# 設定簽署憑證
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate-password"
npm run build-win
```

## 發布流程

1. **更新版本號**
   ```bash
   npm version patch  # 小版本更新
   npm version minor  # 功能更新
   npm version major  # 主版本更新
   ```

2. **執行打包**
   ```bash
   npm run build
   ```

3. **測試打包檔案**
   - 在目標平台安裝並測試功能
   - 確認所有功能正常運作

4. **發布**
   - 上傳到 GitHub Releases
   - 或其他檔案分享平台

## 疑難排解

### 常見問題

#### 打包失敗
- 確保所有依賴已正確安裝：`npm clean-install`
- 清除暫存：`rm -rf dist node_modules && npm install`

#### macOS 無法開啟應用程式
```bash
# 移除隔離屬性
sudo xattr -rd com.apple.quarantine /Applications/應用程式名稱.app
```

#### Windows 防毒軟體誤報
- 使用程式碼簽署憑證可降低誤報率
- 聯繫防毒軟體廠商加入白名單

#### Linux AppImage 無法執行
```bash
# 給予執行權限
chmod +x Git\ Tags\ Commit\ 差異比較-1.0.0.AppImage

# 安裝必要函式庫 (Ubuntu/Debian)
sudo apt install libfuse2
```

#### 設定檔相關問題

**設定檔位置確認**
```bash
# macOS
ls ~/Library/Application\ Support/Git\ Tags\ Commit\ 差異比較/

# Windows (PowerShell)
ls $env:APPDATA\Git\ Tags\ Commit\ 差異比較\

# Linux
ls ~/.config/Git\ Tags\ Commit\ 差異比較/
```

**手動重置設定**
如果應用程式行為異常，可以手動刪除設定檔：
```bash
# macOS
rm ~/Library/Application\ Support/Git\ Tags\ Commit\ 差異比較/config.json

# Windows (PowerShell)
Remove-Item "$env:APPDATA\Git Tags Commit 差異比較\config.json"

# Linux
rm ~/.config/Git\ Tags\ Commit\ 差異比較/config.json
```

**設定檔備份與還原**
```bash
# 備份設定檔 (macOS)
cp ~/Library/Application\ Support/Git\ Tags\ Commit\ 差異比較/config.json ~/Desktop/git-tags-config-backup.json

# 還原設定檔 (macOS)
cp ~/Desktop/git-tags-config-backup.json ~/Library/Application\ Support/Git\ Tags\ Commit\ 差異比較/config.json
```

## 自動化打包 (CI/CD)

### GitHub Actions 範例

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'

    - run: npm ci
    - run: npm run build

    - uses: actions/upload-artifact@v3
      with:
        name: ${{ matrix.os }}-build
        path: dist/
```

## 應用程式架構

### 設定檔管理

本應用程式採用自包含設計，所有使用者設定會自動儲存在系統標準目錄中：

#### 設定檔位置

- **macOS**: `~/Library/Application Support/Git Tags Commit 差異比較/config.json`
- **Windows**: `%APPDATA%/Git Tags Commit 差異比較/config.json`
- **Linux**: `~/.config/Git Tags Commit 差異比較/config.json`

#### 設定內容

```json
{
  "projectPath": "/path/to/git/project",
  "tagsPerGroup": 8,
  "commitsPerTag": 0,
  "commitLimit": 50,
  "tagGroups": [
    "prd-v",
    "uat-v",
    "v1.0.",
    "preview-v",
    "lab-athena",
    "lab-eevee",
    "lab-flareon"
  ]
}
```

#### 設定特性

- **自動儲存**：每次成功產生檔案時自動儲存設定
- **自動載入**：應用程式啟動時自動載入上次的設定
- **容錯機制**：如設定檔損壞或不存在，使用預設值
- **隔離性**：不同使用者帳號的設定互相獨立

### 應用程式行為

1. **首次啟動**：使用預設設定值，專案路徑為空
2. **後續啟動**：自動載入上次儲存的設定
3. **設定變更**：點擊產生按鈕時自動儲存當前設定
4. **移除應用程式**：設定檔會隨應用程式一起移除

## 效能最佳化

### 減少打包大小
- 使用 `files` 陣列精確指定需要的檔案
- 排除不必要的依賴套件
- 使用 `extraResources` 處理大型檔案

### 提升啟動速度
- 最小化主程序代碼
- 使用 `nodeIntegration: false` 提升安全性
- 預載必要模組

### 設定檔最佳化
- 使用 JSON 格式提升讀寫效能
- 僅在必要時才讀寫設定檔
- 設定檔大小控制在 1KB 以內

## 使用者體驗

### 設定持久化
- 使用者無需每次重新設定專案路徑和標籤分組
- 自動記住上次使用的 Commit 上限設定
- 提供一鍵重置為預設值的功能（如需要）

### 跨平台一致性
- 在不同作業系統上保持相同的使用體驗
- 設定檔格式完全相同，方便跨平台遷移
- 遵循各平台的檔案系統標準

---

## 聯絡資訊

如有打包相關問題，請聯繫專案維護者或建立 Issue。