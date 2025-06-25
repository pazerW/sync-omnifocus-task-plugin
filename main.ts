import { Plugin, Notice, App, PluginSettingTab, Setting, TFile } from 'obsidian';
import { exec } from 'child_process';


// 设置页面
class OmniFocusSyncPluginSettingsTab extends PluginSettingTab {
  plugin: OmniFocusSyncPlugin;

  constructor(app: App, plugin: OmniFocusSyncPlugin) {
      super(app, plugin);
      this.plugin = plugin;
  }

  display(): void {
      const { containerEl } = this;
      containerEl.empty();

      containerEl.createEl('h2', { text: 'SolidTime 设置' });

      new Setting(containerEl)
        .setName('移动已完成任务')
        .setDesc('移动已完成任务到 ## 已完成任务')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.moveCompletedTasks)
            .onChange(async (value) => {
                this.plugin.settings.moveCompletedTasks = value;
                await this.plugin.saveSettings();
                new Notice('设置已保存');
            }));
  }
}

interface OmniFocusSyncPluginSettings {
   moveCompletedTasks: boolean;
}

// 默认设置
const DEFAULT_SETTINGS: OmniFocusSyncPluginSettings = {
  moveCompletedTasks: false,
};


export default class OmniFocusSyncPlugin extends Plugin {
  private cachedContent: string = '';
  settings!: OmniFocusSyncPluginSettings;




