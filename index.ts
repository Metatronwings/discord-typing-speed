import { MessageObject } from "@api/MessageEvents";
import definePlugin from "@utils/types";

const LOG = (...a: any[]) => console.log("[TypingSpeed]", ...a);

let focusTime: number | null = null;
let firstInputTime: number | null = null;
let lastInputTime: number | null = null;
let lastKnownLength = 0;

function getChatTextarea(target: EventTarget | null): HTMLTextAreaElement | null {
    if (!(target instanceof HTMLTextAreaElement)) return null;
    if (!target.className.includes("textArea")) return null;
    return target;
}

function buildStats(): string | null {
    if (firstInputTime === null || lastInputTime === null || lastKnownLength < 2) return null;
    const totalSec = (lastInputTime - firstInputTime) / 1000;
    const tps = totalSec > 0 ? (lastKnownLength / totalSec).toFixed(1) : "—";
    const ttftStr = focusTime !== null
        ? ((firstInputTime - focusTime) / 1000).toFixed(2)
        : null;
    const parts = [
        `Out: ${lastKnownLength}t`,
        `Time: ${totalSec.toFixed(2)}s`,
        `${tps} t/s`,
        ...(ttftStr !== null ? [`TTFT: ${ttftStr}s`] : []),
    ];
    return `\n-# ⌨️ ${parts.join(" | ")}`;
}

function resetState() {
    focusTime = null;
    firstInputTime = null;
    lastInputTime = null;
    lastKnownLength = 0;
}

function onFocusIn(e: FocusEvent) {
    if (!getChatTextarea(e.target)) return;
    if (focusTime === null) {
        focusTime = Date.now();
        LOG("focused");
    }
}

function onInput(e: Event) {
    const ta = getChatTextarea(e.target);
    if (!ta) return;

    // User cleared the message — reset so timing doesn't bleed into next message
    if (ta.value.length === 0) {
        resetState();
        return;
    }

    const now = Date.now();
    if (firstInputTime === null) {
        firstInputTime = now;
        LOG("first input");
    }
    lastInputTime = now;
    lastKnownLength = ta.value.length;
}

export default definePlugin({
    name: "TypingSpeed",
    description: "发送消息时附加模拟大模型风格的打字统计信息",
    authors: [],

    onBeforeMessageSend(_channelId: string, msg: MessageObject) {
        const stats = buildStats();
        LOG("onBeforeMessageSend — stats:", stats);
        if (stats) msg.content += stats;
        resetState();
    },

    start() {
        LOG("started");
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("input", onInput, true);
    },

    stop() {
        LOG("stopped");
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("input", onInput, true);
        resetState();
    },
});
