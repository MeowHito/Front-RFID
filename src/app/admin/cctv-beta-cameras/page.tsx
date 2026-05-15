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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [campaignData, setCampaignData] = useState<Campaign | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointOption[]>([]);
  const [cameras, setCameras] = useState<BetaCamera[]>([]);
  const [loading, setLoading] = useState(false);
  const [showQrFor, setShowQrFor] = useState<BetaCamera | null>(null);
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
          setCampaigns([d]);
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
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
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
                  fontFamily: "monospace",
                  background: "#f9fafb",
                  padding: 8,
                  borderRadius: 4,
                  wordBreak: "break-all",
                }}
              >
                <div>
                  <b>SRT:</b> {cam.ingestSrtUrl}
                </div>
                <div style={{ marginTop: 4 }}>
                  <b>RTMP:</b> {cam.ingestRtmpUrl}
                </div>
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
                  onClick={() => setShowQrFor(cam)}
                  style={btnStyle("#6366f1")}
                >
                  QR for Larix
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

        {showQrFor && (
          <div onClick={() => setShowQrFor(null)} style={modalBackdrop}>
            <div onClick={(e) => e.stopPropagation()} style={modalContent}>
              <h3 style={{ marginTop: 0 }}>{showQrFor.name} — Larix Setup</h3>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                {th
                  ? "สแกน QR ในแอป Larix Broadcaster (Settings → Connections → Add URL)"
                  : "Scan in Larix Broadcaster (Settings → Connections → Add URL)"}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: 16,
                  background: "#fff",
                }}
              >
                <QRCodeSVG
                  value={
                    showQrFor.preferredProtocol === "srt"
                      ? showQrFor.ingestSrtUrl
                      : showQrFor.ingestRtmpUrl
                  }
                  size={220}
                />
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  background: "#f3f4f6",
                  padding: 8,
                  borderRadius: 4,
                  wordBreak: "break-all",
                }}
              >
                {showQrFor.preferredProtocol === "srt"
                  ? showQrFor.ingestSrtUrl
                  : showQrFor.ingestRtmpUrl}
              </div>
              <button
                onClick={() => setShowQrFor(null)}
                style={{ ...btnStyle("#374151"), marginTop: 12, width: "100%" }}
              >
                Close
              </button>
            </div>
          </div>
        )}
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
