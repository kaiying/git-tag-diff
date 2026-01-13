const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const simpleGit = require('simple-git');

class GitTagsViewerApp {
    constructor() {
        this.mainWindow = null;
        this.viewerWindow = null;
        this.configPath = null; // 將在 app ready 後設定
        this.defaultConfig = {
            projectPath: '',
            tagsPerGroup: 8,
            commitsPerTag: 0,
            commitLimit: 50,
            tagGroups: ['prd-v', 'uat-v', 'v1.0.', 'preview-v', 'lab-athena', 'lab-eevee', 'lab-flareon']
        };
    }

    async createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: 800,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
            title: 'Git Tags Commit 差異比較'
        });

        await this.mainWindow.loadFile('index.html');

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    async createViewerWindow(htmlContent) {
        if (this.viewerWindow) {
            this.viewerWindow.close();
        }

        this.viewerWindow = new BrowserWindow({
            width: 1600,
            height: 1000,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            },
            title: '🏷️ Git Tags Commit 差異比較',
            show: false,
            parent: this.mainWindow
        });

        await this.viewerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

        this.viewerWindow.once('ready-to-show', () => {
            this.viewerWindow.show();
        });

        this.viewerWindow.on('closed', () => {
            this.viewerWindow = null;
        });
    }

    async loadConfig() {
        if (!this.configPath) {
            // 設定檔放在應用程式的 userData 目錄
            this.configPath = path.join(app.getPath('userData'), 'config.json');
        }

        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const savedConfig = JSON.parse(configData);
            return { ...this.defaultConfig, ...savedConfig };
        } catch (error) {
            console.log('沒有找到儲存的設定，使用預設設定');
            return this.defaultConfig;
        }
    }

    async saveConfig(config) {
        if (!this.configPath) {
            this.configPath = path.join(app.getPath('userData'), 'config.json');
        }

        try {
            // 確保目錄存在
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
            console.log('設定已儲存到應用程式目錄:', this.configPath);
        } catch (error) {
            console.error('儲存設定失敗:', error);
        }
    }

    async refreshTags(projectPath) {
        try {
            console.log('🔄 開始清理並更新標籤...');
            const git = simpleGit(projectPath);

            // 刪除所有本地標籤：git tag | xargs git tag -d
            const allTags = await git.tags();
            if (allTags.all.length > 0) {
                console.log(`刪除 ${allTags.all.length} 個本地標籤`);
                for (const tag of allTags.all) {
                    try {
                        await git.tag(['-d', tag]);
                    } catch (error) {
                        // 忽略個別標籤刪除失敗
                        console.log(`跳過標籤: ${tag}`);
                    }
                }
            }

            // 重新從遠端拉取標籤：git pull --prune --tags
            console.log('重新拉取遠端標籤...');
            try {
                await git.pull(['--prune', '--tags']);
            } catch (error) {
                // Git pull 成功時可能也會有"錯誤"輸出（實際上是資訊訊息）
                console.log('Git pull 完成，檢查是否真的是錯誤...');

                // 如果錯誤訊息包含 "new tag" 或其他成功指標，則視為成功
                if (error.message && (
                    error.message.includes('new tag') ||
                    error.message.includes('Already up to date') ||
                    error.message.includes('From ')
                )) {
                    console.log('實際上是成功的拉取操作');
                } else {
                    // 只有在真正錯誤時才拋出
                    throw error;
                }
            }

            console.log('✅ 標籤更新完成');
        } catch (error) {
            console.error('更新標籤時發生錯誤:', error);
            throw new Error(`標籤更新失敗: ${error.message}`);
        }
    }

    setupIpcHandlers() {
        ipcMain.handle('select-project-path', async () => {
            const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ['openDirectory'],
                title: '選擇 Git 專案目錄'
            });

            if (!result.canceled && result.filePaths.length > 0) {
                return result.filePaths[0];
            }
            return null;
        });

        ipcMain.handle('validate-git-repo', async (event, projectPath) => {
            try {
                const git = simpleGit(projectPath);
                await git.checkIsRepo();
                return { isValid: true };
            } catch (error) {
                return { isValid: false, error: error.message };
            }
        });

        ipcMain.handle('refresh-tags', async (event, projectPath) => {
            try {
                await this.refreshTags(projectPath);
                return { success: true };
            } catch (error) {
                console.error('更新標籤時發生錯誤:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('generate-tags-data', async (event, config) => {
            try {
                const tagsData = await this.generateTagsData(config);
                const htmlContent = this.generateHtmlContent(tagsData);
                await this.createViewerWindow(htmlContent);
                return { success: true };
            } catch (error) {
                console.error('生成標籤數據時發生錯誤:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('refresh-and-generate', async (event, config) => {
            try {
                // 先清理並更新標籤
                await this.refreshTags(config.projectPath);
                const tagsData = await this.generateTagsData(config);
                const htmlContent = this.generateHtmlContent(tagsData);
                await this.createViewerWindow(htmlContent);
                return { success: true };
            } catch (error) {
                console.error('更新並生成時發生錯誤:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-default-config', async () => {
            return await this.loadConfig();
        });

        ipcMain.handle('save-config', async (event, config) => {
            await this.saveConfig(config);
            return { success: true };
        });
    }

    async generateTagsData(config) {
        const git = simpleGit(config.projectPath);
        const tagsData = [];

        // 一次性獲取所有標籤並按創建時間排序（新到舊）
        let allTagsSorted = [];
        try {
            const result = await git.raw([
                'for-each-ref',
                '--sort=-creatordate',
                '--format=%(refname:short)',
                'refs/tags'
            ]);
            allTagsSorted = result.trim().split('\n').filter(tag => tag);
        } catch (error) {
            console.error('獲取標籤時發生錯誤:', error);
            return tagsData;
        }

        const sortedGroups = this.getSortedGroups(config.tagGroups);

        for (const prefix of sortedGroups) {
            const groupTags = allTagsSorted
                .filter(tag => tag.startsWith(prefix))
                .slice(0, config.tagsPerGroup);

            if (groupTags.length === 0) continue;

            const groupData = {
                name: this.getGroupDisplayName(prefix),
                tags: []
            };

            for (let i = 0; i < groupTags.length; i++) {
                const tag = groupTags[i];
                let commits = [];

                try {
                    if (config.commitsPerTag === 0) {
                        const prevTag = i < groupTags.length - 1 ? groupTags[i + 1] : null;
                        if (prevTag) {
                            const logOptions = {
                                from: prevTag,
                                to: tag,
                                maxCount: config.commitLimit
                            };
                            const log = await git.log(logOptions);
                            commits = log.all;
                        } else {
                            const log = await git.log({ to: tag, maxCount: 20 });
                            commits = log.all;
                        }
                    } else {
                        const log = await git.log({ to: tag, maxCount: config.commitsPerTag });
                        commits = log.all;
                    }

                    const formattedCommits = commits.map(commit => ({
                        hash: commit.hash.substring(0, 7),
                        date: new Date(commit.date).toISOString().split('T')[0],
                        message: commit.message.split('\n')[0]
                    }));

                    // 檢查是否達到上限
                    const isAtLimit = (config.commitsPerTag === 0 && formattedCommits.length >= config.commitLimit) ||
                                     (config.commitsPerTag > 0 && formattedCommits.length >= config.commitsPerTag);

                    groupData.tags.push({
                        name: tag,
                        commits: formattedCommits,
                        isAtLimit: isAtLimit,
                        limitNote: isAtLimit ? (config.commitsPerTag === 0 ? `上限顯示${config.commitLimit}筆commits` : `上限顯示${config.commitsPerTag}筆commits`) : ''
                    });
                } catch (error) {
                    console.error(`處理標籤 ${tag} 時發生錯誤:`, error);
                    groupData.tags.push({
                        name: tag,
                        commits: [],
                        isAtLimit: false,
                        limitNote: ''
                    });
                }
            }

            tagsData.push(groupData);
        }

        return tagsData;
    }

    getSortedGroups(tagGroups) {
        const priorities = {
            'prd-v': 1,
            'uat-v': 2,
            'v1.0.': 3,
            'preview-v': 4,
            'lab-athena': 5,
            'lab-eevee': 6,
            'lab-flareon': 7
        };

        return tagGroups.sort((a, b) => {
            const priorityA = priorities[a] || 9;
            const priorityB = priorities[b] || 9;
            return priorityA - priorityB;
        });
    }

    getGroupDisplayName(group) {
        return group === 'v1.0.' ? 'stg' : group;
    }

    escapeJsonString(input) {
        if (!input) return '';
        return input
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\t/g, '\\t')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    generateHtmlContent(tagsData) {
        const jsData = `const tagsData = ${JSON.stringify(tagsData, null, 4)};`;

        return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Tags Commit 差異比較</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 300;
        }

        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }

        .tabs-container {
            background: #f8f9fa;
            border-bottom: 1px solid #e1e5e9;
        }

        .tabs-nav {
            display: flex;
            overflow-x: auto;
            padding: 0 20px;
        }

        .tab-button {
            background: transparent;
            border: none;
            padding: 15px 25px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            color: #666;
            border-bottom: 3px solid transparent;
            transition: all 0.3s ease;
            white-space: nowrap;
        }

        .tab-button:hover {
            color: #667eea;
            background: rgba(102, 126, 234, 0.05);
        }

        .tab-button.active {
            color: #667eea;
            border-bottom-color: #667eea;
            background: white;
        }

        .tab-content {
            display: none;
            padding: 30px;
        }

        .tab-content.active {
            display: block;
        }

        .tag-item {
            margin-bottom: 15px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            background: white;
        }

        .tag-header {
            background: #f8f9fa;
            padding: 15px 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s ease;
            border-bottom: 1px solid #e9ecef;
        }

        .tag-header:hover {
            background: #e9ecef;
        }

        .tag-item.expanded .tag-header {
            background: #e3f2fd;
            color: #1976d2;
        }

        .expand-icon {
            transition: transform 0.2s ease;
        }

        .tag-item.expanded .expand-icon {
            transform: rotate(180deg);
        }

        .commits {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }

        .commit-item {
            display: flex;
            align-items: center;
            padding: 10px 20px;
            border-bottom: 1px solid #f1f3f4;
            transition: background-color 0.2s ease;
        }

        .commit-item:hover {
            background: #f8f9fa;
        }

        .commit-item:last-child {
            border-bottom: none;
        }

        .commit-hash {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            background: #f4f4f4;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            color: #666;
            margin-right: 12px;
            min-width: 70px;
            text-align: center;
        }

        .commit-date {
            color: #888;
            font-size: 11px;
            margin-right: 12px;
            min-width: 75px;
        }

        .commit-message {
            flex: 1;
            font-size: 13px;
            line-height: 1.4;
            color: #333;
        }

        .stats {
            background: #f8f9fa;
            padding: 20px 30px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        }

        .search-container {
            padding: 20px 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .search-input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 14px;
            transition: all 0.3s ease;
        }

        .search-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .search-results {
            font-size: 12px;
            color: #666;
            background: #fff;
            padding: 6px 12px;
            border-radius: 15px;
            border: 1px solid #e9ecef;
            min-width: 80px;
            text-align: center;
        }

        .clear-search {
            background: #6c757d;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.3s ease;
        }

        .clear-search:hover {
            background: #545b62;
        }

        .tag-item.hidden {
            display: none;
        }

        .highlight {
            background: #fff3cd;
            color: #856404;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: bold;
        }

        @media (max-width: 768px) {
            .container {
                margin: 10px;
            }

            .commit-item {
                flex-direction: column;
                align-items: flex-start;
            }

            .commit-hash, .commit-date {
                margin-bottom: 5px;
                margin-right: 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏷️ Git Tags Commit 差異比較</h1>
            <p>Electron 桌面版 • 標籤間 Commit 差異分析</p>
        </div>

        <div class="tabs-container">
            <div class="tabs-nav" id="tabsNav"></div>
        </div>

        <div class="tabs-content-container" id="tabsContentContainer"></div>

        <div class="stats">
            <span id="statsText">準備載入資料...</span>
        </div>
    </div>

    <script>
        ${jsData}

        class GitTagsGroupedViewer {
            constructor() {
                this.tabsNav = document.getElementById('tabsNav');
                this.tabsContentContainer = document.getElementById('tabsContentContainer');
                this.statsElement = document.getElementById('statsText');
                this.currentTab = 0;
                this.init();
            }

            init() {
                console.log('初始化 GitTagsGroupedViewer...');
                this.renderTabs();
                this.updateStats();
            }

            renderTabs() {
                console.log('開始渲染頁籤...');
                console.log('tagsData:', tagsData);

                if (!tagsData || tagsData.length === 0) {
                    this.tabsContentContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #666;">❌ 沒有載入到任何 tags 資料</div>';
                    return;
                }

                this.tabsNav.innerHTML = tagsData.map((group, index) => {
                    const activeClass = index === this.currentTab ? 'active' : '';
                    const tagCount = group.tags.length;
                    return \`
                        <button class="tab-button \${activeClass}" onclick="viewer.switchTab(\${index})">
                            \${group.name} (\${tagCount})
                        </button>
                    \`;
                }).join('');

                this.tabsContentContainer.innerHTML = tagsData.map((group, index) => {
                    const activeClass = index === this.currentTab ? 'active' : '';
                    return \`
                        <div class="tab-content \${activeClass}" id="tab-\${index}">
                            \${this.renderGroupContent(group, index)}
                        </div>
                    \`;
                }).join('');

                this.attachTagEvents();
            }

            renderGroupContent(group, groupIndex) {
                if (!group.tags || group.tags.length === 0) {
                    return '<div style="padding: 40px; text-align: center; color: #666;">這個分組沒有 tags</div>';
                }

                const searchHtml = \`
                    <div class="search-container">
                        <input type="text" class="search-input" placeholder="搜尋標籤名稱或 commit 訊息..."
                               oninput="viewer.searchInGroup(\${groupIndex}, this.value)">
                        <div class="search-results" id="search-results-\${groupIndex}">
                            \${group.tags.length} 個標籤
                        </div>
                        <button class="clear-search" onclick="viewer.clearSearch(\${groupIndex})">清除</button>
                    </div>
                \`;

                const tagsHtml = group.tags.map(tag => \`
                    <div class="tag-item" data-tag-name="\${this.escapeHtml(tag.name)}" data-commits='\${JSON.stringify(tag.commits.map(c => c.message))}'>
                        <div class="tag-header">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <strong style="color: #2c5aa0;" class="tag-name">\${this.escapeHtml(tag.name)}</strong>
                                <span style="font-size: 0.85rem; color: #666; background: #f0f0f0; padding: 2px 8px; border-radius: 12px;">
                                    \${tag.commits.length} commits\${tag.limitNote ? ' (' + tag.limitNote + ')' : ''}
                                </span>
                            </div>
                            <span class="expand-icon" style="color: #666;">▼</span>
                        </div>
                        <div class="commits">
                            \${tag.commits.map(commit => \`
                                <div class="commit-item">
                                    <span class="commit-hash">\${this.escapeHtml(commit.hash)}</span>
                                    <span class="commit-date">\${this.escapeHtml(commit.date)}</span>
                                    <span class="commit-message">\${this.escapeHtml(commit.message)}</span>
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                \`).join('');

                return searchHtml + tagsHtml;
            }

            switchTab(index) {
                document.querySelectorAll('.tab-button').forEach((btn, i) => {
                    btn.classList.toggle('active', i === index);
                });

                document.querySelectorAll('.tab-content').forEach((content, i) => {
                    content.classList.toggle('active', i === index);
                });

                this.currentTab = index;
                this.attachTagEvents();
            }

            attachTagEvents() {
                const activeTabContent = document.querySelector('.tab-content.active');
                if (!activeTabContent) return;

                const headers = activeTabContent.querySelectorAll('.tag-header');

                headers.forEach(header => {
                    const newHeader = header.cloneNode(true);
                    header.parentNode.replaceChild(newHeader, header);

                    newHeader.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const tagItem = newHeader.closest('.tag-item');
                        const commits = tagItem.querySelector('.commits');
                        const isExpanded = tagItem.classList.contains('expanded');

                        if (isExpanded) {
                            tagItem.classList.remove('expanded');
                            commits.style.maxHeight = '0';
                        } else {
                            tagItem.classList.add('expanded');
                            commits.style.maxHeight = commits.scrollHeight + 'px';
                        }
                    });
                });
            }

            escapeHtml(text) {
                if (!text) return '';
                const map = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#039;'
                };
                return text.toString().replace(/[&<>"']/g, m => map[m]);
            }

            updateStats() {
                const totalGroups = tagsData ? tagsData.filter(g => g.tags && g.tags.length > 0).length : 0;
                const totalTags = tagsData ? tagsData.reduce((sum, group) => sum + (group.tags?.length || 0), 0) : 0;
                const totalCommits = tagsData ? tagsData.reduce((sum, group) =>
                    sum + (group.tags?.reduce((tagSum, tag) => tagSum + (tag.commits?.length || 0), 0) || 0), 0
                ) : 0;

                if (this.statsElement) {
                    this.statsElement.textContent = \`共 \${totalGroups} 個分組 • \${totalTags} 個 tags • \${totalCommits} 個 commits • 生成時間：\${new Date().toLocaleString()}\`;
                }
            }

            searchInGroup(groupIndex, searchTerm) {
                const tabContent = document.getElementById(\`tab-\${groupIndex}\`);
                if (!tabContent) return;

                const tagItems = tabContent.querySelectorAll('.tag-item');
                const searchResults = document.getElementById(\`search-results-\${groupIndex}\`);

                if (!searchTerm.trim()) {
                    tagItems.forEach(item => {
                        item.classList.remove('hidden');
                        this.clearHighlights(item);
                    });
                    searchResults.textContent = \`\${tagItems.length} 個標籤\`;
                    return;
                }

                let visibleCount = 0;
                const lowerSearchTerm = searchTerm.toLowerCase();

                tagItems.forEach(item => {
                    const tagName = item.dataset.tagName || '';
                    let commits = [];

                    try {
                        commits = JSON.parse(item.dataset.commits || '[]');
                    } catch (e) {
                        console.warn('Failed to parse commits data for tag:', tagName);
                        commits = [];
                    }

                    const tagMatches = tagName.toLowerCase().includes(lowerSearchTerm);
                    const commitMatches = commits.some(msg =>
                        msg.toLowerCase().includes(lowerSearchTerm)
                    );

                    if (tagMatches || commitMatches) {
                        item.classList.remove('hidden');
                        this.highlightMatches(item, searchTerm, tagMatches, commitMatches);
                        visibleCount++;
                    } else {
                        item.classList.add('hidden');
                        this.clearHighlights(item);
                    }
                });

                searchResults.textContent = \`\${visibleCount} / \${tagItems.length} 個標籤\`;
            }

            clearSearch(groupIndex) {
                const tabContent = document.getElementById(\`tab-\${groupIndex}\`);
                if (!tabContent) return;

                const searchInput = tabContent.querySelector('.search-input');
                const tagItems = tabContent.querySelectorAll('.tag-item');
                const searchResults = document.getElementById(\`search-results-\${groupIndex}\`);

                searchInput.value = '';
                tagItems.forEach(item => {
                    item.classList.remove('hidden');
                    this.clearHighlights(item);
                });
                searchResults.textContent = \`\${tagItems.length} 個標籤\`;
            }

            highlightMatches(item, searchTerm, tagMatches, commitMatches) {
                this.clearHighlights(item);
                const lowerSearchTerm = searchTerm.toLowerCase();

                if (tagMatches) {
                    const tagNameElement = item.querySelector('.tag-name');
                    if (tagNameElement) {
                        const text = tagNameElement.textContent;
                        const highlightedText = this.highlightText(text, searchTerm);
                        tagNameElement.innerHTML = highlightedText;
                    }
                }

                if (commitMatches) {
                    const commitMessages = item.querySelectorAll('.commit-message');
                    commitMessages.forEach(msgElement => {
                        const text = msgElement.textContent;
                        if (text.toLowerCase().includes(lowerSearchTerm)) {
                            const highlightedText = this.highlightText(text, searchTerm);
                            msgElement.innerHTML = highlightedText;
                        }
                    });
                }
            }

            clearHighlights(item) {
                const highlightedElements = item.querySelectorAll('.tag-name, .commit-message');
                highlightedElements.forEach(element => {
                    element.innerHTML = this.escapeHtml(element.textContent);
                });
            }

            highlightText(text, searchTerm) {
                const regex = new RegExp(\`(\${this.escapeRegex(searchTerm)})\`, 'gi');
                return this.escapeHtml(text).replace(regex, '<span class="highlight">$1</span>');
            }

            escapeRegex(string) {
                return string.replace(/[\\^$.*+?()\\[\\]{}|]/g, '\\\\$&');
            }
        }

        let viewer;

        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM 載入完成，開始初始化...');
            viewer = new GitTagsGroupedViewer();
        });
    </script>
</body>
</html>`;
    }
}

let gitTagsApp;

app.whenReady().then(async () => {
    gitTagsApp = new GitTagsViewerApp();
    gitTagsApp.setupIpcHandlers();
    await gitTagsApp.createMainWindow();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await gitTagsApp.createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (gitTagsApp && gitTagsApp.viewerWindow) {
        gitTagsApp.viewerWindow.destroy();
    }
});