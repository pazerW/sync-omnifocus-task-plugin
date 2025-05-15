## Features

- Synchronize task completion status between Obsidian and OmniFocus.
- Simple checkbox toggle in Obsidian updates the corresponding task in OmniFocus.
- Supports direct linking to OmniFocus tasks using `omnifocus:///task/<task_id>` format.

## Installation

1. Download or clone the repository.
2. Place the plugin files in your Obsidian plugins folder.
3. Enable the plugin in Obsidian settings.

## Usage

1. Create a task in Obsidian using the format:
    ```
    - [ ] [Task Name](omnifocus:///task/<task_id>)
    ```
2. Toggle the checkbox to sync the task status with OmniFocus.

## Limitations

- Currently, only supports single-language usage.
- Requires OmniFocus to be installed and configured on your device.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.


这是一个用于同步Obsidian 当中Todolist 完成情况同步完成OmniFocus当中Task的插件；

Obsidian 样例
```
- [ ] [Sample Task](omnifocus:///task/abcdefgh) 
```
点击Obsidian 当中的拥有以上格式的Checkbox 可以同步切换 OmniFocus 当中对应Task的完成状态；