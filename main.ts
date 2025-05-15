import { Plugin, Notice } from 'obsidian';
import { exec } from 'child_process';

export default class OmniFocusSyncPlugin extends Plugin {
async onload() {
		console.log('OmniFocus Sync Plugin loaded');
		// 监听点击事件
	this.app.workspace.onLayoutReady(() => {
	const container = this.app.workspace.containerEl;
		this.registerDomEvent(container, 'click', (evt: MouseEvent) => {
		const target = evt.target as HTMLElement;
			if (target.matches('.task-list-item-checkbox')) {
				this.switchToPreviewIfEditing();
				const listItem = target.closest('.task-list-item');
				if (listItem) {
					const link = listItem.querySelector('a[href^="omnifocus://"]');
					if (link) {
					evt.preventDefault();
					const href = link.getAttribute('href');
					const taskId = href ? this.extractTaskId(href) : null;
					const isChecked = target instanceof HTMLInputElement ? target.checked : false;
					console.log('Checkbox is', isChecked );
					if (taskId) this.toggleOmniFocusTask(taskId,isChecked);
					}
				}
		}
	}, true); // 捕获阶段监听
	});

  }
  
  switchToPreviewIfEditing() {
    const leaf = this.app.workspace.activeLeaf;

    if (!leaf) return;

    const view = leaf.view;

    // 编辑视图的类型是 'markdown' 且状态 mode 为 'source'
    const viewState = leaf.getViewState();

    if (
      viewState.type === "markdown" &&
      (view as any).getMode && 
      (view as any).getMode() === "source"
    ) {
      // 切换到预览模式
      leaf.setViewState({
        type: "markdown",
        state: {
          ...viewState.state,
          mode: "preview",
        },
        active: true,
      });
    }
  }

  // 从URL提取OmniFocus任务ID
  private extractTaskId(url: string): string | null {
    const match = url.match(/omnifocus:\/\/\/task\/([\w-]+)/);
    return match ? match[1] : null;
  }

  // 执行AppleScript操作OmniFocus
  private toggleOmniFocusTask(taskId: string, isChecked: boolean) {
    console.log('切换OmniFocus任务:', taskId);
    const appleScript = `
    tell application "OmniFocus"
      tell front document
        set myTask to task id "${taskId}"
        
        -- 获取任务的截止时间
        set taskDueDate to due date of myTask
        set currentDate to current date

        -- 判断 due date 是否存在且小于等于今天，才进行操作
        if taskDueDate is not missing value and taskDueDate ≤ currentDate then
          if ${isChecked} then
            mark complete myTask
            return "✅ 更新至已完成"
          else
            mark incomplete myTask
            return "✅ 更新至未完成"
          end if
        else
          return "❌ 任务截止日期已过"
        end if
      end tell
    end tell
    `;

    exec(`osascript -e '${appleScript}'`, (err, stdout) => {
      if (err) {
        console.error('OmniFocus同步失败:', err);
        new Notice('OmniFocus任务更新失败，请确保OmniFocus正在运行');
      } else {
        console.log('AppleScript返回值:', stdout.trim());
        new Notice(` ${stdout.trim()}`);
      }
    });
  }
}