    async onload() {
      const prod = process.env.NODE_ENV === "production";
      if(prod) {
        console.log("Production mode enabled");
      } else {
        console.log("Development mode enabled 14");
      }
    // 加载设置
    await this.loadSettings();
    this.addSettingTab(new OmniFocusSyncPluginSettingsTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        if (file instanceof TFile) {
          this.cachedContent = await this.app.vault.read(file);
        }
      })
    );
    this.registerEvent(
      this.app.metadataCache.on('changed', (file, data, cache) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (file.path !== activeFile?.path) return; // 只处理当前文件
        this.app.vault.read(file).then(content => {
          this.detectCheckboxChange(content);
          console.log('文件内容变化，检测复选框状态变化');
        });
      })
    );
}
  
  private detectCheckboxChange(currentContent: string) {
    const oldContent = this.cachedContent; // 需要缓存上一次的文档内容
    // const checkboxRegex = /^\s*-\s\[( |x)\].*$/gm;
    // const checkboxRegex = /^(?!\s)-\s\[( |x)\].*$/gm;
    const checkboxRegex = /^-\s\[x\]\s+(.+)$/gm;

    // 获取新旧内容中的复选框行
    const oldCheckboxes = oldContent.match(checkboxRegex) || [];
    const newCheckboxes = currentContent.match(checkboxRegex) || [];
    if (oldCheckboxes.join() !== newCheckboxes.join()) {
      this.triggerCheckboxEvent(oldCheckboxes, newCheckboxes);
    }
    this.cachedContent = currentContent; // 更新缓存
    // 移动已完成任务；
    if (this.settings.moveCompletedTasks) this.onChangeOmniFocusTask();
  }
    
  // 从URL提取OmniFocus任务ID
  // omnifocus:///task/jhFv9AJqnNX.235
  // omnifocus:///task/jhFv9AJqnNX
  private extractTaskId(url: string): string | null {
    const match = url.match(/omnifocus:\/\/\/task\/([\w-]+(?:\.\d+)?)/);
    return match ? match[1] : null;
  }
  
  private triggerCheckboxEvent(old: string[], current: string[]) {
    // 遍历所有复选框行，对比状态
    // 构建内容到索引的映射，允许顺序变化
    const oldMap = new Map<string, string>();
    old.forEach(line => {
      // 用去除checkbox状态和日期后的内容作为key
      const key = this.removeLineBreaks(line.replace(/- \[( |x)\]/, '').replace(/ ✅ \d{4}-\d{2}-\d{2}$/, '').trim());
      oldMap.set(key, line);
    });
    current.forEach(line => {
      const key = this.removeLineBreaks(line.replace(/- \[( |x)\]/, '').replace(/ ✅ \d{4}-\d{2}-\d{2}$/, '').trim());
      const oldLine = oldMap.get(key);
      if (!oldLine) { 
        const isChecked = line.includes('[x]');
        this.onSyncOmniFocusTask(line, isChecked);
      }
      if (!this.isAcceptableDifference(oldLine, line) ) return;

      if (oldLine && oldLine !== line) {
        const isChecked = line.includes('[x]');
        this.onSyncOmniFocusTask(line, isChecked);
      }

    });
  }

  private isAcceptableDifference(oldStr: string | undefined, newStr: string | undefined): boolean {
    if (!oldStr || !newStr) return false;
    if (oldStr === newStr) return false;
    const checkboxRegex = /- \[( |x)\]/g;
    const dateSuffixRegex = / ✅ \d{4}-\d{2}-\d{2}$/;

    // 去掉开头的 checkbox
    const oldBody = oldStr.replace(checkboxRegex, '').replace(dateSuffixRegex, '').trim();
    const newBody = newStr.replace(checkboxRegex, '').replace(dateSuffixRegex, '').trim();
    return oldBody === newBody;
  }

  

  private onSyncOmniFocusTask(line: string, isCompleted: boolean) {
    if (line.includes('omnifocus://')) {
      const taskId = this.extractTaskId(line);
      if (taskId) this.toggleOmniFocusTask(taskId, isCompleted);
    }
  }

  // 将已经完成的项目移动到已完成目录下；
  private onChangeOmniFocusTask() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.app.vault.read(activeFile).then(content => {
        let lines = content.split('\n');
  
        // 步骤1：收集所有已完成任务及其原始索引
        // 找到“已完成任务”标题行索引
        const completedHeaderIndex = lines.findIndex(l => l.trim().startsWith('## 已完成任务'));
        // 只处理标题行之前的内容
        const completedTasksWithIndices = lines
          .slice(0, completedHeaderIndex === -1 ? lines.length : completedHeaderIndex)
          .map((line, index) => ({ line, index }))
          .filter(item => item.line.includes('- [x]'));
        
        // 找到已完成任务下 已经完成的任务行的数量。
        let count = 0;
        for (let i = completedHeaderIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Stop if we hit another header (starts with ##)
            if (line.startsWith('##')) {
                break;
            }
            // Count lines that are task items (assuming they start with - or *)
            if (line.startsWith('- [x]') || line.startsWith('* [x]') || 
                line.startsWith('- [X]') || line.startsWith('* [X]')) {
                count++;
            }
        }
        count += completedTasksWithIndices.length; 
        // 替换 ## 已完成任务 标题行的内容
        if (completedHeaderIndex !== -1) {
          lines[completedHeaderIndex] = `## 已完成任务 - ${count}个`;
        } else {
          // 如果没有找到标题行，则添加一个新的标题行
          lines.push(`## 已完成任务 - ${count}个`);
        }
        // 步骤2：倒序删除原任务行（避免索引变化）
        const indicesToDelete = completedTasksWithIndices.map(item => item.index).sort((a, b) => b - a);
        indicesToDelete.forEach(index => lines.splice(index, 1));
  
        // 步骤3：提取任务内容
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const completedTasks = completedTasksWithIndices.map(item => {
          // 在每个已完成任务行末尾加上时间
          if (item.line.endsWith(timeStr)) return item.line;
          return item.line + ` ${timeStr}`;
        });
  
        // 步骤4：定位标题行
        if (completedHeaderIndex !== -1) {
          // 步骤5：确定插入位置（标题行后第一个空行或直接追加）
          let nextLineIndex = completedHeaderIndex + 1;
          while (nextLineIndex < lines.length && lines[nextLineIndex].trim() !== '') {
            nextLineIndex++;
          }
          // 插入新任务（保持与原有内容的间隔）
          lines.splice(nextLineIndex, 0, ...completedTasks);
        } else {
          new Notice('未找到"## 已完成任务"标题');
          return;
        }
  
        // 步骤6：写回文件
        const newContent = lines.join('\n');
        this.app.vault.modify(activeFile, newContent);
        // 更新今日任务表行行的数量
        // 先查找今日任务 ## 今日任务
        const todayHeaderIndex = lines.findIndex(l => l.trim().startsWith('## 今日任务'));
        if (todayHeaderIndex !== -1) {
          // 计算今日任务数量
          const todayTasksCount = lines.slice(todayHeaderIndex + 1)
            .filter(line => line.trim().startsWith('- [ ]') || line.trim().startsWith('* [ ]')).length;
          // 更新标题行
          lines[todayHeaderIndex] = `## 今日任务 - ${todayTasksCount}个`;
          // 写回文件
          this.app.vault.modify(activeFile, lines.join('\n'));
        }
      }).catch(err => {
        new Notice('处理文件时出错');
        console.error(err);
      });
    }
  }

  private removeLineBreaks(str: string): string {
    // 匹配所有换行符（包括 \r\n、\n、\r）以及空行
    return str.replace(/(\r\n|\n|\r|^ +| +$)/gm, '');
  }

// 执行AppleScript操作OmniFocus
private toggleOmniFocusTask(taskId: string, isChecked: boolean) {
  const appleScript = `
  tell application "OmniFocus"
    tell front document
    set myTask to task id "${taskId}"
    set taskDueDate to due date of myTask
    set currentDate to (current date) + (1 * days)
    set isCompleted to completed of myTask

    -- 判断 due date 是否存在且小于等于今天，才进行操作
    if taskDueDate is not missing value and taskDueDate ≤ currentDate then
      if (${isChecked} and isCompleted) or (not ${isChecked} and not isCompleted) then
      return "ℹ️ 状态已更新，无需更改"
      else
      if ${isChecked} then
        mark complete myTask
        return "✅ 更新至已完成"
      else
        mark incomplete myTask
        return "✅ 更新至未完成"
      end if
      end if
    else
      return "❌ 任务截止日期已过"
    end if
    end tell
  end tell
  `;

  exec(`osascript -e '${appleScript}'`, (err, stdout) => {
      if (err) {
        new Notice('OmniFocus任务更新失败，请确保OmniFocus正在运行');
      } else {
        new Notice(` ${stdout.trim()}`);
      }
    });
  }
  
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

