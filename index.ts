import definePlugin from "@utils/types";

const LOG = (...args: any[]) => console.log("[TypingSpeed]", ...args);

// Typing session state
let focusTime: number | null = null;
let firstKeyTime: number | null = null;
let lastKeyTime: number | null = null;
let charsTyped = 0;

function getChatTextbox(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    const textbox = target.closest<HTMLElement>('[role="textbox"]');
    if (!textbox) return null;
    if (!textbox.closest('[class*="channelTextArea"]')) {
        LOG("textbox found but not inside channelTextArea — skipping", textbox);
        return null;
    }
    return textbox;
}

function onFocusIn(e: FocusEvent) {
    const textbox = getChatTextbox(e.target);
    if (!textbox) return;
    if (focusTime === null) {
        focusTime = Date.now();
        LOG("focused chat input");
    }
}

function onFocusOut(e: FocusEvent) {
    if (!getChatTextbox(e.target)) return;
    LOG("blur — resetting state");
    resetState();
}

function onKeyDown(e: KeyboardEvent) {
    const textbox = getChatTextbox(e.target);
    if (!textbox) return;

    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        LOG("Enter pressed — state:", { charsTyped, firstKeyTime, lastKeyTime, focusTime });
        injectStats(textbox);
        resetState();
        return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        if (firstKeyTime === null) {
            firstKeyTime = now;
            LOG("first char typed");
        }
        lastKeyTime = now;
        charsTyped++;
    }
}

function injectStats(textbox: HTMLElement) {
    if (firstKeyTime === null || lastKeyTime === null || charsTyped <= 3) {
        LOG("injectStats skipped — not enough data", { charsTyped, firstKeyTime });
        return;
    }

    const totalSec = (lastKeyTime - firstKeyTime) / 1000;
    const tps = totalSec > 0 ? (charsTyped / totalSec).toFixed(1) : "—";
    const ttftStr = focusTime !== null
        ? ((firstKeyTime - focusTime) / 1000).toFixed(2)
        : null;

    const parts = [
        `Out: ${charsTyped}t`,
        `Time: ${totalSec.toFixed(2)}s`,
        `${tps} t/s`,
        ...(ttftStr !== null ? [`TTFT: ${ttftStr}s`] : []),
    ];

    const statsText = `\n-# ⌨️ ${parts.join(" | ")}`;
    LOG("injecting:", statsText);

    const sel = window.getSelection();
    if (sel) {
        const range = document.createRange();
        range.selectNodeContents(textbox);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    const ok = document.execCommand("insertText", false, statsText);
    LOG("execCommand result:", ok);
}

function resetState() {
    focusTime = null;
    firstKeyTime = null;
    lastKeyTime = null;
    charsTyped = 0;
}

export default definePlugin({
    name: "TypingSpeed",
    description: "发送消息时附加模拟大模型风格的打字统计信息",
    authors: [],

    start() {
        LOG("plugin started");
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", onFocusOut, true);
        document.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        LOG("plugin stopped");
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        document.removeEventListener("keydown", onKeyDown, true);
        resetState();
    },
});
