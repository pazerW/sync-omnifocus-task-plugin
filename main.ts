import { Plugin, Notice } from 'obsidian';
import { exec } from 'child_process';

export default class OmniFocusSyncPlugin extends Plugin {
async onload() {
		console.log('OmniFocus Sync Plugin loaded');
		// 监听点击事件
	this.app.workspace.onLayoutReady(() => {
	const container = this.app.workspace.containerEl;
	this.registerDomEvent(container, 'click', (evt: MouseEvent) => {
		console.log('点击事件:', evt);
		const target = evt.target as HTMLElement;
		if (target.matches('.task-list-item-checkbox')) {
		const listItem = target.closest('.task-list-item');
		if (listItem) {
			const link = listItem.querySelector('a[href^="omnifocus://"]');
			if (link) {
			evt.preventDefault();
			const href = link.getAttribute('href');
			const taskId = href ? this.extractTaskId(href) : null;
			if (taskId) this.toggleOmniFocusTask(taskId);
			}
		}
		}
	}, true); // 捕获阶段监听
	});

  }

  // 从URL提取OmniFocus任务ID
  private extractTaskId(url: string): string | null {
    const match = url.match(/omnifocus:\/\/\/task\/([\w-]+)/);
    return match ? match[1] : null;
  }

  // 执行AppleScript操作OmniFocus
	private toggleOmniFocusTask(taskId: string) {
	console.log('切换OmniFocus任务:', taskId);
	const appleScript = `
	tell application "OmniFocus"
		tell front document
			set myTask to task id "${taskId}"
			if completed of myTask is false then
				mark complete myTask
			else
				mark incomplete myTask
			end if
		end tell
	end tell
    `;

    exec(`osascript -e '${appleScript}'`, (err) => {
      if (err) {
        console.error('OmniFocus同步失败:', err);
        new Notice('❌ OmniFocus任务更新失败，请确保OmniFocus正在运行');
      } else {
        new Notice('✅ OmniFocus任务已完成同步');
      }
    });
  }
}