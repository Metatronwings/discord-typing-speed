import { MessageObject } from "@api/MessageEvents";
import definePlugin from "@utils/types";

const LOG = (...a: any[]) => console.log("[TypingSpeed]", ...a);

let focusTime: number | null = null;
let firstInputTime: number | null = null;
let lastInputTime: number | null = null;
let lastKnownLength = 0;       // snapshot of textarea.value.length, updated on each input
let pendingStats: string | null = null;

function getChatTextarea(target: EventTarget | null): HTMLTextAreaElement | null {
    if (!(target instanceof HTMLTextAreaElement)) return null;
    if (!target.className.includes("textArea")) {
        LOG("textarea miss — class:", target.className);
        return null;
    }
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
    pendingStats = null;
}

function onFocusIn(e: FocusEvent) {
    if (!getChatTextarea(e.target)) return;
    if (focusTime === null) {
        focusTime = Date.now();
        LOG("focused");
    }
}

function onFocusOut(e: FocusEvent) {
    if (!getChatTextarea(e.target)) return;
    const stats = buildStats();
    LOG("blur — pendingStats:", stats, "length:", lastKnownLength);
    resetState();
    pendingStats = stats;
}

function onInput(e: Event) {
    const ta = getChatTextarea(e.target);
    if (!ta) return;
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
        LOG("onBeforeMessageSend — pendingStats:", pendingStats);
        if (pendingStats) {
            msg.content += pendingStats;
        }
        resetState();
    },

    start() {
        LOG("started");
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", onFocusOut, true);
        document.addEventListener("input", onInput, true);
    },

    stop() {
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        document.removeEventListener("input", onInput, true);
        resetState();
    },
});
