import definePlugin from "@utils/types";
import { addPreSendListener, removePreSendListener } from "@api/MessageEvents";

// State per message composition
let typingStartTime: number | null = null;
let charsTyped = 0;

function isMessageInput(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    // Discord's message box is a role="textbox" contenteditable div
    return target.getAttribute("role") === "textbox"
        || !!target.closest('[role="textbox"]');
}

function onKeyDown(e: KeyboardEvent) {
    if (!isMessageInput(e.target)) return;

    // Start timer on first character
    if (!typingStartTime) {
        typingStartTime = Date.now();
        charsTyped = 0;
    }

    // Count printable characters (not Ctrl/Alt shortcuts, not arrows/backspace)
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        charsTyped++;
    }
}

function resetState() {
    typingStartTime = null;
    charsTyped = 0;
}

export default definePlugin({
    name: "TypingSpeed",
    description: "发送消息时自动在末尾追加打字速度（WPM）",
    authors: [],
    dependencies: ["MessageEventsAPI"],

    preSendListener: null as ReturnType<typeof addPreSendListener> | null,

    start() {
        this.preSendListener = addPreSendListener((_channelId, msg) => {
            if (typingStartTime !== null && charsTyped > 3) {
                const elapsedMin = (Date.now() - typingStartTime) / 60_000;
                const wpm = Math.round(charsTyped / 5 / elapsedMin);

                // Sanity filter: ignore implausible values
                if (wpm > 0 && wpm < 500) {
                    const elapsedSec = ((Date.now() - typingStartTime!) / 1000).toFixed(2);
                    msg.content += `\n-# ⌨️ WPM: ${wpm} | Time: ${elapsedSec}s | Chars: ${charsTyped}`;
                }
            }
            resetState();
        });

        document.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        if (this.preSendListener) {
            removePreSendListener(this.preSendListener);
            this.preSendListener = null;
        }
        document.removeEventListener("keydown", onKeyDown, true);
        resetState();
    },
});
