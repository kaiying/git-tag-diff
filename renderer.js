class GitTagsViewerUI {
    constructor() {
        this.config = null;
        this.tagGroups = [];
        this.init();
    }

    async init() {
        await this.loadDefaultConfig();
        this.bindEvents();
        this.renderTagGroups();
    }

    async loadDefaultConfig() {
        try {
            this.config = await window.electronAPI.getDefaultConfig();
            this.tagGroups = [...this.config.tagGroups];
            this.updateUI();
        } catch (error) {
            console.error('載入預設配置失敗:', error);
            this.showStatus('載入預設配置失敗', 'error');
        }
    }

    updateUI() {
        if (!this.config) return;

        document.getElementById('projectPath').value = this.config.projectPath;
        document.getElementById('tagsPerGroup').value = this.config.tagsPerGroup;
        document.getElementById('commitsPerTag').value = this.config.commitsPerTag;
        document.getElementById('commitLimit').value = this.config.commitLimit;
    }

    bindEvents() {
        document.getElementById('selectPathBtn').addEventListener('click', () => {
            this.selectProjectPath();
        });

        document.getElementById('addTagGroupBtn').addEventListener('click', () => {
            this.addTagGroup();
        });

        document.getElementById('refreshTagsBtn').addEventListener('click', () => {
            this.refreshTags();
        });

        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateTagsViewer();
        });

        document.getElementById('refreshAndGenerateBtn').addEventListener('click', () => {
            this.refreshAndGenerate();
        });

        document.getElementById('projectPath').addEventListener('change', (e) => {
            this.validateProjectPath(e.target.value);
        });
    }

    async selectProjectPath() {
        try {
            const projectPath = await window.electronAPI.selectProjectPath();
            if (projectPath) {
                document.getElementById('projectPath').value = projectPath;
                await this.validateProjectPath(projectPath);
            }
        } catch (error) {
            console.error('選擇專案路徑失敗:', error);
            this.showStatus('選擇專案路徑失敗', 'error');
        }
    }

    async validateProjectPath(projectPath) {
        if (!projectPath.trim()) {
            this.clearStatus();
            return;
        }

        try {
            const result = await window.electronAPI.validateGitRepo(projectPath);
            if (result.isValid) {
                this.showStatus('✅ Git 專案驗證成功', 'success');
            } else {
                this.showStatus(`❌ 不是有效的 Git 專案：${result.error}`, 'error');
            }
        } catch (error) {
            console.error('驗證 Git 專案失敗:', error);
            this.showStatus('驗證 Git 專案時發生錯誤', 'error');
        }
    }

    renderTagGroups() {
        const container = document.getElementById('tagGroupsContainer');

        // 創建 grid 容器
        const gridContainer = document.createElement('div');
        gridContainer.className = 'tags-grid';

        this.tagGroups.forEach((group, index) => {
            const tagItem = this.createTagGroupItem(group, index);
            gridContainer.appendChild(tagItem);
        });

        container.innerHTML = '';
        container.appendChild(gridContainer);
    }

    createTagGroupItem(group, index) {
        const div = document.createElement('div');
        div.className = 'tag-item';

        div.innerHTML = `
            <input type="text" class="tag-input" value="${this.escapeHtml(group)}"
                   placeholder="例如：prd-v" data-index="${index}">
            <button class="btn btn-danger btn-small" onclick="ui.removeTagGroup(${index})">移除</button>
        `;

        const input = div.querySelector('.tag-input');
        input.addEventListener('input', (e) => {
            this.tagGroups[index] = e.target.value.trim();
        });

        return div;
    }

    addTagGroup() {
        this.tagGroups.push('');
        this.renderTagGroups();

        const inputs = document.querySelectorAll('.tag-input');
        const lastInput = inputs[inputs.length - 1];
        if (lastInput) {
            lastInput.focus();
        }
    }

    removeTagGroup(index) {
        this.tagGroups.splice(index, 1);
        this.renderTagGroups();
    }

    async refreshTags() {
        const projectPath = document.getElementById('projectPath').value.trim();

        if (!projectPath) {
            this.showStatus('請選擇 Git 專案路徑', 'error');
            return;
        }

        this.setButtonsLoading('refresh');
        this.showStatus('🔄 正在更新標籤...', 'info');

        try {
            const result = await window.electronAPI.refreshTags(projectPath);

            if (result.success) {
                this.showStatus('✅ 標籤更新完成！', 'success');
            } else {
                this.showStatus(`❌ 更新失敗：${result.error}`, 'error');
            }
        } catch (error) {
            console.error('更新標籤失敗:', error);
            this.showStatus('更新標籤時發生錯誤', 'error');
        } finally {
            this.setButtonsLoading(null);
        }
    }

    async generateTagsViewer() {
        const config = this.getConfig();
        if (!config) return;

        // 儲存設定
        await this.saveConfig(config);

        this.setButtonsLoading('generate');
        this.showStatus('📊 正在分析資料並生成檢視器...', 'info');

        try {
            const result = await window.electronAPI.generateTagsData(config);

            if (result.success) {
                this.showStatus('✅ 檢視器已成功生成並開啟！', 'success');
            } else {
                this.showStatus(`❌ 生成失敗：${result.error}`, 'error');
            }
        } catch (error) {
            console.error('生成標籤檢視器失敗:', error);
            this.showStatus('生成檢視器時發生錯誤', 'error');
        } finally {
            this.setButtonsLoading(null);
        }
    }

    async refreshAndGenerate() {
        const config = this.getConfig();
        if (!config) return;

        // 儲存設定
        await this.saveConfig(config);

        this.setButtonsLoading('all');
        this.showStatus('🚀 正在更新標籤並生成檢視器...', 'info');

        try {
            const result = await window.electronAPI.refreshAndGenerate(config);

            if (result.success) {
                this.showStatus('✅ 檢視器已成功生成並開啟！', 'success');
            } else {
                this.showStatus(`❌ 操作失敗：${result.error}`, 'error');
            }
        } catch (error) {
            console.error('更新並生成失敗:', error);
            this.showStatus('操作時發生錯誤', 'error');
        } finally {
            this.setButtonsLoading(null);
        }
    }

    getConfig() {
        const projectPath = document.getElementById('projectPath').value.trim();
        const tagsPerGroup = parseInt(document.getElementById('tagsPerGroup').value);
        const commitsPerTag = parseInt(document.getElementById('commitsPerTag').value);
        const commitLimit = parseInt(document.getElementById('commitLimit').value);

        if (!projectPath) {
            this.showStatus('請選擇 Git 專案路徑', 'error');
            return null;
        }

        if (!tagsPerGroup || tagsPerGroup < 1) {
            this.showStatus('每組標籤數必須大於 0', 'error');
            return null;
        }

        if (commitsPerTag < 0) {
            this.showStatus('每標籤提交數不能小於 0', 'error');
            return null;
        }

        if (!commitLimit || commitLimit < 1) {
            this.showStatus('Commit 上限筆數必須大於 0', 'error');
            return null;
        }

        const validTagGroups = this.tagGroups.filter(group => group.trim());
        if (validTagGroups.length === 0) {
            this.showStatus('請至少新增一個標籤分組前綴', 'error');
            return null;
        }

        return {
            projectPath,
            tagsPerGroup,
            commitsPerTag,
            commitLimit,
            tagGroups: validTagGroups
        };
    }

    async saveConfig(config) {
        try {
            await window.electronAPI.saveConfig(config);
        } catch (error) {
            console.error('儲存設定失敗:', error);
        }
    }

    setButtonsLoading(activeButton) {
        const refreshBtn = document.getElementById('refreshTagsBtn');
        const generateBtn = document.getElementById('generateBtn');
        const refreshAndGenerateBtn = document.getElementById('refreshAndGenerateBtn');

        // 重置所有按鈕
        refreshBtn.disabled = false;
        generateBtn.disabled = false;
        refreshAndGenerateBtn.disabled = false;
        refreshBtn.innerHTML = '🔄 更新標籤';
        generateBtn.innerHTML = '📊 產生檔案';
        refreshAndGenerateBtn.innerHTML = '🚀 更新標籤並產生';

        // 根據活動按鈕設定載入狀態
        if (activeButton === 'refresh') {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<div class="loading-spinner"></div>更新中...';
        } else if (activeButton === 'generate') {
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<div class="loading-spinner"></div>生成中...';
        } else if (activeButton === 'all') {
            refreshAndGenerateBtn.disabled = true;
            refreshAndGenerateBtn.innerHTML = '<div class="loading-spinner"></div>執行中...';
        }

        // 在任何操作進行時禁用所有其他按鈕
        if (activeButton) {
            if (activeButton !== 'refresh') refreshBtn.disabled = true;
            if (activeButton !== 'generate') generateBtn.disabled = true;
            if (activeButton !== 'all') refreshAndGenerateBtn.disabled = true;
        }
    }

    showStatus(message, type) {
        const statusElement = document.getElementById('statusMessage');
        statusElement.className = `status-message status-${type}`;
        statusElement.textContent = message;
        statusElement.classList.remove('hidden');

        if (type === 'success') {
            setTimeout(() => {
                this.clearStatus();
            }, 5000);
        }
    }

    clearStatus() {
        const statusElement = document.getElementById('statusMessage');
        statusElement.classList.add('hidden');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const ui = new GitTagsViewerUI();

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 載入完成');
});