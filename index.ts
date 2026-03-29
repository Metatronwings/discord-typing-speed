import { findByProps } from "@webpack";
import definePlugin from "@utils/types";

let focusTime: number | null = null;
let firstMutTime: number | null = null;
let lastMutTime: number | null = null;
let lastKnownLength = 0;
let observer: MutationObserver | null = null;
let currentEditor: HTMLElement | null = null;

function getSlateEditor(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    if (target.className?.includes("slateTextArea")) return target;
    return target.closest<HTMLElement>('[class*="slateTextArea"]');
}

function attachObserver(el: HTMLElement) {
    if (observer) { observer.disconnect(); observer = null; }
    currentEditor = el;
    observer = new MutationObserver(() => {
        const len = el.textContent?.length ?? 0;
        if (len === 0) return;
        const now = Date.now();
        if (firstMutTime === null) firstMutTime = now;
        lastMutTime = now;
        lastKnownLength = len;
    });
    observer.observe(el, { characterData: true, childList: true, subtree: true });
}

/** 只重置计时，不断开 observer（用于连续发消息）*/
function resetTiming() {
    focusTime = Date.now(); // 下一条消息的 TTFT 从本次发送完算起
    firstMutTime = null;
    lastMutTime = null;
    lastKnownLength = 0;
}

/** 完全重置，断开 observer（用于插件停止或切换频道）*/
function fullReset() {
    focusTime = null;
    firstMutTime = null;
    lastMutTime = null;
    lastKnownLength = 0;
    if (observer) { observer.disconnect(); observer = null; }
    currentEditor = null;
}

function onFocusIn(e: FocusEvent) {
    const el = getSlateEditor(e.target);
    if (!el) return;
    // 切换到了不同的编辑器（换频道）→ 重新 attach
    if (el !== currentEditor) {
        fullReset();
        focusTime = Date.now();
        attachObserver(el);
        return;
    }
    // 同一个编辑器 focus 回来
    if (!el.textContent || el.textContent.length === 0) resetTiming();
    if (focusTime === null) focusTime = Date.now();
}

function buildStats(): string | null {
    if (firstMutTime === null || lastMutTime === null || lastKnownLength < 2) return null;
    const totalSec = (lastMutTime - firstMutTime) / 1000;
    const tps = totalSec > 0 ? (lastKnownLength / totalSec).toFixed(1) : "—";
    const ttftStr = focusTime !== null
        ? ((firstMutTime - focusTime) / 1000).toFixed(2)
        : null;
    const parts = [
        `Out: ${lastKnownLength}t`,
        `Time: ${totalSec.toFixed(2)}s`,
        `${tps} t/s`,
        ...(ttftStr !== null ? [`TTFT: ${ttftStr}s`] : []),
    ];
    return `\n-# ⌨️ ${parts.join(" | ")}`;
}

export default definePlugin({
    name: "TypingSpeed",
    description: "发送消息时附加模拟大模型风格的打字统计信息",
    authors: [],

    _origSend: null as ((...a: any[]) => any) | null,
    _actions: null as any,

    start() {
        const actions = findByProps("sendMessage", "editMessage");
        if (!actions) return;
        this._actions = actions;
        this._origSend = actions.sendMessage;
        actions.sendMessage = (...args: any[]) => {
            const [channelId, message, ...rest] = args;
            const stats = buildStats();
            if (stats && typeof message?.content === "string") message.content += stats;
            // 只重置计时，observer 保持运行，连续发消息也没问题
            resetTiming();
            return this._origSend!.apply(actions, [channelId, message, ...rest]);
        };

        document.addEventListener("focusin", onFocusIn, true);

        const existing = document.querySelector<HTMLElement>('[class*="slateTextArea"]');
        if (existing) { focusTime = Date.now(); attachObserver(existing); }
    },

    stop() {
        if (this._actions && this._origSend) this._actions.sendMessage = this._origSend;
        document.removeEventListener("focusin", onFocusIn, true);
        fullReset();
    },
});
