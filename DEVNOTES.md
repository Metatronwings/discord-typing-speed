# 开发笔记

## 最大的坑：Discord 输入框不是 textarea

整个开发过程最核心的问题：**Discord 的聊天输入框是 Slate.js 渲染的 `<div contenteditable>`，不是 `<textarea>`。**

```
// 实际 DOM 结构（class 名有哈希后缀）：
<div class="markup__xxxxx editor__xxxxx slateTextArea_xxxxx" contenteditable="true">
```

由于 Slate.js 完全接管了编辑行为，以下常规假设全部失效：

| 假设 | 实际情况 |
|------|----------|
| `e.target instanceof HTMLTextAreaElement` | 永远 false，是 `HTMLDivElement` |
| `input` 事件 | Slate.js 不触发原生 `input` 事件 |
| `element.value` | `<div>` 没有 `.value`，要用 `.textContent` |
| `role="textbox"` | Discord 的 Slate 编辑器没有设置这个属性 |

**正确的识别方式：** `element.className.includes("slateTextArea")`

**正确的内容监听方式：** `MutationObserver`，监听 DOM 变化（对中文 IME、英文、粘贴都有效）

失败是静默的——所有基于 `<textarea>` 的代码都正常运行，只是永远匹配不到任何元素，没有任何报错。

---

## 为什么 DevTools 开着才有效

在找到 Slate.js 问题之前，有很长一段时间插件"只在 F12 开着时有效"。原因：

1. `focusin` 和 `input` 事件监听全部因 `instanceof HTMLTextAreaElement` 检查失败而静默跳过
2. 但 `sendMessage` 包装是有效的（能看到 `send intercepted` 日志）
3. DevTools 开着时，用户点击 DevTools 再点回 Discord，触发了 `focusin`……但同样被过滤掉了
4. `send intercepted — stats: null` 是因为 state 从未被设置

**不是 DevTools 改变了行为，而是从一开始 DOM 事件监听就完全没有工作。**

---

## Discord 在 sendMessage 前清空编辑器

发现的另一个坑：Discord 在调用 `sendMessage` 之前会先清空 Slate 编辑器（长度变为 0），然后才发送。

```
用户按 Enter
  → Slate 编辑器内容清空（MutationObserver 触发，len=0）
  → Discord 调用 sendMessage
  → 我们的 wrapper 拦截
```

如果在 MutationObserver 里看到 `len === 0` 就重置 state，那到 `sendMessage` 时数据已经没了。

**修复：** MutationObserver 里 `len === 0` 时直接 `return`，不更新 `lastKnownLength`，保留发送前最后一次有效值。

---

## Vencord MessageEventsAPI 为什么不可靠

尝试过多次 `onBeforeMessageSend` / `addMessagePreSendListener`，但表现不稳定。原因：

`MessageEventsAPI` 是一个 Vencord 插件，它通过**正则匹配 Discord 混淆代码**来 patch 发送逻辑：

```ts
find: ".handleSendMessage,onResize:",
replacement: {
    match: /let (\i)=\i\.\i\.parse\((\i),.+?\.getSendMessageOptions\(\{.+?\}\)?;.../,
    ...
}
```

Discord 一旦更新 bundle，正则就可能失配，patch 静默失败，`onBeforeMessageSend` 永远不会被调用。

**最终方案：** 用 `findByProps("sendMessage", "editMessage")` 直接拿到 Discord 的发送函数并包一层。这个查找走 webpack 模块缓存，不依赖正则，更稳定。

---

## 关于 "只在 F12 开着时有效" 这类问题的调试方法

1. 先加完全不过滤的 raw 监听，确认事件是否到达：
   ```ts
   document.addEventListener("focusin", (e) => {
       console.log("RAW:", e.target.tagName, e.target.className);
   }, true);
   ```
2. 关闭 DevTools，操作页面，然后再开 DevTools 看日志（Chrome 会缓冲）
3. 如果 raw 事件都没有 → 事件没到达，考虑 Shadow DOM 或事件被拦截
4. 如果 raw 事件有但目标检查失败 → 选择器写错了，看 tagName 和 className

---

## 最终架构

```
focusin (capture)
  → 找到 slateTextArea div
  → attach MutationObserver
  → 记录 focusTime（TTFT 起点）

MutationObserver (on editor DOM change)
  → 记录 firstMutTime、lastMutTime、lastKnownLength
  → len=0 时忽略（Discord 发送前清空）

sendMessage wrapper (findByProps)
  → buildStats() 计算统计
  → append 到 message.content
  → resetState()
```
