import { findByProps } from "@webpack";
import definePlugin from "@utils/types";

let focusTime: number | null = null;
let firstKeyTime: number | null = null; // set by actual key/composition input
let lastMutTime: number | null = null;  // set by MutationObserver
let lastKnownLength = 0;
let observer: MutationObserver | null = null;
let currentEditor: HTMLElement | null = null;
let hasFocus = false;

function getSlateEditor(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    if (target.className?.includes("slateTextArea")) return target;
    return target.closest<HTMLElement>('[class*="slateTextArea"]');
}

function attachObserver(el: HTMLElement) {
    if (observer) { observer.disconnect(); observer = null; }
    currentEditor = el;
    observer = new MutationObserver(() => {
        if (!hasFocus) return;
        const len = el.textContent?.length ?? 0;
        if (len === 0) return;
        lastMutTime = Date.now();
        lastKnownLength = len;
    });
    observer.observe(el, { characterData: true, childList: true, subtree: true });
}

function onFocusIn(e: FocusEvent) {
    const el = getSlateEditor(e.target);
    if (!el) return;
    hasFocus = true;
    // Always restart TTFT from this focus event
    focusTime = Date.now();
    firstKeyTime = null;
    if (el !== currentEditor) {
        lastMutTime = null;
        lastKnownLength = 0;
        attachObserver(el);
    }
}

function onFocusOut(e: FocusEvent) {
    if (!getSlateEditor(e.target)) return;
    hasFocus = false;
}

/** 用户真实开始输入时设 firstKeyTime（用于 TTFT） */
function markFirstKey() {
    if (hasFocus && firstKeyTime === null) firstKeyTime = Date.now();
}

function onKeyDown(e: KeyboardEvent) {
    if (!getSlateEditor(e.target) || !hasFocus) return;
    // 可打印字符（非 IME 模式）
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) markFirstKey();
}

function onCompositionStart(e: CompositionEvent) {
    if (!getSlateEditor(e.target)) return;
    markFirstKey();
}

function buildStats(): string | null {
    if (firstKeyTime === null || lastMutTime === null || lastKnownLength < 2) return null;
    const totalSec = (lastMutTime - firstKeyTime) / 1000;
    const tps = totalSec > 0 ? (lastKnownLength / totalSec).toFixed(1) : "—";
    const ttft = focusTime !== null ? (firstKeyTime - focusTime) / 1000 : null;
    const ttftStr = ttft !== null && ttft > 0.5 ? ttft.toFixed(2) : null;
    const parts = [
        `Out: ${lastKnownLength}t`,
        `Time: ${totalSec.toFixed(2)}s`,
        `${tps} t/s`,
        ...(ttftStr !== null ? [`TTFT: ${ttftStr}s`] : []),
    ];
    return `\n-# ⌨️ ${parts.join(" | ")}`;
}

function resetTiming() {
    focusTime = Date.now();
    firstKeyTime = null;
    lastMutTime = null;
    lastKnownLength = 0;
}

function fullReset() {
    focusTime = null;
    firstKeyTime = null;
    lastMutTime = null;
    lastKnownLength = 0;
    hasFocus = false;
    if (observer) { observer.disconnect(); observer = null; }
    currentEditor = null;
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
            resetTiming();
            return this._origSend!.apply(actions, [channelId, message, ...rest]);
        };

        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", onFocusOut, true);
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("compositionstart", onCompositionStart, true);

        const existing = document.querySelector<HTMLElement>('[class*="slateTextArea"]');
        if (existing) {
            hasFocus = existing.contains(document.activeElement) || document.activeElement === existing;
            focusTime = Date.now();
            attachObserver(existing);
        }
    },

    stop() {
        if (this._actions && this._origSend) this._actions.sendMessage = this._origSend;
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("compositionstart", onCompositionStart, true);
        fullReset();
    },
});
