import { Plugin, Notice, TFile } from 'obsidian';
import { exec } from 'child_process';

export default class OmniFocusSyncPlugin extends Plugin {
  private cachedContent: string = '';


  async onload() {
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
        });
      })
    );
}
  
  private detectCheckboxChange(currentContent: string) {
    const oldContent = this.cachedContent; // 需要缓存上一次的文档内容
    const checkboxRegex = /^\s*-\s\[( |x)\].*$/gm;
    // 获取新旧内容中的复选框行
    const oldCheckboxes = oldContent.match(checkboxRegex) || [];
    const newCheckboxes = currentContent.match(checkboxRegex) || [];
    if (oldCheckboxes.join() !== newCheckboxes.join()) {
      this.triggerCheckboxEvent(oldCheckboxes, newCheckboxes);
    }
    this.cachedContent = currentContent; // 更新缓存
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
    current.forEach((line, index) => {
      const oldLine = old[index];
      if (!this.isAcceptableDifference(oldLine, line)) return;
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
      console.log(isCompleted ? '已完成任务' : '未完成任务', line);
      if (isCompleted) {
        // 将当前行从原位置删除，并插入到“已完成任务”下的第二行
        const file = this.app.workspace.getActiveFile();
        if (!file) return;
        this.app.vault.read(file).then(content => {
          const lines = content.split('\n');
          const lineIndex = lines.findIndex(l => l.trim() === line.trim());
          if (lineIndex === -1) return;
          // 删除原行
          lines.splice(lineIndex, 1);
          // 查找“已完成任务”标题
          const completedHeaderIndex = lines.findIndex(l => l.trim().startsWith('## 已完成任务'));
          
          if (completedHeaderIndex !== -1) {
            // 插入到“已完成任务”下的第二行（即标题后第二行，index+2）
            const insertIndex = Math.min(completedHeaderIndex + 2, lines.length);
            // 向上查找，移除插入点前的空行
            let cleanInsertIndex = insertIndex;
            while (cleanInsertIndex > 0 && lines[cleanInsertIndex - 1].trim() === '') {
              cleanInsertIndex--;
            }
            if (line.trim() === '') return;
            line = this.removeLineBreaks(line);
            lines.splice(cleanInsertIndex, 0, line);
          } else {
            // 如果没有“已完成任务”标题，则插入到末尾
            lines.push(line);
          }
          // 统计“已完成任务”下的已完成任务数量
          let completedCount = 0;
          if (completedHeaderIndex !== -1) {
            for (let i = completedHeaderIndex + 1; i < lines.length; i++) {
              const lineText = lines[i].trim();
              if (lineText.startsWith('## ')) break; // 到下一个标题为止
              if (/^-\s*\[x\]/i.test(lineText)) completedCount++;
            }
            // 更新标题为“已完成任务 - X 个”
            lines[completedHeaderIndex] = `## 已完成任务 - ${completedCount} 个`;
          }
          this.app.vault.modify(file, lines.join('\n'));
          new Notice('已完成任务已更新');
        });
      }
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
}
