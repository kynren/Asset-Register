import { InputHTMLAttributes, useState } from "react";
import { Icon } from "./Icon";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input {...props} type={revealed ? "text" : "password"} className={className ?? "input"} style={{ paddingRight: 34, ...props.style }} />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        tabIndex={-1}
        title={revealed ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          padding: 2,
          cursor: "pointer",
          color: "var(--color-text-muted)",
          display: "flex",
        }}
      >
        <Icon name={revealed ? "eyeOff" : "eye"} size={15} />
      </button>
    </div>
  );
}
