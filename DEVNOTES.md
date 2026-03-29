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

## 连续发消息时 MutationObserver 丢失

发送后调用 `resetState()` 断开了 observer，但 Discord 发完消息不会 blur 输入框，所以 `onFocusIn` 不会重新触发，observer 就再也不 attach 了。第二条消息没有任何监听。

**修复：** 把重置拆成两个函数：
- `resetTiming()`：只清计时变量，**保留 observer**（发消息后调用）
- `fullReset()`：断开 observer，完全清空（插件停止 / 切换频道时调用）

---

## TTFT 不准：Discord 后台 DOM 更新触发 Observer

加了 `hasFocus` 标记后，理论上 blur 时不更新计时。但实测发现：**获得焦点的瞬间 Discord 会触发一次 DOM 更新**（如光标位置、aria 属性），导致 MutationObserver 立刻把 `firstMutTime` 设成了 focus 的同一瞬间，TTFT ≈ 0，被过滤掉。

**修复：** 分离两个职责：
- `firstKeyTime`（TTFT 的起点）：由 `keydown` 和 `compositionstart` 设置，只有真实按键才触发
- `lastKnownLength` / `lastMutTime`：由 MutationObserver 设置

这样 TTFT = `firstKeyTime - focusTime`，完全不受 Discord 后台 DOM 更新影响。

---

## focusTime 未随 refocus 更新

失焦再点回来时，`focusTime` 还是上次发送时的值（`resetTiming` 设的），导致 TTFT 把"上次发完到这次开始打"的全部时间都算进去，远大于用户体感。

**修复：** `onFocusIn` 里无条件刷新 `focusTime = Date.now()` 并清空 `firstKeyTime`。TTFT 永远只量**这次点击输入框 → 第一次按键**的时间，和历史状态完全解耦。

---

## 最终架构

```
focusin (capture)
  → 找到 slateTextArea div（class 含 "slateTextArea"）
  → hasFocus = true
  → focusTime = Date.now()，firstKeyTime = null（始终刷新）
  → 若切换频道：fullReset + attachObserver

focusout (capture)
  → hasFocus = false

keydown / compositionstart (capture)
  → 首次触发时设 firstKeyTime（TTFT 起点，仅真实输入）

MutationObserver (on editor DOM)
  → hasFocus 为 false 时忽略（避免后台更新干扰）
  → len=0 时忽略（Discord 发送前清空编辑器）
  → 更新 lastMutTime、lastKnownLength

sendMessage wrapper (findByProps)
  → buildStats()：
      Time  = lastMutTime - firstKeyTime
      t/s   = lastKnownLength / Time
      TTFT  = firstKeyTime - focusTime（> 0.5s 才显示）
  → append 到 message.content
  → resetTiming()（保留 observer，重置计时）
```
