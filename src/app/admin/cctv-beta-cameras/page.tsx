"use client";

import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../AdminLayout";
import { useLanguage } from "@/lib/language-context";

interface Campaign {
  _id: string;
  name: string;
}

interface CheckpointOption {
  _id: string;
  name: string;
  type: string;
  orderNum: number;
}

interface BetaCamera {
  _id: string;
  name: string;
  campaignId: string;
  checkpointId?: string;
  checkpointName?: string;
  coverageZone?: string;
  streamKey: string;
  ingestRtmpUrl: string;
  ingestRtmpServer?: string;
  ingestSrtUrl: string;
  hlsUrl: string;
  webrtcUrl: string;
  status: "online" | "offline" | "publishing";
  resolution: string;
  preferredProtocol: "srt" | "rtmp";
  autoRecord: boolean;
  lastPublishAt?: string;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined")
    return { "Content-Type": "application/json" };
  const token = window.localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function CctvBetaCamerasPage() {
  const { language } = useLanguage();
  const th = language === "th";
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [checkpoints, setCheckpoints] = useState<CheckpointOption[]>([]);
  const [cameras, setCameras] = useState<BetaCamera[]>([]);
  const [loading, setLoading] = useState(false);
  const [showQrFor, setShowQrFor] = useState<BetaCamera | null>(null);
  const [qrApp, setQrApp] = useState<"larix" | "irlpro">("larix");
  const [copiedKey, setCopiedKey] = useState("");
  const [form, setForm] = useState({
    name: "",
    checkpointId: "",
    checkpointName: "",
    preferredProtocol: "srt" as "srt" | "rtmp",
    autoRecord: true,
  });
  // Edit modal state. When set, the modal opens populated with this camera's data.
  const [editing, setEditing] = useState<BetaCamera | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    checkpointId: "",
    checkpointName: "",
    preferredProtocol: "srt" as "srt" | "rtmp",
    autoRecord: true,
  });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns/featured", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?._id) {
          setSelectedCampaign(d._id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCampaign) return;
    fetch(`/api/checkpoints/campaign/${selectedCampaign}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCheckpoints(Array.isArray(d) ? d : []))
      .catch(() => setCheckpoints([]));
  }, [selectedCampaign]);

  const load = useCallback(async () => {
    if (!selectedCampaign) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/cctv-beta/cameras?campaignId=${selectedCampaign}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setCameras(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [selectedCampaign]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!selectedCampaign || !form.name.trim()) return;
    const payload: Record<string, unknown> = {
      campaignId: selectedCampaign,
      name: form.name.trim(),
      preferredProtocol: form.preferredProtocol,
      autoRecord: form.autoRecord,
    };
    if (form.checkpointId) payload.checkpointId = form.checkpointId;
    if (form.checkpointName) payload.checkpointName = form.checkpointName;
    const res = await fetch("/api/cctv-beta/cameras", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setForm({
        name: "",
        checkpointId: "",
        checkpointName: "",
        preferredProtocol: "srt",
        autoRecord: true,
      });
      load();
    } else {
      const txt = await res.text().catch(() => "");
      alert(`Create failed (${res.status}) ${txt}`);
    }
  };

  const copyText = async (value: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      return true;
    } catch {
      return false;
    }
  };

  const copyField = async (cam: BetaCamera, field: string, value: string) => {
    const ok = await copyText(value);
    if (!ok) {
      alert(th ? "คัดลอกไม่สำเร็จ" : "Failed to copy");
      return;
    }
    setCopiedKey(`${cam._id}:${field}`);
    setTimeout(() => setCopiedKey(""), 1800);
  };

  const rtmpServerOf = (cam: BetaCamera) =>
    cam.ingestRtmpServer ||
    cam.ingestRtmpUrl.replace(new RegExp(`/${cam.streamKey}$`), "");

  /**
   * Build the Larix Grove query string (`conn[][url]=...&conn[][name]=...&...`) that
   * both Larix Broadcaster and IRL Pro consume for auto-import.
   * See: https://softvelum.com/larix/grove/
   * See: https://kb.irltoolkit.com/nodrop/3-streaming-devices/1-irlpro
   */
  const buildLarixGroveParams = (cam: BetaCamera): string => {
    const params = new URLSearchParams();
    const connName = `${cam.name}${cam.checkpointName ? ` (${cam.checkpointName})` : ""}`;

    if (cam.preferredProtocol === "srt") {
      // Split SRT URL: send the bare server URL, then streamid as its own param.
      let bareUrl = cam.ingestSrtUrl;
      let streamId = `publish:live/${cam.streamKey}`;
      try {
        const u = new URL(cam.ingestSrtUrl);
        const sid = u.searchParams.get("streamid");
        if (sid) streamId = sid;
        u.searchParams.delete("streamid");
        u.searchParams.delete("pkt_size");
        bareUrl = u.toString();
      } catch {
        /* fall back to raw URL */
      }
      params.append("conn[][url]", bareUrl);
      params.append("conn[][name]", connName);
      params.append("conn[][mode]", "va");
      params.append("conn[][srtmode]", "c"); // caller / push
      params.append("conn[][srtstreamid]", streamId);
      params.append("conn[][srtlatency]", "2000");
      params.append("conn[][overwrite]", "on");
      params.append("conn[][active]", "on");
    } else {
      // RTMP: server + key are encoded together in the URL
      params.append("conn[][url]", cam.ingestRtmpUrl);
      params.append("conn[][name]", connName);
      params.append("conn[][mode]", "va");
      params.append("conn[][target]", "rtmp");
      params.append("conn[][overwrite]", "on");
      params.append("conn[][active]", "on");
    }
    return params.toString();
  };

  /**
   * Larix-only deep link.
   * If Larix Broadcaster is installed, scanning this QR opens it directly.
   */
  const buildLarixDeepLink = (cam: BetaCamera): string => {
    return `larix://set/v1?${buildLarixGroveParams(cam)}`;
  };

  /**
   * IRL Pro QR contents — just the plain `rtmp://...` or `srt://...` URL.
   *
   * IRL Pro on Android registers `rtmp://`, `rtmps://`, `srt://`, `rtsp://`, `rtsps://`,
   * and `rist://` schemes natively. When the system camera scans a QR encoding one
   * of these URLs, Android shows an "Open in IRL Pro" prompt (or opens it directly
   * if it's the default handler for the scheme) and the app accepts the URL as a
   * stream destination.
   *
   * (Earlier versions used an Android `intent://` wrapper to force IRL Pro vs Larix,
   * but IRL Pro rejected those with: "IRL Pro doesn't support this type of url (intent)".
   * The user only needs the destination URL — IRL Pro handles the rest.)
   */
  const buildIrlProDeepLink = (cam: BetaCamera): string => {
    return cam.preferredProtocol === 'srt' ? cam.ingestSrtUrl : cam.ingestRtmpUrl;
  };

  const handleRotate = async (id: string) => {
    if (
      !confirm(
        th
          ? "หมุน stream key ใหม่? Larix ต้องตั้งค่าใหม่"
          : "Rotate stream key? Larix must be reconfigured.",
      )
    )
      return;
    await fetch(`/api/cctv-beta/cameras/${id}/rotate-key`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(th ? "ลบกล้อง?" : "Delete camera?")) return;
    await fetch(`/api/cctv-beta/cameras/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    load();
  };

  const openEdit = (cam: BetaCamera) => {
    setEditing(cam);
    setEditForm({
      name: cam.name || "",
      checkpointId: cam.checkpointId || "",
      checkpointName: cam.checkpointName || "",
      preferredProtocol: cam.preferredProtocol,
      autoRecord: cam.autoRecord,
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        checkpointId: editForm.checkpointId || undefined,
        checkpointName: editForm.checkpointName || undefined,
        preferredProtocol: editForm.preferredProtocol,
        autoRecord: editForm.autoRecord,
      };
      const res = await fetch(`/api/cctv-beta/cameras/${editing._id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        alert(`${th ? "บันทึกไม่สำเร็จ" : "Update failed"} (${res.status}) ${txt}`);
        return;
      }
      setEditing(null);
      load();
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {th ? "จัดการกล้อง (Larix Beta)" : "Cameras (Larix Beta)"}
          </h1>
          <span
            style={{
              background: "#f59e0b",
              color: "#fff",
              padding: "2px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            BETA
          </span>
        </div>

        <div
          style={{
            background: "#fff",
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: 14, fontWeight: 600 }}>
            {th ? "เพิ่มกล้องใหม่" : "Add new camera"}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}>

            <input
              placeholder={th ? "ชื่อกล้อง *" : "Name *"}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />
            <select
              value={form.checkpointId}
              onChange={(e) => {
                const cp = checkpoints.find((x) => x._id === e.target.value);
                setForm({ ...form, checkpointId: e.target.value, checkpointName: cp?.name ?? "" });
              }}
              style={inputStyle}
            >
              <option value="">{th ? "— เลือก checkpoint —" : "— Select checkpoint —"}</option>
              {checkpoints.map((cp) => (
                <option key={cp._id} value={cp._id}>
                  {cp.name} ({cp.type})
                </option>
              ))}
            </select>
            <select
              value={form.preferredProtocol}
              onChange={(e) =>
                setForm({
                  ...form,
                  preferredProtocol: e.target.value as "srt" | "rtmp",
                })
              }
              style={inputStyle}
            >
              <option value="srt">SRT (แนะนำสำหรับ 4G/5G)</option>
              <option value="rtmp">RTMP</option>
            </select>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={form.autoRecord}
                onChange={(e) =>
                  setForm({ ...form, autoRecord: e.target.checked })
                }
              />
              {th ? "บันทึกอัตโนมัติ" : "Auto-record"}
            </label>
            <button
              onClick={handleCreate}
              style={{
                ...inputStyle,
                background: "#16a34a",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {th ? "สร้าง" : "Create"}
            </button>
          </div>
        </div>

        {loading && <div>Loading…</div>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              cameras.length <= 1
                ? "1fr"
                : "repeat(2, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {cameras.map((cam) => (
            <div
              key={cam._id}
              style={{
                background: "#fff",
                padding: 14,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {cam.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {cam.checkpointName || "—"} · {cam.coverageZone || ""}
                  </div>
                </div>
                <span
                  style={{
                    background:
                      cam.status === "publishing"
                        ? "#16a34a"
                        : cam.status === "online"
                          ? "#0ea5e9"
                          : "#9ca3af",
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {cam.status.toUpperCase()}
                </span>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  background: "#f9fafb",
                  padding: 8,
                  borderRadius: 4,
                }}
              >
                <div style={{ fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                  Larix ({th ? "URL เดียว" : "single URL"})
                </div>
                <UrlRow
                  label="SRT"
                  value={cam.ingestSrtUrl}
                  copied={copiedKey === `${cam._id}:larixSrt`}
                  onCopy={() => copyField(cam, "larixSrt", cam.ingestSrtUrl)}
                />
                <UrlRow
                  label="RTMP"
                  value={cam.ingestRtmpUrl}
                  copied={copiedKey === `${cam._id}:larixRtmp`}
                  onCopy={() => copyField(cam, "larixRtmp", cam.ingestRtmpUrl)}
                />
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  background: "#fef3c7",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #fcd34d",
                }}
              >
                <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 6 }}>
                  IRL Pro ({th ? "แยก Server + Key" : "split Server + Key"})
                </div>
                <UrlRow
                  label="Server URL"
                  value={rtmpServerOf(cam)}
                  copied={copiedKey === `${cam._id}:rtmpServer`}
                  onCopy={() => copyField(cam, "rtmpServer", rtmpServerOf(cam))}
                />
                <UrlRow
                  label="Stream Key"
                  value={cam.streamKey}
                  copied={copiedKey === `${cam._id}:streamKey`}
                  onCopy={() => copyField(cam, "streamKey", cam.streamKey)}
                />
                <UrlRow
                  label="SRT"
                  value={cam.ingestSrtUrl}
                  copied={copiedKey === `${cam._id}:irlSrt`}
                  onCopy={() => copyField(cam, "irlSrt", cam.ingestSrtUrl)}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => {
                    setQrApp("larix");
                    setShowQrFor(cam);
                  }}
                  style={btnStyle("#6366f1")}
                >
                  QR Larix
                </button>
                <button
                  onClick={() => {
                    setQrApp("irlpro");
                    setShowQrFor(cam);
                  }}
                  style={btnStyle("#7c3aed")}
                >
                  QR IRL Pro
                </button>
                <button
                  onClick={() => openEdit(cam)}
                  style={btnStyle("#0ea5e9")}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleRotate(cam._id)}
                  style={btnStyle("#f59e0b")}
                >
                  Rotate key
                </button>
                <button
                  onClick={() => handleDelete(cam._id)}
                  style={btnStyle("#dc2626")}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Edit camera modal ─────────────────────────────────────── */}
        {editing && (
          <div
            onClick={() => !editSaving && setEditing(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 900,
              background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 520,
                boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                  ✏️ {th ? "แก้ไขกล้อง" : "Edit Camera"}
                </h3>
                <button
                  onClick={() => !editSaving && setEditing(null)}
                  style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b" }}
                >✕</button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={editLabel}>{th ? "ชื่อกล้อง" : "Name"} *</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={editLabel}>Checkpoint</label>
                  <select
                    value={editForm.checkpointId}
                    onChange={(e) => {
                      const cp = checkpoints.find((x) => x._id === e.target.value);
                      setEditForm({ ...editForm, checkpointId: e.target.value, checkpointName: cp?.name ?? "" });
                    }}
                    style={inputStyle}
                  >
                    <option value="">{th ? "— เลือก checkpoint —" : "— Select checkpoint —"}</option>
                    {checkpoints.map((cp) => (
                      <option key={cp._id} value={cp._id}>{cp.name} ({cp.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={editLabel}>{th ? "Protocol" : "Protocol"}</label>
                  <select
                    value={editForm.preferredProtocol}
                    onChange={(e) => setEditForm({ ...editForm, preferredProtocol: e.target.value as "srt" | "rtmp" })}
                    style={inputStyle}
                  >
                    <option value="srt">SRT (แนะนำ)</option>
                    <option value="rtmp">RTMP</option>
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151" }}>
                  <input
                    type="checkbox"
                    checked={editForm.autoRecord}
                    onChange={(e) => setEditForm({ ...editForm, autoRecord: e.target.checked })}
                  />
                  {th ? "บันทึกอัตโนมัติ" : "Auto-record"}
                </label>
                {editing.streamKey && (
                  <div style={{ padding: 10, background: "#f1f5f9", borderRadius: 8, fontSize: 11, color: "#64748b" }}>
                    <b>Stream key:</b> <span style={{ fontFamily: "monospace" }}>{editing.streamKey}</span>
                    <div style={{ marginTop: 4 }}>
                      {th
                        ? "ถ้าเปลี่ยน Protocol — Larix/IRL Pro บนมือถือต้องตั้งค่าใหม่"
                        : "If you change Protocol — reconfigure Larix/IRL Pro on the phone"}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  onClick={() => setEditing(null)}
                  disabled={editSaving}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {th ? "ยกเลิก" : "Cancel"}
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={editSaving || !editForm.name.trim()}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                    background: editSaving || !editForm.name.trim() ? "#cbd5e1" : "#16a34a",
                    color: "#fff", fontWeight: 700, fontSize: 13, cursor: editSaving ? "wait" : "pointer",
                  }}
                >
                  {editSaving ? (th ? "กำลังบันทึก..." : "Saving...") : (th ? "💾 บันทึก" : "💾 Save")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showQrFor && (() => {
          const cam = showQrFor;
          const isIrl = qrApp === "irlpro";
          // Each app gets its own QR encoded with a different URL scheme:
          //   Larix QR     → `larix://set/v1?...`  (opens Larix Broadcaster)
          //   IRL Pro QR   → `intent://...;package=app.irlpro.android;end`
          //                  (Android intent URL — forces IRL Pro even when both
          //                   apps are installed; falls back to Play Store if not)
          const qrValue = isIrl ? buildIrlProDeepLink(cam) : buildLarixDeepLink(cam);
          const title = isIrl ? "IRL Pro Setup" : "Larix Setup";
          const copyQrKey = `qr:${cam._id}:${qrApp}`;
          const copyQrCopied = copiedKey === copyQrKey;
          return (
            <div onClick={() => setShowQrFor(null)} style={modalBackdrop}>
              <div onClick={(e) => e.stopPropagation()} style={{ ...modalContent, maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0 }}>
                  {cam.name} — {title}
                </h3>
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  <button
                    onClick={() => setQrApp("larix")}
                    style={{
                      ...btnStyle(qrApp === "larix" ? "#6366f1" : "#9ca3af"),
                      flex: 1,
                    }}
                  >
                    Larix
                  </button>
                  <button
                    onClick={() => setQrApp("irlpro")}
                    style={{
                      ...btnStyle(qrApp === "irlpro" ? "#7c3aed" : "#9ca3af"),
                      flex: 1,
                    }}
                  >
                    IRL Pro
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: 16,
                    background: "#fff",
                  }}
                >
                  <QRCodeSVG value={qrValue} size={220} />
                </div>

                {/* Copy URL button — primary action */}
                <button
                  onClick={() => copyField(cam, `qr:${qrApp}`, qrValue)}
                  style={{
                    width: "100%",
                    marginTop: 10,
                    padding: "12px 0",
                    borderRadius: 8,
                    border: "none",
                    background: copyQrCopied ? "#16a34a" : "#0ea5e9",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {copyQrCopied
                    ? (th ? "✅ คัดลอกแล้ว!" : "✅ Copied!")
                    : (th ? "📋 คัดลอก URL" : "📋 Copy URL")}
                </button>

                {/* IRL Pro instructions */}
                {isIrl && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{
                      background: "#ecfdf5",
                      border: "1px solid #86efac",
                      padding: 12,
                      borderRadius: 8,
                      fontSize: 12,
                    }}>
                      <div style={{ fontWeight: 700, color: "#166534", marginBottom: 8, fontSize: 13 }}>
                        📱 {th ? "วิธีใช้กับ IRL Pro (Android)" : "How to use with IRL Pro (Android)"}
                      </div>
                      <ol style={{ margin: 0, paddingLeft: 18, color: "#166534", lineHeight: 1.7 }}>
                        <li>{th ? "เปิดแอป กล้อง (Camera) ของระบบ Android แล้วสแกน QR นี้" : "Open the system Camera app on Android and scan this QR"}</li>
                        <li>{th ? "Android จะเปิด IRL Pro ขึ้นมาพร้อม stream URL อัตโนมัติ" : "Android opens IRL Pro with the stream URL pre-filled"}</li>
                        <li>{th ? "ตั้งชื่อ destination แล้วกด Save → Start เพื่อ Live" : "Name the destination, tap Save → Start to go Live"}</li>
                      </ol>
                    </div>

                    <div style={{
                      marginTop: 10,
                      background: "#fef3c7",
                      border: "1px solid #fcd34d",
                      padding: 10,
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#78350f",
                    }}>
                      <b>⚠️ {th ? "หากสแกนไม่ได้ผล (manual setup):" : "If scan doesn't work (manual setup):"}</b>
                      <ol style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                        <li>{th ? "เปิด IRL Pro → Destinations → + Add" : "Open IRL Pro → Destinations → + Add"}</li>
                        <li>
                          {th ? "วาง URL ของ stream (ดูในการ์ดด้านนอก):" : "Paste the stream URL (see card outside):"}
                          <div style={{ marginTop: 4, padding: "4px 8px", background: "#fff", borderRadius: 4, fontFamily: "monospace", fontSize: 10, wordBreak: "break-all" }}>
                            {cam.preferredProtocol === "srt" ? cam.ingestSrtUrl : cam.ingestRtmpUrl}
                          </div>
                        </li>
                        <li>{th ? "กด Save → กลับหน้าหลัก → Start" : "Save → back to main → Start"}</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Larix instructions */}
                {!isIrl && (
                  <div style={{
                    marginTop: 12,
                    background: "#eef2ff",
                    border: "1px solid #c7d2fe",
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 700, color: "#3730a3", marginBottom: 8, fontSize: 13 }}>
                      {th ? "📱 วิธีใช้กับ Larix Broadcaster" : "📱 How to use with Larix Broadcaster"}
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#3730a3", lineHeight: 1.7 }}>
                      <li>{th ? "เปิดแอป Larix Broadcaster" : "Open Larix Broadcaster"}</li>
                      <li>{th ? "Settings → Connections → กด + → New connection" : "Settings → Connections → tap + → New connection"}</li>
                      <li>{th ? "กดสแกน QR ในแอป (ไอคอน QR ที่มุม) แล้วสแกน QR ด้านบน หรือ" : "Scan QR using the in-app QR icon, or"}</li>
                      <li>{th ? "วาง URL ที่คัดลอกในช่อง URL → Save" : "Paste the copied URL into the URL field → Save"}</li>
                      <li>{th ? "กลับหน้าหลัก → กดปุ่มแดงเพื่อ Live" : "Go back → tap the red record button to go Live"}</li>
                    </ol>
                  </div>
                )}

                {/* Raw URL display (collapsible-feel) */}
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 11, color: "#6b7280", cursor: "pointer", fontWeight: 600 }}>
                    {th ? "▸ ดู URL แบบเต็ม" : "▸ Show full URL"}
                  </summary>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 10,
                      fontFamily: "monospace",
                      background: "#f3f4f6",
                      padding: 8,
                      borderRadius: 4,
                      wordBreak: "break-all",
                      color: "#374151",
                    }}
                  >
                    {qrValue}
                  </div>
                  {/* For IRL Pro, also show the plain stream URL fields for manual setup */}
                  {isIrl && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        background: "#fef3c7",
                        padding: 8,
                        borderRadius: 4,
                        border: "1px solid #fcd34d",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
                        {th ? "หรือกรอกแบบ manual (ไม่ใช้ Import)" : "Or set up manually (without Import)"}
                      </div>
                      {cam.preferredProtocol === "rtmp" ? (
                        <div style={{ fontFamily: "monospace", wordBreak: "break-all", color: "#451a03" }}>
                          <div><b>Server URL:</b> {rtmpServerOf(cam)}</div>
                          <div style={{ marginTop: 4 }}><b>Stream Key:</b> {cam.streamKey}</div>
                        </div>
                      ) : (
                        <div style={{ fontFamily: "monospace", wordBreak: "break-all", color: "#451a03" }}>
                          <div><b>SRT URL:</b> {cam.ingestSrtUrl}</div>
                        </div>
                      )}
                    </div>
                  )}
                </details>

                <button
                  onClick={() => setShowQrFor(null)}
                  style={{ ...btnStyle("#374151"), marginTop: 12, width: "100%" }}
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </AdminLayout>
  );
}

const editLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  width: "100%",
};
const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg,
  color: "#fff",
  border: "none",
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 600,
});
const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalContent: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 8,
  maxWidth: 400,
  width: "90%",
};

function UrlRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
        minWidth: 0,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
        {label}:
      </span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
          color: "#1f2937",
        }}
        title={value}
      >
        {value}
      </span>
      <button
        onClick={onCopy}
        aria-label="Copy"
        title={copied ? "Copied" : "Copy"}
        style={{
          background: copied ? "#16a34a" : "#fff",
          border: `1px solid ${copied ? "#16a34a" : "#d1d5db"}`,
          color: copied ? "#fff" : "#374151",
          borderRadius: 4,
          width: 26,
          height: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
