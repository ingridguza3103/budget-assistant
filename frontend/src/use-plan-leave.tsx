import { useRef, useState } from "react";

export default function usePlanLeave() {
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const [continuation, setContinuation] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  function leave(next: () => void) {
    if (guard.current) setContinuation(() => next);
    else next();
  }
  const prompt = continuation && <dialog className="leave-prompt" role="alertdialog" aria-label="Unsaved plan"
    ref={dialog => {
      if (!dialog || dialog.open) return;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }}
    onCancel={event => { event.preventDefault(); if (!saving) setContinuation(null); }}>
    <strong>Save your changes before leaving?</strong>
    <div className="budget-actions">
      <button autoFocus type="button" disabled={saving} className="secondary-button" onClick={() => setContinuation(null)}>Keep editing</button>
      <button type="button" className="secondary-button" disabled={saving} onClick={() => {
        setContinuation(null); continuation();
      }}>Discard and leave</button>
      <button type="button" className="primary-button budget-primary" disabled={saving} onClick={async () => {
        setSaving(true);
        const ok = guard.current ? await guard.current() : true;
        setSaving(false);
        setContinuation(null);
        if (ok) continuation();
      }}>Save and leave</button>
    </div>
  </dialog>;
  return { guard, leave, prompt };
}
