import { MessageObject } from "@api/MessageEvents";
import definePlugin from "@utils/types";

const LOG = (...args: any[]) => console.log("[TypingSpeed]", ...args);

let focusTime: number | null = null;
let firstInputTime: number | null = null;
let lastInputTime: number | null = null;
let charsTyped = 0;

function getChatTextarea(target: EventTarget | null): HTMLTextAreaElement | null {
    if (!(target instanceof HTMLTextAreaElement)) return null;
    if (!target.className.includes("textArea")) return null;
    return target;
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
    LOG("blur — reset");
    resetState();
}

function onInput(e: Event) {
    const ta = getChatTextarea(e.target);
    if (!ta) return;

    const ie = e as InputEvent;
    // Only count insertions (covers normal typing, IME composition, paste)
    if (!ie.inputType || ie.inputType.startsWith("insert")) {
        const inserted = ie.data?.length ?? 1;
        const now = Date.now();
        if (firstInputTime === null) {
            firstInputTime = now;
            LOG("first input");
        }
        lastInputTime = now;
        charsTyped += inserted;
        LOG("chars so far:", charsTyped);
    }
}

function resetState() {
    focusTime = null;
    firstInputTime = null;
    lastInputTime = null;
    charsTyped = 0;
}

export default definePlugin({
    name: "TypingSpeed",
    description: "发送消息时附加模拟大模型风格的打字统计信息",
    authors: [],

    onBeforeMessageSend(_channelId: string, msg: MessageObject) {
        LOG("onBeforeMessageSend — chars:", charsTyped, "content:", msg.content.slice(0, 30));

        if (firstInputTime !== null && lastInputTime !== null && charsTyped > 1) {
            const totalSec = (lastInputTime - firstInputTime) / 1000;
            const tps = totalSec > 0 ? (charsTyped / totalSec).toFixed(1) : "—";
            const ttftStr = focusTime !== null
                ? ((firstInputTime - focusTime) / 1000).toFixed(2)
                : null;

            const parts = [
                `Out: ${charsTyped}t`,
                `Time: ${totalSec.toFixed(2)}s`,
                `${tps} t/s`,
                ...(ttftStr !== null ? [`TTFT: ${ttftStr}s`] : []),
            ];

            msg.content += `\n-# ⌨️ ${parts.join(" | ")}`;
            LOG("appended:", parts.join(" | "));
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
        LOG("stopped");
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        document.removeEventListener("input", onInput, true);
        resetState();
    },
});
