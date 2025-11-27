const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectProjectPath: () => ipcRenderer.invoke('select-project-path'),
    validateGitRepo: (projectPath) => ipcRenderer.invoke('validate-git-repo', projectPath),
    refreshTags: (projectPath) => ipcRenderer.invoke('refresh-tags', projectPath),
    generateTagsData: (config) => ipcRenderer.invoke('generate-tags-data', config),
    refreshAndGenerate: (config) => ipcRenderer.invoke('refresh-and-generate', config),
    getDefaultConfig: () => ipcRenderer.invoke('get-default-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config)
});