# 测试文档

## 正常的复选框（应该被检测到）
- [x] 这是一个已完成的任务 omnifocus:///task/test123
- [ ] 这是一个未完成的任务

## 代码块中的复选框（应该被忽略）

```markdown
- [x] 这是代码块中的已完成任务 omnifocus:///task/test456
- [ ] 这是代码块中的未完成任务
```

```javascript
// 代码示例
const task = {
  completed: true,
  text: "- [x] 这也是代码块中的任务"
};
```

## 其他正常的复选框
- [x] 另一个已完成的任务 omnifocus:///task/test789