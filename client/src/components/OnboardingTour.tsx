import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { useUserPreference } from "../hooks/useUserPreference";

export interface TourStep {
  /** CSS selector for the element this step points at — looked up fresh on every step change so
   *  it works even for elements that only mount after data loads. */
  target: string;
  title: string;
  description: string;
}

// First-run product walkthrough: a small callout anchored to a real DOM element (found via
// `data-tour="..."` selectors, never a ref — keeps this decoupled from whatever component tree
// happens to render the target) plus a highlight ring around it, no dimmed backdrop. Shown once
// per user per `storageKey` (a known key in server/src/modules/preferences/preferences.routes.ts's
// KNOWN_KEYS), then never again unless that preference is cleared.
export function OnboardingTour({ storageKey, steps }: { storageKey: string; steps: TourStep[] }) {
  const { value: seen, setValue: setSeen, isLoading } = useUserPreference<boolean>(storageKey, false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const active = !isLoading && !seen;
  const step = steps[stepIndex];

  useEffect(() => {
    if (!active) return;
    function measure() {
      const el = document.querySelector(step.target);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    // The target may mount a tick after this effect runs (e.g. widgets rendering after their own
    // fetch resolves) — a couple of short retries covers that without a full MutationObserver.
    const retry1 = setTimeout(measure, 150);
    const retry2 = setTimeout(measure, 500);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      clearTimeout(retry1);
      clearTimeout(retry2);
    };
  }, [active, step?.target]);

  if (!active || !step || !rect) return null;

  function finish() {
    setSeen(true);
  }

  const isLast = stepIndex === steps.length - 1;
  const spacing = 10;
  const cardWidth = 300;
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < 160 && rect.top > 160;
  const top = placeAbove ? rect.top - spacing : rect.bottom + spacing;
  const left = Math.min(Math.max(rect.left, 12), window.innerWidth - cardWidth - 12);

  return createPortal(
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          borderRadius: 10,
          boxShadow: "0 0 0 3px var(--color-primary), 0 0 0 9999px rgba(15, 23, 42, 0.28)",
          pointerEvents: "none",
          zIndex: 9998,
          transition: "top 0.15s ease, left 0.15s ease",
        }}
      />
      <div
        role="dialog"
        aria-label={step.title}
        style={{
          position: "fixed",
          top,
          left,
          width: cardWidth,
          transform: placeAbove ? "translateY(-100%)" : undefined,
          background: "var(--color-primary-soft)",
          border: "1px solid var(--color-primary)",
          borderRadius: 12,
          padding: 16,
          boxShadow: "var(--shadow-lg, 0 12px 32px -8px rgba(0,0,0,0.35))",
          zIndex: 9999,
        }}
      >
        <div className="row gap-2" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon name="edit" size={14} />
            <strong style={{ fontSize: 14, color: "var(--color-primary)" }}>{step.title}</strong>
          </div>
          <button
            aria-label="Dismiss walkthrough"
            onClick={finish}
            className="btn-icon"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 2, lineHeight: 0 }}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text)", margin: "8px 0 14px" }}>{step.description}</p>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "var(--color-primary)" }}>
            {stepIndex + 1} of {steps.length}
          </span>
          <button
            className="btn btn-primary btn-sm"
            style={{ borderRadius: 999, paddingLeft: 16, paddingRight: 16 }}
            onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
