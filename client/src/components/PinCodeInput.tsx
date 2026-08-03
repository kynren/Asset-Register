import { ClipboardEvent, KeyboardEvent, useRef } from "react";

interface PinCodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

// Renders a numeric code as `length` individual boxes (login PIN, MFA-style codes) instead of one
// text input — typing advances to the next box, backspace on an empty box steps back, and pasting
// a full code splits it across all boxes at once.
export function PinCodeInput({ length = 6, value, onChange, autoFocus, disabled }: PinCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, digit);
    if (digit && index < length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigit(index - 1, "");
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const next = digits.slice();
    for (let i = 0; i < pasted.length && index + i < length; i++) next[index + i] = pasted[i];
    onChange(next.join("").slice(0, length));
    const lastFilled = Math.min(index + pasted.length, length) - 1;
    inputRefs.current[Math.max(lastFilled, 0)]?.focus();
  }

  return (
    <div className="row gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          className="input"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
          style={{ width: 40, height: 48, textAlign: "center", fontSize: 20, fontWeight: 600, padding: 0 }}
        />
      ))}
    </div>
  );
}
