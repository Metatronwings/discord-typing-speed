import { MessageObject } from "@api/MessageEvents";
import definePlugin from "@utils/types";

// Typing session state
let focusTime: number | null = null;    // when user focused the input box
let firstKeyTime: number | null = null; // when first character was typed
let lastKeyTime: number | null = null;  // when last character was typed
let charsTyped = 0;

function isMessageInput(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    return target.getAttribute("role") === "textbox"
        || !!target.closest('[role="textbox"]');
}

function onFocusIn(e: FocusEvent) {
    if (!isMessageInput(e.target)) return;
    if (focusTime === null) focusTime = Date.now();
}

function onKeyDown(e: KeyboardEvent) {
    if (!isMessageInput(e.target)) return;
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

    const now = Date.now();
    if (firstKeyTime === null) firstKeyTime = now;
    lastKeyTime = now;
    charsTyped++;
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

    onBeforeMessageSend(_channelId: string, msg: MessageObject) {
        if (firstKeyTime !== null && lastKeyTime !== null && charsTyped > 3) {
            const totalSec = (lastKeyTime - firstKeyTime) / 1000;
            const tps = totalSec > 0 ? (charsTyped / totalSec).toFixed(1) : "—";
            const timeStr = totalSec.toFixed(2);
            const ttftStr = focusTime !== null
                ? ((firstKeyTime - focusTime) / 1000).toFixed(2)
                : null;

            const parts = [
                `Out: ${charsTyped}t`,
                `Time: ${timeStr}s`,
                `${tps} t/s`,
                ...(ttftStr !== null ? [`TTFT: ${ttftStr}s`] : []),
            ];

            msg.content += `\n-# ⌨️ ${parts.join(" | ")}`;
        }
        resetState();
    },

    start() {
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("keydown", onKeyDown, true);
        resetState();
    },
});
