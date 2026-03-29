import definePlugin from "@utils/types";

const LOG = (...args: any[]) => console.log("[TypingSpeed]", ...args);

// Typing session state
let focusTime: number | null = null;
let firstKeyTime: number | null = null;
let lastKeyTime: number | null = null;
let charsTyped = 0;

/** Discord's chat textarea has a class name starting with "textArea" */
function getChatTextarea(target: EventTarget | null): HTMLTextAreaElement | null {
    if (!(target instanceof HTMLTextAreaElement)) return null;
    if (!target.className.includes("textArea")) return null;
    return target;
}

function onFocusIn(e: FocusEvent) {
    const ta = getChatTextarea(e.target);
    if (!ta) return;
    if (focusTime === null) {
        focusTime = Date.now();
        LOG("focused chat textarea");
    }
}

function onFocusOut(e: FocusEvent) {
    if (!getChatTextarea(e.target)) return;
    LOG("blur — resetting state");
    resetState();
}

function onKeyDown(e: KeyboardEvent) {
    const ta = getChatTextarea(e.target);
    if (!ta) return;

    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        LOG("Enter — state:", { charsTyped, firstKeyTime, lastKeyTime, focusTime });
        injectStats(ta);
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

function injectStats(ta: HTMLTextAreaElement) {
    if (firstKeyTime === null || lastKeyTime === null || charsTyped <= 3) {
        LOG("skipped — not enough data", { charsTyped });
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

    // React controls the textarea via a synthetic value — need to trigger
    // React's change handler by calling the native setter, then firing input.
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
    )?.set;

    if (nativeSetter) {
        nativeSetter.call(ta, ta.value + statsText);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        LOG("injected via native setter ✓");
    } else {
        // Fallback: cursor-based execCommand
        ta.setSelectionRange(ta.value.length, ta.value.length);
        const ok = document.execCommand("insertText", false, statsText);
        LOG("injected via execCommand:", ok);
    }
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
