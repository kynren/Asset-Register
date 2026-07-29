import { useEffect, useRef, useState } from "react";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
const FRAME_MS = 28;
const FRAMES = 16;

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

export type RevealPhase = "hidden" | "decrypting" | "revealed" | "encrypting";

/**
 * Drives a "decryption" scramble-to-plaintext animation when revealing a secret,
 * and a reverse "encryption" scramble-to-mask animation when hiding it again.
 */
export function useCryptoReveal(maskLength: number) {
  const [phase, setPhase] = useState<RevealPhase>("hidden");
  const [display, setDisplay] = useState("•".repeat(maskLength));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function runScramble(target: string, direction: "in" | "out", onDone: () => void) {
    if (timerRef.current) clearInterval(timerRef.current);
    let frame = 0;
    timerRef.current = setInterval(() => {
      frame += 1;
      const progress = direction === "in" ? frame / FRAMES : 1 - frame / FRAMES;
      const revealCount = Math.max(0, Math.round(progress * target.length));
      let out = "";
      for (let i = 0; i < target.length; i++) {
        out += i < revealCount ? target[i] : randomChar();
      }
      setDisplay(out);
      if (frame >= FRAMES) {
        if (timerRef.current) clearInterval(timerRef.current);
        onDone();
      }
    }, FRAME_MS);
  }

  function reveal(plaintext: string) {
    setPhase("decrypting");
    runScramble(plaintext, "in", () => {
      setDisplay(plaintext);
      setPhase("revealed");
    });
  }

  function hide() {
    const current = display;
    setPhase("encrypting");
    runScramble(current, "out", () => {
      setDisplay("•".repeat(maskLength));
      setPhase("hidden");
    });
  }

  return { phase, display, reveal, hide };
}
