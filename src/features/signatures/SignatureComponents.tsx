import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { isValidSignature, MAX_SIGNATURE_POINTS } from "../../domain/signature";
import { buildSoldierMovementsWhatsAppMessage, shareOnWhatsApp } from "../../domain/sharing";
import { itemLabel } from "../../domain/schema";
import type { MovementEntry, SignatureData, SignaturePoint, Soldier } from "../../domain/types";
import type { SignatureViewerState } from "../../app/types";
import { displayDate } from "../../app/format";
import whatsappIconUrl from "../../assets/whatsapp.svg";
import { Modal } from "../../components/ui";

export function drawSignature(
  canvas: HTMLCanvasElement,
  strokes: SignaturePoint[][],
) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.strokeStyle = "#173b45";
  context.fillStyle = "#173b45";
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (!stroke.length) return;
    context.beginPath();
    context.moveTo(stroke[0][0] * rect.width, stroke[0][1] * rect.height);
    if (stroke.length === 1) {
      context.arc(
        stroke[0][0] * rect.width,
        stroke[0][1] * rect.height,
        1.2,
        0,
        Math.PI * 2,
      );
      context.fill();
      return;
    }
    stroke.slice(1).forEach((point) =>
      context.lineTo(point[0] * rect.width, point[1] * rect.height),
    );
    context.stroke();
  });
}

export function SignatureCanvas({
  onChange,
}: {
  onChange: (signature: SignatureData) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<SignaturePoint[][]>([]);
  const activePointerRef = useRef<number | null>(null);
  const strokeStartRef = useRef(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawSignature(canvas, strokesRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    redraw();
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): SignaturePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return [
      Number(clamp((event.clientX - rect.left) / rect.width).toFixed(4)),
      Number(clamp((event.clientY - rect.top) / rect.height).toFixed(4)),
      Math.max(0, Math.round(performance.now() - strokeStartRef.current)),
    ];
  };

  const appendPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): void => {
    const stroke = strokesRef.current.at(-1);
    if (!stroke) return;
    const total = strokesRef.current.reduce(
      (count, current) => count + current.length,
      0,
    );
    if (total >= MAX_SIGNATURE_POINTS) return;
    const point = pointFromEvent(event);
    const previous = stroke.at(-1);
    if (
      previous &&
      Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.002
    )
      return;
    stroke.push(point);
    redraw();
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    appendPoint(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    activePointerRef.current = null;
    onChange({
      version: 1,
      strokes: strokesRef.current.map((stroke) => [...stroke]),
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="signature-canvas"
      aria-label="אזור חתימה באצבע"
      onPointerDown={(event) => {
        event.preventDefault();
        if (activePointerRef.current !== null) return;
        activePointerRef.current = event.pointerId;
        strokeStartRef.current = performance.now();
        event.currentTarget.setPointerCapture(event.pointerId);
        strokesRef.current.push([]);
        appendPoint(event);
      }}
      onPointerMove={(event) => {
        if (activePointerRef.current !== event.pointerId) return;
        event.preventDefault();
        appendPoint(event);
      }}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}

export function SignatureModal({
  soldier,
  changeCount,
  saving,
  onClose,
  onConfirm,
}: {
  soldier: Soldier;
  changeCount: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: (signature: SignatureData) => Promise<void>;
}) {
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const valid = signature !== null && isValidSignature(signature);
  const guardedClose = () => {
    if (!saving) onClose();
  };

  return (
    <Modal title="חתימת החייל" onClose={guardedClose}>
      <p className="signature-explanation">
        {soldier.name}, מספר אישי <bdi>{soldier.personalNumber}</bdi>, מאשר/ת
        את {changeCount} השינויים בהחתמה זו.
      </p>
      <p className="signature-instruction">יש לחתום באצבע בתוך המסגרת.</p>
      <SignatureCanvas key={canvasKey} onChange={setSignature} />
      <div className="signature-status" aria-live="polite">
        {valid ? "החתימה נקלטה" : "נדרשת חתימה מלאה לפני השמירה"}
      </div>
      <div className="modal-actions signature-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={saving}
          onClick={guardedClose}
        >
          ביטול
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={saving || !signature}
          onClick={() => {
            setSignature(null);
            setCanvasKey((current) => current + 1);
          }}
        >
          נקה חתימה
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={saving || !valid}
          onClick={() => signature && void onConfirm(signature)}
        >
          {saving ? "שומר..." : "אישור ושמירת ההחתמה"}
        </button>
      </div>
    </Modal>
  );
}

export function SignaturePreview({ signature }: { signature: SignatureData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawSignature(canvas, signature.strokes);
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    redraw();
    return () => observer.disconnect();
  }, [signature]);
  return (
    <canvas
      ref={canvasRef}
      className="signature-canvas signature-preview"
      role="img"
      aria-label="חתימת החייל"
    />
  );
}

export function SignatureViewerModal({
  state,
  onClose,
  onRetry,
}: {
  state: SignatureViewerState;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal title="פרטי החתימה" onClose={onClose}>
      {state.loading && <div className="empty-list">טוען חתימה…</div>}
      {state.error && (
        <div className="signature-load-error">
          <div className="alert error" role="alert">
            {state.error}
          </div>
          <button type="button" className="secondary-button" onClick={onRetry}>
            ניסיון נוסף
          </button>
        </div>
      )}
      {state.record && (
        <>
          <div className="signature-metadata">
            <strong>{state.record.soldierName}</strong>
            <span>
              מספר אישי <bdi>{state.record.personalNumber}</bdi>
            </span>
            <span>{displayDate(state.record.timestamp)}</span>
            <span>בוצע על ידי {state.record.actor || "לא צוין"}</span>
          </div>
          <SignaturePreview signature={state.record.signature} />
          <h3>השינויים שאושרו</h3>
          <div className="history-list signature-change-list">
            {state.record.snapshot.changes.map((change, index) => (
              <article key={`${change.type}-${change.number}-${index}`}>
                <strong>{change.action}</strong>
                <span>
                  {itemLabel(change.type, change.variant)}{" "}
                  {change.number && `· ${change.number}`} {" "}
                  {change.quantity > 0 && `· כמות ${change.quantity}`}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          סגירה
        </button>
      </div>
    </Modal>
  );
}

export function SigningReceiptModal({
  receipt,
  onClose,
}: {
  receipt: { soldier: Soldier; movements: MovementEntry[] };
  onClose: () => void;
}) {
  const { soldier, movements } = receipt;
  const message = buildSoldierMovementsWhatsAppMessage(
    soldier,
    movements,
    "ההחתמה הנוכחית",
  );
  return (
    <Modal title="ההחתמה נשמרה" onClose={onClose}>
      <p>
        כל השינויים נשמרו. ניתן לשלוח ל{soldier.name} אישור הכולל בדיוק את
        הפריטים ששונו בפעולה הזאת.
      </p>
      <div className="history-list share-preview">
        {movements.map((entry, index) => (
          <article key={`${entry.timestamp}-${index}`}>
            <strong>{entry.action}</strong>
            <span>
              {itemLabel(entry.type, entry.variant)} {entry.number}
              {entry.quantity > 0 && ` · כמות ${entry.quantity}`}
            </span>
            <small>בוצע על ידי {entry.actor || "לא צוין"}</small>
          </article>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          סגירה
        </button>
        <button
          type="button"
          className="primary-button whatsapp-send-button"
          onClick={() => shareOnWhatsApp(message, soldier.phone)}
        >
          <img src={whatsappIconUrl} alt="" />
          פתיחה ב-WhatsApp
        </button>
      </div>
    </Modal>
  );
}
