import React, { useState, useRef, useCallback } from "react";
import { Camera, Plus, X, Check, ReceiptText, Users, Split, AlertTriangle, ArrowLeft, ArrowRight, Loader2, ImagePlus, Trash2, RotateCcw } from "lucide-react";

const PERSON_COLORS = ["#B23A2E", "#3F6D5A", "#D9A441", "#5B4B8A", "#2E6E8E", "#8A5A2E", "#6B7A3F"];
const STEPS = ["Photo", "Review", "People", "Assign", "Split"];

const emptyBill = () => ({
  currency: "₹",
  items: [],
  subtotal: 0,
  discount: 0,
  service_charge: 0,
  tax: 0,
  total: 0,
  confidence: {},
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function SplitTheBill() {
  const [step, setStep] = useState(0);
  const [images, setImages] = useState([]);
  const [bill, setBill] = useState(emptyBill());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [people, setPeople] = useState([]);
  const [newPersonName, setNewPersonName] = useState("");
  const [assignments, setAssignments] = useState({});
  const fileInputRef = useRef(null);

  // ---------- Photo handling ----------
  const handleFiles = useCallback(async (fileList) => {
    setError("");

    const files = Array.from(fileList).slice(0, 4);
    const newImgs = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;

      const base64 = await fileToBase64(file);

      newImgs.push({
        id: uid(),
        previewUrl: URL.createObjectURL(file),
        base64,
        mediaType: file.type,
      });
    }

    setImages((prev) => [...prev, ...newImgs]);
  }, []);

  const removeImage = (id) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
  };

  // ---------- Local OCR Bill Extraction ----------
  const extractBill = async () => {
    if (images.length === 0) {
      setError("Add at least one photo of the bill first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();

      for (const img of images) {
        const blob = await fetch(img.previewUrl).then((r) => r.blob());
        formData.append("files", blob, `bill-${img.id}.jpg`);
      }

      const response = await fetch("http://127.0.0.1:8000/api/extract", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || `OCR request failed (${response.status}).`);
      }

      const items = (data.items || []).map((it) => ({
        id: uid(),
        name: it.name || "Unnamed item",
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0,
        confidence: it.confidence || "medium",
      }));

      setBill({
        currency: data.currency || "₹",
        items,
        subtotal: Number(data.subtotal) || 0,
        discount: Number(data.discount) || 0,
        service_charge: Number(data.service_charge) || 0,
        tax: Number(data.tax) || 0,
        total: Number(data.total) || 0,
        confidence: data.confidence || {},
      });

      if (!items.length) {
        setError("I could not confidently detect item lines. Add them manually on the review screen.");
      }

      setStep(1);
    } catch (e) {
      console.error("Bill extraction failed:", e);
      setError(
        e?.message ||
          "Couldn't read that photo. You can still add the numbers manually on the review screen."
      );
      setBill(emptyBill());
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Bill editing ----------
  const updateItem = (id, patch) =>
    setBill((b) => ({
      ...b,
      items: b.items.map((it) =>
        it.id === id
          ? { ...it, ...patch }
          : it
      ),
    }));

  const removeItem = (id) =>
    setBill((b) => ({
      ...b,
      items: b.items.filter(
        (it) => it.id !== id
      ),
    }));

  const addItem = () =>
    setBill((b) => ({
      ...b,
      items: [
        ...b.items,
        {
          id: uid(),
          name: "New item",
          quantity: 1,
          price: 0,
          confidence: "high",
        },
      ],
    }));

  const itemsSum = round2(
    bill.items.reduce(
      (s, it) =>
        s + (Number(it.price) || 0),
      0
    )
  );

  const computedTotal = round2(
    itemsSum -
      Number(bill.discount || 0) +
      Number(bill.service_charge || 0) +
      Number(bill.tax || 0)
  );

  const totalMismatch =
    Math.abs(
      computedTotal -
        Number(bill.total || 0)
    ) > 0.5;

  const subtotalMismatch =
    bill.subtotal > 0 &&
    Math.abs(
      itemsSum -
        Number(bill.subtotal)
    ) > 0.5;

  // ---------- People ----------
  const addPerson = () => {
    const name = newPersonName.trim();

    if (!name) return;

    setPeople((p) => [
      ...p,
      {
        id: uid(),
        name,
        color:
          PERSON_COLORS[
            p.length %
              PERSON_COLORS.length
          ],
      },
    ]);

    setNewPersonName("");
  };

  const removePerson = (id) => {
    setPeople((p) =>
      p.filter((x) => x.id !== id)
    );

    setAssignments((a) => {
      const next = {};

      for (const k in a) {
        next[k] = a[k].filter(
          (pid) => pid !== id
        );
      }

      return next;
    });
  };

  // ---------- Assignment ----------
  const toggleAssign = (
    itemId,
    personId
  ) =>
    setAssignments((a) => {
      const current =
        a[itemId] || [];

      const has =
        current.includes(personId);

      return {
        ...a,
        [itemId]: has
          ? current.filter(
              (p) => p !== personId
            )
          : [...current, personId],
      };
    });

  const assignEveryone = (itemId) =>
    setAssignments((a) => ({
      ...a,
      [itemId]: people.map(
        (p) => p.id
      ),
    }));

  const clearAssign = (itemId) =>
    setAssignments((a) => ({
      ...a,
      [itemId]: [],
    }));

  const unassignedItems =
    bill.items.filter(
      (it) =>
        !(assignments[it.id] || [])
          .length
    );

  // ---------- Split math ----------
  const extra = round2(
    Number(bill.tax || 0) +
      Number(
        bill.service_charge || 0
      ) -
      Number(bill.discount || 0)
  );

  const rawByPerson = {};

  people.forEach(
    (p) =>
      (rawByPerson[p.id] = 0)
  );

  const itemBreakdownByPerson =
    {};

  people.forEach(
    (p) =>
      (itemBreakdownByPerson[
        p.id
      ] = [])
  );

  bill.items.forEach((it) => {
    const assigned =
      assignments[it.id] || [];

    if (!assigned.length) return;

    const share = round2(
      Number(it.price || 0) /
        assigned.length
    );

    assigned.forEach((pid) => {
      rawByPerson[pid] =
        round2(
          (rawByPerson[pid] || 0) +
            share
        );

      if (
        itemBreakdownByPerson[pid]
      ) {
        itemBreakdownByPerson[
          pid
        ].push({
          name: it.name,
          share,
          splitWith:
            assigned.length,
        });
      }
    });
  });

  const totalRaw = round2(
    Object.values(rawByPerson).reduce(
      (s, v) => s + v,
      0
    )
  );

  const results = people.map(
    (p) => {
      const raw =
        rawByPerson[p.id] || 0;

      const proportion =
        totalRaw > 0
          ? raw / totalRaw
          : 0;

      const extraShare = round2(
        proportion * extra
      );

      return {
        ...p,
        raw,
        extraShare,
        final: round2(
          raw + extraShare
        ),
        items:
          itemBreakdownByPerson[
            p.id
          ],
      };
    }
  );

  // Fix rounding drift on the last person
  const grandTotal = round2(
    totalRaw + extra
  );

  const sumFinal = round2(
    results.reduce(
      (s, r) => s + r.final,
      0
    )
  );

  if (
    results.length &&
    Math.abs(
      sumFinal - grandTotal
    ) >= 0.01
  ) {
    const diff = round2(
      grandTotal - sumFinal
    );

    results[
      results.length - 1
    ].final = round2(
      results[
        results.length - 1
      ].final + diff
    );
  }

  const reset = () => {
    setStep(0);
    setImages([]);
    setBill(emptyBill());
    setPeople([]);
    setAssignments({});
    setError("");
  };

  const canGoAssign =
    people.length >= 2 &&
    bill.items.length > 0;

  return (
    <div className="stb-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');

        .stb-root {
          --ink: #22291f;
          --ink-soft: #58604f;
          --paper: #fbf7ee;
          --paper-line: #d8d1bd;
          --bg: #14302b;
          --bg-soft: #1c3c35;
          --turmeric: #d9a441;
          --chili: #b23a2e;
          --teal: #3f6d5a;
          font-family: 'Inter', sans-serif;
          background: var(--bg);
          background-image: radial-gradient(circle at 20% -10%, var(--bg-soft), var(--bg) 60%);
          min-height: 100vh;
          color: var(--ink);
          padding: 32px 16px 64px;
          display: flex;
          justify-content: center;
        }

        .stb-shell {
          width: 100%;
          max-width: 640px;
        }

        .stb-hero {
          text-align: center;
          margin-bottom: 28px;
        }

        .stb-hero h1 {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 2.1rem;
          color: #fbf7ee;
          margin: 0 0 6px;
          letter-spacing: -0.01em;
        }

        .stb-hero p {
          color: #b9c9c0;
          font-size: 0.95rem;
          margin: 0;
          max-width: 420px;
          margin-inline: auto;
        }

        .stb-steps {
          display: flex;
          justify-content: center;
          gap: 6px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }

        .stb-step-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          color: #9db3a8;
          padding: 5px 10px 5px 6px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
        }

        .stb-step-pill.active {
          background: var(--turmeric);
          color: #2a2113;
          border-color: var(--turmeric);
          font-weight: 600;
        }

        .stb-step-pill.done {
          color: #dcead0;
        }

        .stb-step-dot {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.68rem;
          background: rgba(255,255,255,0.12);
        }

        .stb-step-pill.active .stb-step-dot {
          background: rgba(0,0,0,0.15);
        }

        .stb-step-pill.done .stb-step-dot {
          background: var(--teal);
          color: #eaf3ec;
        }

        .stb-card {
          background: var(--paper);
          border-radius: 4px;
          padding: 28px 26px;
          position: relative;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.5);
        }

        .stb-card::before,
        .stb-card::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          height: 10px;
          background-image:
            linear-gradient(135deg, var(--bg) 50%, transparent 50%),
            linear-gradient(45deg, var(--bg) 50%, transparent 50%);
          background-size: 16px 16px;
          background-repeat: repeat-x;
        }

        .stb-card::before {
          top: -10px;
        }

        .stb-card::after {
          bottom: -10px;
          transform: rotate(180deg);
        }

        .stb-section-title {
          font-family: 'Fraunces', serif;
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0 0 4px;
        }

        .stb-section-sub {
          color: var(--ink-soft);
          font-size: 0.88rem;
          margin: 0 0 18px;
        }

        .stb-dropzone {
          border: 1.5px dashed var(--paper-line);
          border-radius: 10px;
          padding: 30px 16px;
          text-align: center;
          cursor: pointer;
          transition:
            border-color 0.15s,
            background 0.15s;
        }

        .stb-dropzone:hover {
          border-color: var(--turmeric);
          background: rgba(217,164,65,0.06);
        }

        .stb-dropzone svg {
          color: var(--teal);
          margin-bottom: 8px;
        }

        .stb-dropzone .stb-drop-title {
          font-weight: 600;
          font-size: 0.95rem;
        }

        .stb-dropzone .stb-drop-sub {
          color: var(--ink-soft);
          font-size: 0.82rem;
          margin-top: 3px;
        }

        .stb-thumbs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .stb-thumb {
          position: relative;
          width: 84px;
          height: 84px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--paper-line);
        }

        .stb-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .stb-thumb button {
          position: absolute;
          top: 3px;
          right: 3px;
          background: rgba(20,48,43,0.85);
          border: none;
          color: #fff;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .stb-thumb-add {
          width: 84px;
          height: 84px;
          border-radius: 8px;
          border: 1.5px dashed var(--paper-line);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--teal);
        }

        .stb-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 0.9rem;
          border: none;
          border-radius: 8px;
          padding: 11px 18px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition:
            transform 0.08s,
            opacity 0.15s;
        }

        .stb-btn:active {
          transform: scale(0.98);
        }

        .stb-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .stb-btn-primary {
          background: var(--chili);
          color: #fbf7ee;
        }

        .stb-btn-primary:hover:not(:disabled) {
          background: #99312a;
        }

        .stb-btn-ghost {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--paper-line);
        }

        .stb-btn-ghost:hover {
          border-color: var(--ink-soft);
        }

        .stb-btn-row {
          display: flex;
          justify-content: space-between;
          margin-top: 24px;
          gap: 10px;
        }

        .stb-error {
          background: rgba(178,58,46,0.1);
          border: 1px solid rgba(178,58,46,0.35);
          color: var(--chili);
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 0.85rem;
          margin-top: 14px;
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }

        .stb-item-row {
          display: grid;
          grid-template-columns: 1fr 52px 90px 30px;
          gap: 8px;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid var(--paper-line);
        }

        .stb-item-row input {
          font-family: 'Inter', sans-serif;
          border: 1px solid transparent;
          background: transparent;
          border-radius: 6px;
          padding: 6px 7px;
          font-size: 0.88rem;
          color: var(--ink);
          width: 100%;
        }

        .stb-item-row input:hover,
        .stb-item-row input:focus {
          border-color: var(--paper-line);
          background: #fff;
          outline: none;
        }

        .stb-item-row input.stb-num {
          font-family: 'Space Mono', monospace;
          text-align: right;
        }

        .stb-item-row.low-conf input {
          border-color: var(--turmeric);
          border-style: dashed;
        }

        .stb-conf-note {
          font-size: 0.68rem;
          color: var(--turmeric);
          font-family: 'Inter';
          grid-column: 1 / -1;
          margin-top: -4px;
          margin-bottom: 2px;
        }

        .stb-item-del {
          background: none;
          border: none;
          color: var(--ink-soft);
          cursor: pointer;
          display: flex;
        }

        .stb-item-del:hover {
          color: var(--chili);
        }

        .stb-totals {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1.5px solid var(--ink);
        }

        .stb-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 0;
          font-size: 0.88rem;
        }

        .stb-total-row label {
          color: var(--ink-soft);
        }

        .stb-total-row input {
          font-family: 'Space Mono', monospace;
          text-align: right;
          width: 100px;
          border: 1px solid var(--paper-line);
          border-radius: 6px;
          padding: 5px 8px;
          background: #fff;
        }

        .stb-total-row.grand {
          font-weight: 700;
          font-size: 1rem;
          padding-top: 10px;
          border-top: 1px dashed var(--paper-line);
          margin-top: 6px;
        }

        .stb-total-row.low-conf input {
          border-color: var(--turmeric);
          border-style: dashed;
        }

        .stb-add-item {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--teal);
          font-size: 0.85rem;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 0;
        }

        .stb-warn {
          background: rgba(217,164,65,0.14);
          border: 1px solid rgba(217,164,65,0.5);
          color: #7a5a12;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 0.83rem;
          margin-top: 16px;
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }

        .stb-people-input {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .stb-people-input input {
          flex: 1;
          border: 1px solid var(--paper-line);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: 'Inter';
          font-size: 0.9rem;
          background: #fff;
        }

        .stb-people-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .stb-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px 7px 8px;
          border-radius: 999px;
          background: #fff;
          border: 1px solid var(--paper-line);
        }

        .stb-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 700;
          font-family: 'Fraunces', serif;
          flex-shrink: 0;
        }

        .stb-chip span {
          font-size: 0.85rem;
        }

        .stb-chip button {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ink-soft);
          display: flex;
        }

        .stb-chip button:hover {
          color: var(--chili);
        }

        .stb-assign-item {
          padding: 14px 0;
          border-bottom: 1px solid var(--paper-line);
        }

        .stb-assign-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 8px;
        }

        .stb-assign-head .name {
          font-weight: 600;
          font-size: 0.92rem;
        }

        .stb-assign-head .price {
          font-family: 'Space Mono', monospace;
          font-size: 0.85rem;
          color: var(--ink-soft);
        }

        .stb-avatar-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }

        .stb-avatar-btn {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 2px solid transparent;
          color: #fff;
          font-size: 0.75rem;
          font-weight: 700;
          font-family: 'Fraunces', serif;
          cursor: pointer;
          opacity: 0.35;
          transition:
            opacity 0.12s,
            transform 0.1s,
            border-color .12s;
        }

        .stb-avatar-btn.on {
          opacity: 1;
          border-color: var(--ink);
          transform: scale(1.05);
        }

        .stb-mini-link {
          font-size: 0.74rem;
          color: var(--teal);
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
          padding: 2px 4px;
        }

        .stb-share-note {
          font-size: 0.74rem;
          color: var(--ink-soft);
          margin-top: 4px;
        }

        .stb-person-card {
          background: #fff;
          border: 1px solid var(--paper-line);
          border-radius: 10px;
          padding: 16px 18px;
          margin-bottom: 14px;
        }

        .stb-person-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .stb-person-head .pname {
          font-weight: 700;
          font-family: 'Fraunces', serif;
          font-size: 1.05rem;
        }

        .stb-person-line {
          display: flex;
          justify-content: space-between;
          font-size: 0.83rem;
          padding: 3px 0;
          color: var(--ink-soft);
        }

        .stb-person-line .val {
          font-family: 'Space Mono', monospace;
          color: var(--ink);
        }

        .stb-person-total {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px dashed var(--paper-line);
          font-weight: 700;
          font-size: 1rem;
        }

        .stb-person-total .val {
          font-family: 'Space Mono', monospace;
        }

        .stb-grand {
          text-align: center;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1.5px solid var(--ink);
        }

        .stb-grand .amt {
          font-family: 'Fraunces', serif;
          font-size: 2rem;
          font-weight: 700;
        }

        .stb-grand .lab {
          color: var(--ink-soft);
          font-size: 0.85rem;
        }

        .stb-restart {
          display: flex;
          justify-content: center;
          margin-top: 18px;
        }

        .stb-restart button {
          background: none;
          border: none;
          color: #b9c9c0;
          font-size: 0.82rem;
          display: flex;
          gap: 6px;
          align-items: center;
          cursor: pointer;
        }

        .stb-restart button:hover {
          color: #fff;
        }
      `}</style>

      <div className="stb-shell">

        <div className="stb-hero">
          <h1>Split the Bill</h1>
          <p>
            Photograph the receipt, say who ate what,
            get the number everyone can agree on.
          </p>
        </div>

        <div className="stb-steps">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`stb-step-pill ${
                i === step
                  ? "active"
                  : i < step
                  ? "done"
                  : ""
              }`}
            >
              <span className="stb-step-dot">
                {i < step ? (
                  <Check size={10} />
                ) : (
                  i + 1
                )}
              </span>

              {s}
            </div>
          ))}
        </div>

        <div className="stb-card">

          {/* STEP 0: PHOTO */}
          {step === 0 && (
            <>
              <h2 className="stb-section-title">
                Photograph the bill
              </h2>

              <p className="stb-section-sub">
                One clear photo is usually enough.
                Add a second if the bill is long or
                a corner got cut off.
              </p>

              <div
                className="stb-dropzone"
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >
                <Camera size={28} />

                <div className="stb-drop-title">
                  Tap to add a photo
                </div>

                <div className="stb-drop-sub">
                  JPG or PNG, up to 4 pages
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) =>
                  handleFiles(e.target.files)
                }
              />

              {images.length > 0 && (
                <div className="stb-thumbs">
                  {images.map((img) => (
                    <div
                      className="stb-thumb"
                      key={img.id}
                    >
                      <img
                        src={img.previewUrl}
                        alt="bill"
                      />

                      <button
                        onClick={() =>
                          removeImage(img.id)
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  <div
                    className="stb-thumb-add"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                  >
                    <ImagePlus size={20} />
                  </div>
                </div>
              )}

              {error && (
                <div className="stb-error">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              <div
                className="stb-btn-row"
                style={{
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="stb-btn stb-btn-primary"
                  onClick={extractBill}
                  disabled={
                    loading ||
                    images.length === 0
                  }
                >
                  {loading ? (
                    <Loader2
                      size={16}
                      style={{
                        animation:
                          "spin 0.8s linear infinite",
                      }}
                    />
                  ) : (
                    <ReceiptText size={16} />
                  )}

                  {loading
                    ? "Reading the bill…"
                    : "Read the bill"}
                </button>
              </div>

              <style>{`
                @keyframes spin {
                  to {
                    transform: rotate(360deg);
                  }
                }
              `}</style>
            </>
          )}

          {/* STEP 1: REVIEW */}
          {step === 1 && (
            <>
              <h2 className="stb-section-title">
                Check what it read
              </h2>

              <p className="stb-section-sub">
                Dashed amber fields are the model's
                low-confidence guesses — worth a second
                look before the math runs.
              </p>

              {error && (
                <div className="stb-error">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              )}

              <div>
                <div
                  className="stb-item-row"
                  style={{
                    borderBottom:
                      "2px solid var(--ink)",
                    fontSize: "0.72rem",
                    color: "var(--ink-soft)",
                    fontWeight: 600,
                  }}
                >
                  <div>ITEM</div>
                  <div
                    style={{
                      textAlign: "right",
                    }}
                  >
                    QTY
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                    }}
                  >
                    PRICE
                  </div>
                  <div></div>
                </div>

                {bill.items.map((it) => (
                  <React.Fragment key={it.id}>
                    <div
                      className={`stb-item-row ${
                        it.confidence === "low"
                          ? "low-conf"
                          : ""
                      }`}
                    >
                      <input
                        value={it.name}
                        onChange={(e) =>
                          updateItem(
                            it.id,
                            {
                              name:
                                e.target.value,
                            }
                          )
                        }
                      />

                      <input
                        className="stb-num"
                        type="number"
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(
                            it.id,
                            {
                              quantity:
                                e.target.value,
                            }
                          )
                        }
                      />

                      <input
                        className="stb-num"
                        type="number"
                        step="0.01"
                        value={it.price}
                        onChange={(e) =>
                          updateItem(
                            it.id,
                            {
                              price:
                                e.target.value,
                            }
                          )
                        }
                      />

                      <button
                        className="stb-item-del"
                        onClick={() =>
                          removeItem(it.id)
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {it.confidence ===
                      "low" && (
                      <div className="stb-conf-note">
                        Low confidence —
                        double-check this line
                      </div>
                    )}
                  </React.Fragment>
                ))}

                {bill.items.length === 0 && (
                  <p
                    style={{
                      color:
                        "var(--ink-soft)",
                      fontSize:
                        "0.85rem",
                      padding:
                        "14px 0",
                    }}
                  >
                    No items yet — add them
                    by hand below.
                  </p>
                )}

                <button
                  className="stb-add-item"
                  onClick={addItem}
                >
                  <Plus size={14} />
                  Add item
                </button>
              </div>

              <div className="stb-totals">

                <div
                  className={`stb-total-row ${
                    bill.confidence?.subtotal ===
                    "low"
                      ? "low-conf"
                      : ""
                  }`}
                >
                  <label>
                    Subtotal (as printed)
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={bill.subtotal}
                    onChange={(e) =>
                      setBill((b) => ({
                        ...b,
                        subtotal:
                          e.target.value,
                      }))
                    }
                  />
                </div>

                <div
                  className={`stb-total-row ${
                    bill.confidence?.discount ===
                    "low"
                      ? "low-conf"
                      : ""
                  }`}
                >
                  <label>
                    Discount
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={bill.discount}
                    onChange={(e) =>
                      setBill((b) => ({
                        ...b,
                        discount:
                          e.target.value,
                      }))
                    }
                  />
                </div>

                <div
                  className={`stb-total-row ${
                    bill.confidence?.service_charge ===
                    "low"
                      ? "low-conf"
                      : ""
                  }`}
                >
                  <label>
                    Service charge
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={
                      bill.service_charge
                    }
                    onChange={(e) =>
                      setBill((b) => ({
                        ...b,
                        service_charge:
                          e.target.value,
                      }))
                    }
                  />
                </div>

                <div
                  className={`stb-total-row ${
                    bill.confidence?.tax ===
                    "low"
                      ? "low-conf"
                      : ""
                  }`}
                >
                  <label>
                    GST / tax
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={bill.tax}
                    onChange={(e) =>
                      setBill((b) => ({
                        ...b,
                        tax:
                          e.target.value,
                      }))
                    }
                  />
                </div>

                <div
                  className={`stb-total-row grand ${
                    bill.confidence?.total ===
                    "low"
                      ? "low-conf"
                      : ""
                  }`}
                >
                  <label>
                    Printed total
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={bill.total}
                    onChange={(e) =>
                      setBill((b) => ({
                        ...b,
                        total:
                          e.target.value,
                      }))
                    }
                  />
                </div>

              </div>

              {subtotalMismatch && (
                <div className="stb-warn">
                  <AlertTriangle size={15} />
                  Items add up to{" "}
                  {bill.currency}
                  {itemsSum.toFixed(2)},
                  but the printed subtotal
                  says{" "}
                  {bill.currency}
                  {Number(
                    bill.subtotal
                  ).toFixed(2)}.
                  Worth a re-check for a
                  missed or misread line.
                </div>
              )}

              {totalMismatch && (
                <div className="stb-warn">
                  <AlertTriangle size={15} />
                  The math comes to{" "}
                  {bill.currency}
                  {computedTotal.toFixed(2)},
                  but the printed total says{" "}
                  {bill.currency}
                  {Number(
                    bill.total
                  ).toFixed(2)}.
                  Some bills just print it
                  wrong — we'll split based
                  on the math above, not the
                  printed number.
                </div>
              )}

              <div className="stb-btn-row">
                <button
                  className="stb-btn stb-btn-ghost"
                  onClick={() =>
                    setStep(0)
                  }
                >
                  <ArrowLeft size={16} />
                  Back
                </button>

                <button
                  className="stb-btn stb-btn-primary"
                  onClick={() =>
                    setStep(2)
                  }
                  disabled={
                    bill.items.length ===
                    0
                  }
                >
                  Next: who's here
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* STEP 2: PEOPLE */}
          {step === 2 && (
            <>
              <h2 className="stb-section-title">
                Who's splitting this?
              </h2>

              <p className="stb-section-sub">
                Add everyone who ate — even
                the one who left early. They
                just won't get assigned anything.
              </p>

              <div className="stb-people-input">
                <input
                  placeholder="Add a name"
                  value={newPersonName}
                  onChange={(e) =>
                    setNewPersonName(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    addPerson()
                  }
                />

                <button
                  className="stb-btn stb-btn-primary"
                  onClick={addPerson}
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              <div className="stb-people-list">
                {people.map((p) => (
                  <div
                    className="stb-chip"
                    key={p.id}
                  >
                    <div
                      className="stb-avatar"
                      style={{
                        background:
                          p.color,
                      }}
                    >
                      {p.name[0]?.toUpperCase()}
                    </div>

                    <span>
                      {p.name}
                    </span>

                    <button
                      onClick={() =>
                        removePerson(
                          p.id
                        )
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}

                {people.length === 0 && (
                  <p
                    style={{
                      color:
                        "var(--ink-soft)",
                      fontSize:
                        "0.85rem",
                    }}
                  >
                    Nobody added yet.
                  </p>
                )}
              </div>

              <div className="stb-btn-row">
                <button
                  className="stb-btn stb-btn-ghost"
                  onClick={() =>
                    setStep(1)
                  }
                >
                  <ArrowLeft size={16} />
                  Back
                </button>

                <button
                  className="stb-btn stb-btn-primary"
                  onClick={() =>
                    setStep(3)
                  }
                  disabled={
                    !canGoAssign
                  }
                >
                  <Users size={16} />
                  Next: assign items
                  <ArrowRight size={16} />
                </button>
              </div>

              {people.length === 1 && (
                <p
                  style={{
                    color:
                      "var(--chili)",
                    fontSize:
                      "0.8rem",
                    marginTop: 8,
                  }}
                >
                  Add at least one
                  more person.
                </p>
              )}
            </>
          )}

          {/* STEP 3: ASSIGN */}
          {step === 3 && (
            <>
              <h2 className="stb-section-title">
                Who ate what?
              </h2>

              <p className="stb-section-sub">
                Tap everyone who shared an
                item. Shared items split evenly
                between whoever's lit up.
              </p>

              {bill.items.map((it) => {
                const assigned =
                  assignments[it.id] ||
                  [];

                return (
                  <div
                    className="stb-assign-item"
                    key={it.id}
                  >
                    <div className="stb-assign-head">
                      <span className="name">
                        {it.name}
                        {it.quantity > 1
                          ? ` ×${it.quantity}`
                          : ""}
                      </span>

                      <span className="price">
                        {bill.currency}
                        {Number(
                          it.price
                        ).toFixed(2)}
                      </span>
                    </div>

                    <div className="stb-avatar-row">
                      {people.map((p) => (
                        <button
                          key={p.id}
                          className={`stb-avatar-btn ${
                            assigned.includes(
                              p.id
                            )
                              ? "on"
                              : ""
                          }`}
                          style={{
                            background:
                              p.color,
                          }}
                          onClick={() =>
                            toggleAssign(
                              it.id,
                              p.id
                            )
                          }
                          title={p.name}
                        >
                          {p.name[0]?.toUpperCase()}
                        </button>
                      ))}

                      <button
                        className="stb-mini-link"
                        onClick={() =>
                          assignEveryone(
                            it.id
                          )
                        }
                      >
                        everyone
                      </button>

                      {assigned.length >
                        0 && (
                        <button
                          className="stb-mini-link"
                          onClick={() =>
                            clearAssign(
                              it.id
                            )
                          }
                        >
                          clear
                        </button>
                      )}
                    </div>

                    {assigned.length >
                      0 && (
                      <div className="stb-share-note">
                        Split{" "}
                        {assigned.length ===
                        1
                          ? "entirely by"
                          : `${assigned.length} ways between`}{" "}
                        {assigned
                          .map(
                            (id) =>
                              people.find(
                                (p) =>
                                  p.id ===
                                  id
                              )?.name
                          )
                          .join(", ")}{" "}
                        —{" "}
                        {bill.currency}
                        {round2(
                          it.price /
                            assigned.length
                        ).toFixed(2)}{" "}
                        each
                      </div>
                    )}
                  </div>
                );
              })}

              {unassignedItems.length >
                0 && (
                <div className="stb-warn">
                  <AlertTriangle size={15} />
                  {unassignedItems.length}{" "}
                  item
                  {unassignedItems.length >
                  1
                    ? "s"
                    : ""}{" "}
                  still unassigned —{" "}
                  {unassignedItems
                    .map(
                      (i) =>
                        i.name
                    )
                    .join(", ")}.
                  Unassigned items won't
                  be included in the split.
                </div>
              )}

              <div className="stb-btn-row">
                <button
                  className="stb-btn stb-btn-ghost"
                  onClick={() =>
                    setStep(2)
                  }
                >
                  <ArrowLeft size={16} />
                  Back
                </button>

                <button
                  className="stb-btn stb-btn-primary"
                  onClick={() =>
                    setStep(4)
                  }
                >
                  <Split size={16} />
                  See the split
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* STEP 4: RESULT */}
          {step === 4 && (
            <>
              <h2 className="stb-section-title">
                Here's what everyone owes
              </h2>

              <p className="stb-section-sub">
                Tax, service charge and
                discount are spread in
                proportion to what each person
                actually ate — not divided by{" "}
                {people.length}.
              </p>

              {results.map((r) => (
                <div
                  className="stb-person-card"
                  key={r.id}
                >
                  <div className="stb-person-head">
                    <div
                      className="stb-avatar"
                      style={{
                        background:
                          r.color,
                      }}
                    >
                      {r.name[0]?.toUpperCase()}
                    </div>

                    <span className="pname">
                      {r.name}
                    </span>
                  </div>

                  {r.items.length ===
                  0 ? (
                    <div className="stb-person-line">
                      <span>
                        Didn't have
                        anything assigned
                      </span>
                    </div>
                  ) : (
                    r.items.map(
                      (it, i) => (
                        <div
                          className="stb-person-line"
                          key={i}
                        >
                          <span>
                            {it.name}
                            {it.splitWith >
                            1
                              ? ` (÷${it.splitWith})`
                              : ""}
                          </span>

                          <span className="val">
                            {bill.currency}
                            {it.share.toFixed(
                              2
                            )}
                          </span>
                        </div>
                      )
                    )
                  )}

                  {extra !== 0 &&
                    r.raw > 0 && (
                      <div className="stb-person-line">
                        <span>
                          Tax &amp; service
                          (their share)
                        </span>

                        <span className="val">
                          {bill.currency}
                          {r.extraShare.toFixed(
                            2
                          )}
                        </span>
                      </div>
                    )}

                  <div className="stb-person-total">
                    <span>
                      Owes
                    </span>

                    <span className="val">
                      {bill.currency}
                      {r.final.toFixed(
                        2
                      )}
                    </span>
                  </div>
                </div>
              ))}

              <div className="stb-grand">
                <div className="amt">
                  {bill.currency}
                  {grandTotal.toFixed(
                    2
                  )}
                </div>

                <div className="lab">
                  total split across{" "}
                  {people.length} people
                </div>
              </div>

              {totalMismatch && (
                <div
                  className="stb-warn"
                  style={{
                    marginTop: 16,
                  }}
                >
                  <AlertTriangle
                    size={15}
                  />

                  Heads up: this differs
                  from the bill's printed
                  total of{" "}
                  {bill.currency}
                  {Number(
                    bill.total
                  ).toFixed(2)}{" "}
                  — the split above uses
                  the actual line items and
                  taxes, which we trust more
                  than a possibly misprinted
                  total.
                </div>
              )}

              <div className="stb-btn-row">
                <button
                  className="stb-btn stb-btn-ghost"
                  onClick={() =>
                    setStep(3)
                  }
                >
                  <ArrowLeft size={16} />
                  Back to assign
                </button>

                <div />
              </div>
            </>
          )}

        </div>

        <div className="stb-restart">
          <button onClick={reset}>
            <RotateCcw size={13} />
            Start over with a new bill
          </button>
        </div>

      </div>
    </div>
  );
}