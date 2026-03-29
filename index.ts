import definePlugin from "@utils/types";

// Typing session state
let focusTime: number | null = null;    // when user focused the input box
let firstKeyTime: number | null = null; // when first character was typed
let lastKeyTime: number | null = null;  // when last character was typed
let charsTyped = 0;

/** Discord's main chat input: a [role="textbox"] inside a channelTextArea */
function getChatTextbox(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    const textbox = target.closest<HTMLElement>('[role="textbox"]');
    if (!textbox) return null;
    // Exclude search boxes, etc. — only the main channel input
    if (!textbox.closest('[class*="channelTextArea"]')) return null;
    return textbox;
}

function onFocusIn(e: FocusEvent) {
    if (!getChatTextbox(e.target)) return;
    if (focusTime === null) focusTime = Date.now();
}

function onFocusOut(e: FocusEvent) {
    if (!getChatTextbox(e.target)) return;
    resetState();
}

function onKeyDown(e: KeyboardEvent) {
    const textbox = getChatTextbox(e.target);
    if (!textbox) return;

    // On Enter (no Shift), inject stats before Discord reads the content
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        injectStats(textbox);
        resetState();
        return;
    }

    // Count printable characters
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        if (firstKeyTime === null) firstKeyTime = now;
        lastKeyTime = now;
        charsTyped++;
    }
}

function injectStats(textbox: HTMLElement) {
    if (firstKeyTime === null || lastKeyTime === null || charsTyped <= 3) return;

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

    // Move cursor to end of the editor, then insert via execCommand
    // execCommand triggers Slate.js's beforeinput handler synchronously,
    // so the modified content is what Discord reads when it processes Enter.
    const sel = window.getSelection();
    if (sel) {
        const range = document.createRange();
        range.selectNodeContents(textbox);
        range.collapse(false); // collapse to end
        sel.removeAllRanges();
        sel.addRange(range);
    }

    document.execCommand("insertText", false, statsText);
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
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", onFocusOut, true);
        document.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        document.removeEventListener("keydown", onKeyDown, true);
        resetState();
    },
});
