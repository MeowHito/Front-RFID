"use client";

import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import AdminLayout from "../AdminLayout";
import { useLanguage } from "@/lib/language-context";

interface Campaign {
  _id: string;
  name: string;
  categories?: { name: string; distance: string }[];
}

interface CheckpointOption {
  _id: string;
  name: string;
  type: string;
  orderNum: number;
  distanceMappings?: string[];
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
  const [campaignData, setCampaignData] = useState<Campaign | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointOption[]>([]);
  const [cameras, setCameras] = useState<BetaCamera[]>([]);
  const [loading, setLoading] = useState(false);
  const [showQrFor, setShowQrFor] = useState<BetaCamera | null>(null);
  const [qrApp, setQrApp] = useState<"larix" | "irlpro">("larix");
  const [copiedKey, setCopiedKey] = useState("");
  const [form, setForm] = useState({
    name: "",
    coverageZone: "",
    checkpointId: "",
    checkpointName: "",
    preferredProtocol: "srt" as "srt" | "rtmp",
    autoRecord: true,
  });

  useEffect(() => {
    fetch("/api/campaigns/featured", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?._id) {
          setCampaignData(d);
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

  const categoryOptions = campaignData?.categories ?? [];
  const filteredCheckpoints = form.coverageZone
    ? checkpoints.filter(
        (cp) =>
          !cp.distanceMappings?.length ||
          cp.distanceMappings.includes(form.coverageZone),
      )
    : checkpoints;

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
    if (form.coverageZone) payload.coverageZone = form.coverageZone;
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
        coverageZone: "",
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
   * Build a `larix://set/v1?...` deep-link for IRL Pro auto-import.
   *
   * IRL Pro on Android consumes Larix Grove's URL format — when the system
   * camera app scans this QR, Android offers to open IRL Pro (or Larix)
   * which then imports the connection settings automatically.
   *
   * See: https://softvelum.com/larix/grove/
   * See: https://kb.irltoolkit.com/nodrop/3-streaming-devices/1-irlpro
   */
  const buildIrlProDeepLink = (cam: BetaCamera): string => {
    const params = new URLSearchParams();
    const connName = `${cam.name}${cam.checkpointName ? ` (${cam.checkpointName})` : ""}`;

    if (cam.preferredProtocol === "srt") {
      // Split SRT URL: send the bare server URL, then streamid as its own param.
      // IRL Pro/Larix join them back at import time.
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
      // RTMP: server + key are encoded together in the URL (Larix appends key)
      params.append("conn[][url]", cam.ingestRtmpUrl);
      params.append("conn[][name]", connName);
      params.append("conn[][mode]", "va");
      params.append("conn[][target]", "rtmp");
      params.append("conn[][overwrite]", "on");
      params.append("conn[][active]", "on");
    }
    return `larix://set/v1?${params.toString()}`;
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
              value={form.coverageZone}
              onChange={(e) =>
                setForm({
                  ...form,
                  coverageZone: e.target.value,
                  checkpointId: "",
                  checkpointName: "",
                })
              }
              style={inputStyle}
            >
              <option value="">
                {th ? "— เลือกระยะ —" : "— Select distance —"}
              </option>
              {categoryOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.distance})
                </option>
              ))}
            </select>

            <select
              value={form.checkpointId}
              onChange={(e) => {
                const cp = filteredCheckpoints.find(
                  (x) => x._id === e.target.value,
                );
                setForm({
                  ...form,
                  checkpointId: e.target.value,
                  checkpointName: cp?.name ?? "",
                });
              }}
              disabled={!form.coverageZone}
              style={inputStyle}
            >
              <option value="">
                {th
                  ? form.coverageZone
                    ? "— เลือก checkpoint —"
                    : "เลือกระยะก่อน"
                  : form.coverageZone
                    ? "— Select checkpoint —"
                    : "Select distance first"}
              </option>
              {filteredCheckpoints.map((cp) => (
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

        {showQrFor && (() => {
          const cam = showQrFor;
          const isIrl = qrApp === "irlpro";
          const plainUrl =
            cam.preferredProtocol === "srt" ? cam.ingestSrtUrl : cam.ingestRtmpUrl;
          // IRL Pro requires the larix:// deep-link to auto-import.
          // Larix Broadcaster accepts either, but plain URL is simpler.
          const qrValue = isIrl ? buildIrlProDeepLink(cam) : plainUrl;
          const title = isIrl ? "IRL Pro Setup" : "Larix Setup";
          const instructionsTh = isIrl
            ? "📱 เปิดแอป กล้อง (Camera) ของระบบ Android แล้วสแกน QR นี้ → Android จะถามว่าเปิดด้วย IRL Pro หรือไม่ → กดยอมรับเพื่อ import การตั้งค่าอัตโนมัติ (อย่าใช้ QR scanner ภายในแอป IRL Pro)"
            : "📱 สแกน QR ในแอป Larix Broadcaster (Settings → Connections → New connection → URL) หรือคัดลอก URL ด้านล่างไปวางในช่อง URL";
          const instructionsEn = isIrl
            ? "📱 Open the system Camera app on Android and scan this QR — Android will offer to open IRL Pro. Accept to auto-import the connection. (Do NOT use the QR scanner inside IRL Pro itself.)"
            : "📱 Scan in Larix Broadcaster (Settings → Connections → New connection → URL) or copy the URL below into the URL field.";
          return (
            <div onClick={() => setShowQrFor(null)} style={modalBackdrop}>
              <div onClick={(e) => e.stopPropagation()} style={modalContent}>
                <h3 style={{ marginTop: 0 }}>
                  {cam.name} — {title}
                </h3>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
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
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  {th ? instructionsTh : instructionsEn}
                </p>
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
                {isIrl && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#7c3aed",
                      marginBottom: 6,
                      textAlign: "center",
                      fontWeight: 600,
                    }}
                  >
                    {th
                      ? "QR นี้เป็น larix:// deep-link สำหรับ auto-import"
                      : "This QR is a larix:// deep-link for auto-import"}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    background: "#f3f4f6",
                    padding: 8,
                    borderRadius: 4,
                    wordBreak: "break-all",
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 10, color: "#374151", marginBottom: 4 }}>
                    {isIrl ? (th ? "URL ใน QR (deep-link)" : "QR URL (deep-link)") : (th ? "Stream URL" : "Stream URL")}
                  </div>
                  {qrValue}
                </div>
                {/* For IRL Pro, also show the plain stream URL for manual setup */}
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
                      {th ? "หรือกรอกแบบแมนนวลในแอป IRL Pro" : "Or set up manually in IRL Pro"}
                    </div>
                    {cam.preferredProtocol === "rtmp" ? (
                      <div style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                        <div><b>Server URL:</b> {rtmpServerOf(cam)}</div>
                        <div style={{ marginTop: 4 }}><b>Stream Key:</b> {cam.streamKey}</div>
                      </div>
                    ) : (
                      <div style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                        <div><b>SRT URL:</b> {cam.ingestSrtUrl}</div>
                      </div>
                    )}
                  </div>
                )}
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
