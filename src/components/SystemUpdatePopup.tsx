import React, { useState, useEffect } from "react";
import { RefreshCw, X, ChevronDown, ChevronUp, Rocket } from "lucide-react";
import { SystemVersionInfo } from "../types";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

interface SystemUpdatePopupProps {
  ownerId?: string | null;
  userRole?: "owner" | "admin" | "karyawan" | null;
}

// Robust semver comparison helper
function parseVersion(v: string): number[] {
  if (!v) return [0, 0, 0];
  const cleaned = v.replace(/^v/i, "").trim();
  const parts = cleaned.split(".").map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  while (parts.length < 3) parts.push(0);
  return parts;
}

function compareVersions(v1: string, v2: string): number {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export function SystemUpdatePopup({ ownerId }: SystemUpdatePopupProps) {
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<SystemVersionInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [showChangelog, setShowChangelog] = useState<boolean>(true);

  const handleVersionData = (data: SystemVersionInfo) => {
    if (!data || !data.version) return;

    const incomingVersion = data.version.trim();
    const incomingCode = Number(data.versionCode) || 0;

    // 1. If this exact version has ALREADY been applied / confirmed on this browser, do NOT show popup
    const isExplicitlyApplied = localStorage.getItem(`damdam_app_applied_v_${incomingVersion}`) === "true";
    if (isExplicitlyApplied) {
      setHasUpdate(false);
      return;
    }

    const installedVersion = localStorage.getItem("damdam_app_installed_version");
    const installedCode = Number(localStorage.getItem("damdam_app_installed_version_code") || 0);

    // 2. If this is the very first time app is opened ever on this browser, record the current version as installed
    if (!installedVersion && installedCode === 0) {
      localStorage.setItem("damdam_app_installed_version", incomingVersion);
      localStorage.setItem("damdam_app_installed_version_code", String(incomingCode));
      if (data.publishedAt) localStorage.setItem("damdam_app_installed_published_at", data.publishedAt);
      localStorage.setItem(`damdam_app_applied_v_${incomingVersion}`, "true");
      setHasUpdate(false);
      return;
    }

    // 3. Strictly check if incoming version is newer than installed version
    const versionComparison = installedVersion ? compareVersions(incomingVersion, installedVersion) : 0;
    const isNewerSemver = versionComparison > 0;
    const isNewerCode = incomingCode > 0 && installedCode > 0 && incomingCode > installedCode;

    // 4. Check if temporarily dismissed in current session
    const isSessionDismissed = sessionStorage.getItem(`damdam_app_dismissed_v_${incomingVersion}`) === "true";

    // Only show popup if it's strictly a newer version and not dismissed
    if ((isNewerSemver || isNewerCode) && !isSessionDismissed) {
      setUpdateInfo(data);
      setHasUpdate(true);
    } else {
      // If version is equal or older, mark it as applied so it never triggers false alarms
      if (versionComparison <= 0 && (!incomingCode || incomingCode <= installedCode)) {
        localStorage.setItem(`damdam_app_applied_v_${incomingVersion}`, "true");
      }
      setHasUpdate(false);
    }
  };

  // Check update from API / static version.json
  const checkForUpdates = async () => {
    try {
      const response = await fetch(`/api/system-version?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-cache"
        }
      });

      if (!response.ok) {
        const fallbackRes = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!fallbackRes.ok) return;
        const fallbackData: SystemVersionInfo = await fallbackRes.json();
        handleVersionData(fallbackData);
        return;
      }

      const data: SystemVersionInfo = await response.json();
      handleVersionData(data);
    } catch (err) {
      console.warn("[SystemUpdate] Could not check for updates:", err);
    }
  };

  // Dismiss for current session
  const handleDismissLater = () => {
    if (updateInfo?.version) {
      sessionStorage.setItem(`damdam_app_dismissed_v_${updateInfo.version.trim()}`, "true");
    }
    setHasUpdate(false);
  };

  // Perform immediate update & reload, and mark this version permanently as installed
  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    try {
      const targetVersion = updateInfo?.version ? updateInfo.version.trim() : "1.4.3";
      const targetCode = updateInfo?.versionCode || 143;
      const targetPublishedAt = updateInfo?.publishedAt || new Date().toISOString();

      // 1. Permanently record the newly applied version into localStorage
      localStorage.setItem("damdam_app_installed_version", targetVersion);
      localStorage.setItem("damdam_app_installed_version_code", String(targetCode));
      localStorage.setItem("damdam_app_installed_published_at", targetPublishedAt);
      localStorage.setItem(`damdam_app_applied_v_${targetVersion}`, "true");
      localStorage.setItem("damdam_app_last_applied_timestamp", String(Date.now()));
      sessionStorage.setItem(`damdam_app_dismissed_v_${targetVersion}`, "true");

      // 2. Tell service worker to activate new version
      if ("serviceWorker" in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: "SKIP_WAITING" });
            }
            await reg.update();
          }
        } catch (swErr) {
          console.warn("[SystemUpdate] Service Worker update:", swErr);
        }
      }

      // 3. Clear caches
      if ("caches" in window) {
        try {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        } catch (cErr) {
          console.warn("[SystemUpdate] Cache delete:", cErr);
        }
      }

      // 4. Clear session storage boot tokens
      sessionStorage.removeItem("damdam_app_boot_version");
      sessionStorage.removeItem("damdam_app_boot_published_at");
      sessionStorage.removeItem("damdam_app_boot_version_code");

      setHasUpdate(false);
    } catch (err) {
      console.warn("[SystemUpdate] Error during cache cleanup:", err);
    } finally {
      // 5. Reload page to load fresh assets
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  useEffect(() => {
    // Initial check on mount
    checkForUpdates();

    // 1. Periodic background check every 60 seconds
    const interval = setInterval(() => {
      checkForUpdates();
    }, 60000);

    // 2. Check on tab focus / visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    // 3. Listen to custom service worker update event from index.html
    const handleSWUpdate = () => {
      console.log("[SystemUpdate] Service worker update event received.");
      checkForUpdates();
    };
    window.addEventListener("app-system-update-found", handleSWUpdate);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener("app-system-update-found", handleSWUpdate);
    };
  }, []);

  // Real-time Firestore sync for instant published updates (if ownerId exists)
  useEffect(() => {
    if (!ownerId) return;

    try {
      const updateDocRef = doc(db, "users", ownerId, "system_updates", "latest");
      const unsub = onSnapshot(updateDocRef, (snap) => {
        if (snap.exists()) {
          const remoteData = snap.data() as SystemVersionInfo;
          if (remoteData && remoteData.version) {
            handleVersionData(remoteData);
          }
        }
      });
      return () => unsub();
    } catch (err) {
      console.warn("[SystemUpdate] Firestore update listener error:", err);
    }
  }, [ownerId]);

  if (!hasUpdate) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] animate-fade-in font-sans">
      <div className="w-full max-w-[340px] bg-[#121214] border border-amber-500/80 shadow-2xl shadow-black/90 p-4 text-left relative overflow-hidden">
        {/* Animated accent top stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 animate-pulse" />

        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 mb-3 pt-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-black px-1.5 py-0.2 font-mono">
                  UPDATE
                </span>
                {updateInfo?.version && (
                  <span className="text-[11px] font-mono font-bold text-amber-400">
                    v{updateInfo.version}
                  </span>
                )}
              </div>
              <h4 className="text-xs font-black text-white uppercase tracking-tight mt-0.5">
                Pembaruan Sistem
              </h4>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismissLater}
            className="text-zinc-500 hover:text-white p-1 hover:bg-zinc-800 transition cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Short Text */}
        <p className="text-[11.5px] text-zinc-300 leading-snug mb-3 font-sans">
          Versi terbaru aplikasi telah dirilis. Perbarui sekarang untuk mengaktifkan pembaruan fitur &amp; performa terbaru.
        </p>

        {/* Compact Changelog (Collapsible) */}
        {updateInfo?.changelog && updateInfo.changelog.length > 0 && (
          <div className="mb-3 border border-zinc-800 bg-zinc-950 p-2 text-[10.5px]">
            <button
              type="button"
              onClick={() => setShowChangelog(!showChangelog)}
              className="w-full flex items-center justify-between text-[10.5px] font-bold text-amber-400/90 hover:text-amber-300 uppercase cursor-pointer"
            >
              <span>Fitur Baru ({updateInfo.changelog.length})</span>
              {showChangelog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showChangelog && (
              <ul className="mt-1.5 space-y-1 text-zinc-300 border-t border-zinc-900 pt-1.5 list-disc list-inside">
                {updateInfo.changelog.map((item, idx) => (
                  <li key={idx} className="leading-tight text-zinc-300">
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-850">
          <button
            type="button"
            onClick={handleDismissLater}
            disabled={isUpdating}
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-zinc-400 hover:text-white text-[11px] font-bold uppercase transition cursor-pointer disabled:opacity-50 text-center"
          >
            Nanti
          </button>
          
          <button
            type="button"
            onClick={handleApplyUpdate}
            disabled={isUpdating}
            className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? "animate-spin" : ""}`} />
            <span>{isUpdating ? "Memproses..." : "Perbarui"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
