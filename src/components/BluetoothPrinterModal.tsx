import React, { useState, useEffect } from "react";
import { 
  Printer, 
  X, 
  Bluetooth, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  HelpCircle, 
  FileText, 
  Tag, 
  Info,
  Smartphone,
  Navigation,
  ArrowLeft,
  SlidersHorizontal,
  Save,
  Check,
  Wifi,
  Eye,
  Sliders,
  DollarSign,
  Battery
} from "lucide-react";
import {
  isBluetoothSupported,
  isPrinterConnected,
  getConnectedDeviceName,
  connectPrinter,
  disconnectPrinter,
  generateReceiptEscPos,
  generateLabelEscPos,
  sendToPrinter,
  triggerWebPrint
} from "../utils/bluetoothPrinter";

interface BluetoothPrinterModalProps {
  onClose: () => void;
  activeCashierName?: string;
}

export function BluetoothPrinterModal({ onClose, activeCashierName = "Mba Dwi" }: BluetoothPrinterModalProps) {
  const [supported, setSupported] = useState(isBluetoothSupported());
  const [connected, setConnected] = useState(isPrinterConnected());
  const [deviceName, setDeviceName] = useState<string | null>(getConnectedDeviceName());
  const [copied, setCopied] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [printingStatus, setPrintingStatus] = useState<string>("");
  const [printProgress, setPrintProgress] = useState<number>(0);

  // Active Main Modal Tab: "connection" (Bluetooth) vs "label" (Settings & Live Preview Mockup)
  const [activeTab, setActiveTab] = useState<"connection" | "label">("label");

  // --- LABEL DESIGNER FORMS & PREVIEW STATES ---
  const [storeName, setStoreName] = useState(() => localStorage.getItem("damdam_label_store_name") || "Damdam Laundry");
  const [custName, setCustName] = useState("Ahmad");
  const [trxNo, setTrxNo] = useState("TRX/260608/00999");
  const [parfum, setParfum] = useState("Downy Black");
  const [notes, setNotes] = useState("Selimut dan kaos dipisah");
  const [statusBayar, setStatusBayar] = useState<"Belum Lunas" | "Lunas" | "DP">("Belum Lunas");
  
  const [showItemDetails, setShowItemDetails] = useState(() => localStorage.getItem("damdam_label_show_details") !== "false");
  const [showPayment, setShowPayment] = useState(() => localStorage.getItem("damdam_label_show_payment") !== "false");
  const [nameSize, setNameSize] = useState(() => localStorage.getItem("damdam_label_name_size") || "xl"); // "regular" | "large" | "xl"
  const [dividerStyle, setDividerStyle] = useState(() => localStorage.getItem("damdam_label_divider") || "dashed"); // "dashed" | "solid" | "dotted" | "double"
  const [labelStylePref, setLabelStylePref] = useState(() => localStorage.getItem("damdam_label_style") || "full"); // "full" (rich receipt style) or "compact"
  const [footerSlogan, setFooterSlogan] = useState(() => localStorage.getItem("damdam_label_footer") || "* Jangan Hilang / Tertukar *");

  // Sample breakdown math configurations (re-calculates preview sums on change)
  const [srv1Name, setSrv1Name] = useState("Cuci Setrika (Kiloan)");
  const [srv1Qty, setSrv1Qty] = useState(4.5);
  const [srv1Price, setSrv1Price] = useState(6000);
  const [srv1Detail, setSrv1Detail] = useState("Kaos (5), Celana Pendek (2), Kemeja (1), Jaket (1)");

  const [srv2Name, setSrv2Name] = useState("Handuk (Satuan)");
  const [srv2Qty, setSrv2Qty] = useState(5);
  const [srv2Price, setSrv2Price] = useState(10000);

  const [discountAmount, setDiscountAmount] = useState(5000);

  // Poll state to make sure change is picked up immediately if disconnects etc.
  useEffect(() => {
    const handleSync = () => {
      setConnected(isPrinterConnected());
      setDeviceName(getConnectedDeviceName());
    };
    const interval = setInterval(handleSync, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const pName = await connectPrinter();
      setConnected(true);
      setDeviceName(pName);
      setSuccessMsg(`Berhasil terhubung ke printer "${pName || "Thermal Printer"}"`);
    } catch (err: any) {
      console.error("Bluetooth connection error:", err);
      if (err?.name === "NotFoundError" || err?.message?.includes("cancelled")) {
        setErrorMsg("Pencarian printer dibatalkan oleh pengguna.");
      } else {
        setErrorMsg(
          err?.message || "Gagal menghubungkan printer. Pastikan Bluetooth aktif dan perangkat berada di dekat Anda."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await disconnectPrinter();
      setConnected(false);
      setDeviceName(null);
      setSuccessMsg("Koneksi printer berhasil diputuskan.");
    } catch (err: any) {
      setErrorMsg(err?.message || "Gagal memutuskan koneksi printer.");
    } finally {
      setLoading(false);
    }
  };

  // Saves label adjustments persistently
  const handleSaveLabelSettings = () => {
    localStorage.setItem("damdam_label_store_name", storeName);
    localStorage.setItem("damdam_label_show_details", showItemDetails ? "true" : "false");
    localStorage.setItem("damdam_label_show_payment", showPayment ? "true" : "false");
    localStorage.setItem("damdam_label_name_size", nameSize);
    localStorage.setItem("damdam_label_divider", dividerStyle);
    localStorage.setItem("damdam_label_footer", footerSlogan);
    localStorage.setItem("damdam_label_style", labelStylePref);
    
    setSuccessMsg("Pengaturan label berhasil disimpan dan diterapkan!");
    setErrorMsg(null);
    
    // Clear notification after 3 seconds
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Prints the custom sample label layout physically to the connected Bluetooth printer
  const handlePrintLabelSample = async () => {
    if (!isPrinterConnected()) {
      setErrorMsg("Printer belum terhubung! Silakan hubungkan printer Bluetooth Anda di Tab 'Koneksi Printer & Tes'.");
      return;
    }

    setPrintingStatus("Mencetak Desain Label Anda...");
    setPrintProgress(0);
    setErrorMsg(null);

    try {
      // Craft a mock transaction with customizer inputs
      const dummyTrx = {
        id: trxNo || "TRX/260608/00999",
        customerName: custName || "Ahmad",
        customerPhone: "08123456789",
        tanggalMasuk: "2026-06-08 13:14:00",
        estimasiSelesai: "2026-06-10 13:14:00",
        layananNama: `${srv1Name}, ${srv2Name}`,
        berat: srv1Qty,
        parfum: parfum || "Downy Black",
        notes: `Detail item: ${srv1Detail} [Diskon Rp ${discountAmount.toLocaleString()}]` + (notes ? ` (${notes})` : ""),
        totalHarga: (srv1Qty * srv1Price) + (srv2Qty * srv2Price) - discountAmount,
        pembayaranMetode: "Tunai",
        statusBayar: statusBayar === "Lunas" ? "Lunas" : (statusBayar === "DP" ? "DP" : "Belum Lunas"),
        status: "Proses" as any,
        userId: "guest",
        createdAt: new Date().toISOString()
      };

      const bytes = generateLabelEscPos(dummyTrx as any);
      await sendToPrinter(bytes, (progress) => {
        setPrintProgress(progress);
      });

      setSuccessMsg("Desain label kustom terkirim dengan sukses ke printer kassa!");
      setTimeout(() => setPrintingStatus(""), 2000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Printer Error: ${err?.message || "Gagal memproses pencetakan"}`);
      setPrintingStatus("");
    }
  };

  // Original Diagnostic test print handler
  const handleDiagnosticTestPrint = async (type: "nota" | "label") => {
    if (!isPrinterConnected()) {
      setErrorMsg("Printer belum terhubung! Hubungkan printer terlebih dahulu sebelum tes.");
      return;
    }
    
    setPrintingStatus(`Mencetak ${type === "nota" ? "Nota Test" : "Label Test"}...`);
    setPrintProgress(0);
    setErrorMsg(null);

    try {
      const dummyTrx = {
        id: "TRX-TEST-PRINT",
        customerName: "Budi Santoso (TES)",
        customerPhone: "08123456789",
        tanggalMasuk: "2026-06-08 10:00:00",
        estimasiSelesai: "2026-06-09 10:00:00",
        layananNama: "Cuci Komplit Reguler (3 Kg)",
        berat: 3,
        parfum: "Lavender Sensation",
        notes: "UJI COBA CETAK DIAGNOSTIC",
        totalHarga: 21000,
        dpAmount: 0,
        pembayaranMetode: "Tunai",
        statusBayar: "Lunas",
        status: "Diproses",
        userId: "guest",
        createdAt: new Date().toISOString()
      };

      const bytes = type === "nota" 
        ? generateReceiptEscPos(dummyTrx as any, activeCashierName)
        : generateLabelEscPos(dummyTrx as any);

      await sendToPrinter(bytes, (progress) => {
        setPrintProgress(progress);
      });
      
      setSuccessMsg(`Tes cetak ${type === "nota" ? "nota" : "label penanda"} terkirim dengan sukses!`);
      setTimeout(() => setPrintingStatus(""), 2200);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Gagal memproses pencetakan: ${err?.message || "Printer Error"}`);
      setPrintingStatus("");
    }
  };

  // Calculations for Sandbox form
  const item1Total = srv1Qty * srv1Price;
  const item2Total = srv2Qty * srv2Price;
  const subtotalSum = item1Total + item2Total;
  const grandTotalSum = subtotalSum - discountAmount;

  // Render correct visual line representation inside simulator
  const renderDividerLine = () => {
    let char = "-";
    if (dividerStyle === "double") char = "=";
    if (dividerStyle === "dotted") char = ".";
    if (dividerStyle === "solid")  char = "_";
    
    return (
      <div className="py-2 text-[10px] text-zinc-605 tracking-widest overflow-hidden text-center select-none font-mono font-bold leading-none opacity-50">
        {char.repeat(38)}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-fade-in font-sans overflow-y-auto">
      <div className={`w-full ${activeTab === 'label' ? 'max-w-4xl' : 'max-w-lg'} bg-[#121214] border border-[#27272A] shadow-2xl relative flex flex-col rounded-xl overflow-hidden my-auto transition-all duration-300 md:my-6`}>
        
        {/* Glow corners decor */}
        <div className="absolute top-0 left-0 w-4.5 h-4.5 border-t-2 border-l-2 border-emerald-500 rounded-tl-xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-4.5 h-4.5 border-t-2 border-r-2 border-emerald-500 rounded-tr-xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-4.5 h-4.5 border-b-2 border-l-2 border-emerald-400 rounded-bl-xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-4.5 h-4.5 border-b-2 border-r-2 border-emerald-400 rounded-br-xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-4.5 bg-[#0A0A0B] border-b border-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-[#F4F4F5]">
                PENGATURAN CETAK THERMAL
              </h3>
              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mt-0.5">
                LABEL PENANDA PACKING, NOTA KASIR & LIVE SANDBOX PREVIEW
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-zinc-950 border border-zinc-900 text-zinc-400 hover:text-white hover:border-red-500 rounded-lg cursor-pointer duration-150 transition-all shadow-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Tab bar switcher */}
        <div className="flex border-b border-zinc-900 bg-[#0c0c0e] p-1.5 gap-1.5 select-none">
          <button
            type="button"
            onClick={() => setActiveTab("label")}
            className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "label"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/10 font-bold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            🔧 Setting & Pratinjau Label
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("connection")}
            className={`flex-1 py-2 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "connection"
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/10 font-bold"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" />
            🔌 Koneksi Bluetooth ({connected ? "CONNECTED" : "DISCONNECTED"})
          </button>
        </div>

        {/* Operational Alerts & Feedback messages */}
        <div className="px-5 pt-3.5 space-y-2">
          {errorMsg && (
            <div className="bg-red-950/20 border border-red-900/40 p-3 text-[11px] font-semibold text-red-400 leading-relaxed text-left rounded-lg flex items-start gap-2.5 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-950/25 border border-emerald-900/40 p-3 text-[11px] font-semibold text-emerald-400 leading-relaxed text-left rounded-lg flex items-start gap-2.5 animate-fade-in">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Contents Body based on activeTab */}
        {activeTab === "connection" ? (
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
            
            {/* Support Indicator Alert */}
            {!supported && (
              <div className="bg-amber-950/30 border border-amber-900/60 p-3.5 flex items-start gap-3 rounded-lg text-left animate-fade-in">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-bounce" />
                <div className="space-y-1">
                  <h4 className="text-[11px] font-black text-amber-400 uppercase tracking-wide">
                    Browser Tidak Mendukung Web Bluetooth
                  </h4>
                  <p className="text-[10px] text-zinc-300 font-medium leading-relaxed">
                    Web Bluetooth API tidak didukung pada browser Anda saat ini. Kami sangat menyarankan menggunakan <strong className="text-white">Google Chrome</strong>, <strong className="text-white">Microsoft Edge</strong>, atau browser Chromium lainnya untuk menjalankan pencetakan kasir secara langsung.
                  </p>
                </div>
              </div>
            )}

            {/* Connection Status Card */}
            <div className="bg-[#0A0A0B] border border-zinc-900 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  connected 
                    ? "bg-emerald-950 border border-emerald-500 text-emerald-400 animate-pulse" 
                    : "bg-zinc-900/60 border border-zinc-800 text-zinc-500"
                }`}>
                  <Bluetooth className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider block">
                    STATUS PRINTER
                  </span>
                  {connected ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-emerald-400 font-black text-xs uppercase font-mono bg-emerald-950/50 px-2 py-0.5 border border-emerald-900/40">
                        CONNECTED
                      </span>
                      <span className="text-[11.5px] font-bold text-white max-w-[150px] truncate">
                        {deviceName || "Printer Thermal"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-zinc-400 font-black text-xs uppercase font-mono inline-block mt-0.5">
                      NOT CONNECTED
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex gap-2">
                {connected ? (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="w-full md:w-auto px-4 py-2 bg-red-650 hover:bg-red-500 text-black text-xs font-black uppercase tracking-widest transition duration-150 rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Putuskan Koneksi
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full md:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-450 text-black text-xs font-black uppercase tracking-widest transition duration-150 rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Mencari...
                      </>
                    ) : (
                      <>
                        <Bluetooth className="w-3.5 h-3.5" />
                        Hubungkan Printer
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* iOS Bluetooth & Web Print Solution Guide */}
            <div className="border border-zinc-900 w-full p-5 rounded-xl bg-zinc-950/40 text-left space-y-4 animate-fade-in relative">
              {/* Decorative Corner Accent */}
              <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500 rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500 rounded-bl-md" />
              
              <div className="flex items-center gap-2 border-b border-zinc-900 pb-2.5">
                <Smartphone className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
                <div>
                  <h4 className="text-[11.5px] font-black text-white uppercase tracking-wider">
                    PANDUAN KHUSUS CETAK BLUETOOTH DI IPHONE (iOS)
                  </h4>
                  <p className="text-[9px] text-[#f59e0b] font-extrabold uppercase tracking-wide">
                    MENGHUBUNGKAN PRINTER THERMAL LANGSUNG DARI HP APPLE
                  </p>
                </div>
              </div>
              
              <div className="text-[10.5px] text-zinc-350 leading-relaxed space-y-2.5">
                <p>
                  Sistem keamanan <strong className="text-white">Apple iOS (iPhone)</strong> melarang browser bawaan seperti Safari dan Chrome biasa untuk mengakses koneksi Bluetooth secara langsung.
                </p>
                
                <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 text-zinc-950 font-sans space-y-2 shadow-sm">
                  <p className="text-[11px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                    💡 LANGKAH MUDAH KONEKSI DI IPHONE (100% SUKSES):
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-[10.5px] font-bold leading-relaxed">
                    <li>
                      Download browser gratis bernama <span className="text-emerald-800 underline font-black">Bluefy - Web Bluetooth Browser</span> atau <span className="text-emerald-800 underline font-black">WebBLE</span> di App Store iPhone Anda.
                    </li>
                    <li>
                      Salin (Copy) link alamat aplikasi laundry Anda di bawah ini:
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== "undefined") {
                              const cleanUrl = window.location.origin + window.location.pathname;
                              navigator.clipboard.writeText(cleanUrl);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2500);
                            }
                          }}
                          className={`text-[9.5px] uppercase font-black tracking-wider py-1.5 px-3 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                            copied 
                              ? "bg-emerald-600 text-white" 
                              : "bg-zinc-900 text-white-500 hover:bg-zinc-800 border border-zinc-700 text-zinc-100"
                          }`}
                        >
                          {copied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              Link Tersalin!
                            </>
                          ) : (
                            <>
                              <FileText className="w-3.5 h-3.5 text-amber-500" />
                              Salin Alamat Aplikasi
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                    <li>
                      Buka aplikasi <strong className="text-emerald-950 font-extrabold">Bluefy</strong> di iPhone, tempel (paste) link yang telah disalin ke dalam kolom alamat web, lalu tekan Masuk/Enter.
                    </li>
                    <li>
                      Masuk ke menu <strong className="text-emerald-950 font-extrabold">Hubungkan Printer</strong> di atas dan klik tombol <span className="text-emerald-850 font-black">🟢 Hubungkan Printer</span>. Printer Bluetooth Anda akan langsung terdeteksi &amp; siap dipakai mencetak!
                    </li>
                  </ol>
                </div>
              </div>

              <div className="border-t border-zinc-900 pt-3 mt-1.5 space-y-2">
                <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">
                  Atau gunakan opsi alternatif (Airprint / Tanpa Bluetooth):
                </p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const dummyTrx = {
                        id: "TRX-TEST-AIRPRINT",
                        customerName: "Budi Santoso (TES iOS)",
                        customerPhone: "08123456789",
                        tanggalMasuk: "2026-06-08 10:00:00",
                        estimasiSelesai: "2026-06-09 10:00:00",
                        layananNama: "Cuci Komplit Reguler (3 Kg)",
                        berat: 3,
                        parfum: "Lavender Sensation",
                        notes: "UJI RECURRENT CETAK EMULATOR",
                        totalHarga: 21000,
                        dpAmount: 0,
                        pembayaranMetode: "Tunai",
                        statusBayar: "Lunas"
                      };
                      triggerWebPrint(dummyTrx, "nota", activeCashierName);
                    }}
                    className="py-2.5 px-3 bg-[#0ea5e9]/10 hover:bg-[#0ea5e9]/25 border border-[#0ea5e9]/30 text-[#0ea5e9] hover:text-sky-300 text-[10px] font-black uppercase tracking-wider rounded-lg text-center cursor-pointer transition active:scale-95"
                  >
                    Tes Cetak Nota via AirPrint
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const dummyTrx = {
                        id: "TRX-TEST-LABEL-PRINT",
                        customerName: "Budi Santoso (TES iOS)",
                        customerPhone: "08123456789",
                        tanggalMasuk: "2026-06-08 10:00:00",
                        estimasiSelesai: "2026-06-09 10:00:00",
                        layananNama: "Cuci Komplit Reguler (3 Kg)",
                        berat: 3,
                        parfum: "Lavender Sensation",
                        notes: "UJI RECURRENT LABELS EMULATOR",
                        totalHarga: 21000,
                        dpAmount: 0,
                        pembayaranMetode: "Tunai",
                        statusBayar: "Lunas"
                      };
                      triggerWebPrint(dummyTrx, "label", activeCashierName);
                    }}
                    className="py-2.5 px-3 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-[10px] font-black uppercase tracking-wider rounded-lg text-center cursor-pointer transition active:scale-95"
                  >
                    Tes Cetak Label via AirPrint
                  </button>
                </div>
              </div>
            </div>

            {/* Diagnostic Test Print block */}
            {connected && (
              <div className="border border-zinc-900 rounded-xl overflow-hidden bg-zinc-950/40 p-4 space-y-3 text-left">
                <div className="flex items-center gap-1.5 border-b border-zinc-900 pb-2">
                  <Info className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    ALAT UJI COBA (DIAGNOSTIC TEST PRINT)
                  </h4>
                </div>
                
                <p className="text-[10px] text-zinc-350 leading-relaxed">
                  Silakan cetak data sampel di bawah ini untuk memastikan printer thermal Anda merespon format cetakan kasir dengan benar.
                </p>

                <div className="grid grid-cols-2 gap-3.5 pt-1">
                  {/* Test Nota */}
                  <button
                    type="button"
                    onClick={() => handleDiagnosticTestPrint("nota")}
                    disabled={!!printingStatus}
                    className="flex flex-col items-center justify-center p-3 bg-zinc-900 hover:bg-zinc-850 hover:border-emerald-500 border border-zinc-800 rounded-xl group transition text-center shrink-0 cursor-pointer"
                  >
                    <FileText className="w-5 h-5 text-[#38bdf8] group-hover:scale-110 duration-150 transition" />
                    <span className="text-[10px] font-black uppercase text-zinc-300 tracking-wider mt-1.5">
                      Tes Cetak Nota
                    </span>
                    <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                      Kertas 58mm / 80mm
                    </span>
                  </button>

                  {/* Test Label */}
                  <button
                    type="button"
                    onClick={() => handleDiagnosticTestPrint("label")}
                    disabled={!!printingStatus}
                    className="flex flex-col items-center justify-center p-3 bg-zinc-900 hover:bg-zinc-850 hover:border-emerald-500 border border-zinc-800 rounded-xl group transition text-center shrink-0 cursor-pointer"
                  >
                    <Tag className="w-5 h-5 text-amber-500 group-hover:scale-110 duration-150 transition" />
                    <span className="text-[10px] font-black uppercase text-zinc-300 tracking-wider mt-1.5">
                      Tes Cetak Label
                    </span>
                    <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
                      Label Penanda Baju
                    </span>
                  </button>
                </div>

                {printingStatus && (
                  <div className="bg-zinc-900 p-2 border border-zinc-800 rounded-lg flex items-center justify-between">
                    <span className="text-[9.5px] font-black text-emerald-400 uppercase tracking-wider animate-pulse flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                      {printingStatus}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-850 rounded">
                      {printProgress}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Indonesian Step-by-Step Android / Mobile Pairing Help Sheet */}
            <div className="border border-zinc-900 rounded-xl bg-[#0C0C0E] p-4.5 space-y-3.5 text-left">
              <div className="flex items-center gap-2 border-b border-zinc-900 pb-2">
                <HelpCircle className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-[10.5px] font-black text-emerald-400 uppercase tracking-widest">
                    PANDUAN KONEKSI BLUETOOTH HP / TABLET
                  </h4>
                  <p className="text-[8.5px] font-bold text-zinc-500 uppercase tracking-widest">
                    Solusi jika printer tidak otomatis terdeteksi
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-[11px] text-zinc-300 leading-relaxed font-medium">
                <div className="flex items-start gap-2.5">
                  <div className="bg-emerald-950/60 text-emerald-400 border border-emerald-900/50 w-5 h-5 flex items-center justify-center font-mono font-bold text-[10px] rounded-sm mt-0.5 shrink-0">
                    1
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-[#F4F4F5] flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      Aktifkan Bluetooth &amp; Sinkronisasi HP
                    </p>
                    <p className="text-zinc-400 text-[10px]">
                      Sebelum membuka aplikasi di web, pastikan Bluetooth handphone Anda sudah **ON**.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="bg-emerald-950/60 text-emerald-400 border border-emerald-900/50 w-5 h-5 flex items-center justify-center font-mono font-bold text-[10px] rounded-sm mt-0.5 shrink-0">
                    2
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-[#F4F4F5] flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      Wajib Aktifkan GPS / Lokasi (Android)
                    </p>
                    <p className="text-zinc-400 text-[10px]">
                      Sistem Android mengharuskan izin <strong className="text-white">Lokasi / GPS aktif</strong> agar Google Chrome di HP diizinkan untuk mencari perangkat Bluetooth BLE di sekitar. Pastikan GPS HP Anda aktif saat menekan &quot;Hubungkan Printer&quot;.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="bg-emerald-950/60 text-emerald-400 border border-emerald-900/50 w-5 h-5 flex items-center justify-center font-mono font-bold text-[10px] rounded-sm mt-0.5 shrink-0">
                    3
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-extrabold text-[#F4F4F5]">
                      Lakukan Pairing Terlebih Dahulu di Menu HP
                    </p>
                    <p className="text-zinc-400 text-[10px]">
                      Buka Pengaturan (Settings) Bluetooth di HP Anda, cari printer thermal dan **pasangkan (pair)** terlebih dahulu. Gunakan PIN bawaan dari pabrik printer (biasanya <code className="text-emerald-400 bg-zinc-950 px-1 py-0.5 font-mono border border-zinc-900">0000</code> atau <code className="text-emerald-400 bg-zinc-950 px-1 py-0.5 font-mono border border-zinc-900">1234</code>) lalu pilih Hubungkan di aplikasi ini.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Tab 2: Setting & Pratinjau Label (Responsive Grid view with live preview Mockup!)
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-5 max-h-[75vh] overflow-y-auto no-scrollbar text-left">
            
            {/* LEFT COLUMN: Setting Configuration controls (takes 7 columns on desktop) */}
            <div className="md:col-span-12 lg:col-span-7 space-y-4">
              
              {/* Header Design Panel Card */}
              <div className="p-4 bg-zinc-950/40 border border-zinc-900 rounded-xl space-y-3 pb-5">
                <div className="flex items-center gap-1.5 border-b border-zinc-900 pb-2 justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-[11px] font-black text-zinc-350 uppercase tracking-widest">
                      DESAIN & INFORMASI UTAMA NOTA/LABEL
                    </h4>
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-wider bg-zinc-900 text-zinc-550 border border-zinc-850 px-2 py-0.5">
                    Custom Template
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-1">
                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Nama Toko Laundry</label>
                    <input 
                      type="text" 
                      value={storeName} 
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg font-sans"
                      maxLength={24}
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Format Kode / Nomor Trx</label>
                    <input 
                      type="text" 
                      value={trxNo} 
                      onChange={(e) => setTrxNo(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Nama Pelanggan (Tester)</label>
                    <input 
                      type="text" 
                      value={custName} 
                      onChange={(e) => setCustName(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Parfum Favorit</label>
                    <input 
                      type="text" 
                      value={parfum} 
                      onChange={(e) => setParfum(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Catatan Tambahan / Spesifikasi</label>
                  <input 
                    type="text" 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg font-sans"
                  />
                </div>
              </div>

              {/* Layout adjustments options Panel */}
              <div className="p-4 bg-zinc-950/40 border border-zinc-900 rounded-xl space-y-3 pb-5">
                <div className="flex items-center gap-1.5 border-b border-zinc-900 pb-2">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-[11px] font-black text-zinc-350 uppercase tracking-widest">
                    FORMATTING & TOGGLES TAMPILAN
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pb-2">
                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Mode Label Thermal</label>
                    <select
                      value={labelStylePref}
                      onChange={(e) => setLabelStylePref(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg cursor-pointer"
                    >
                      <option value="full">Lengkap (Rincian Biaya, Detail & Status)</option>
                      <option value="compact">Ringkas (Hanya Tag Bagasi & Kode QR/Pcs)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Ukuran Nama Pelanggan</label>
                    <select
                      value={nameSize}
                      onChange={(e) => setNameSize(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg cursor-pointer"
                    >
                      <option value="regular">Regular (Normal)</option>
                      <option value="large">Besar Centered</option>
                      <option value="xl">Sangat Besar / Double Size (Rekomendasi)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Karakter Garis Pembatas (Divider)</label>
                    <select
                      value={dividerStyle}
                      onChange={(e) => setDividerStyle(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg cursor-pointer"
                    >
                      <option value="dashed">Garis Putus-Putus (---)</option>
                      <option value="double">Garis Ganda Tegas (===)</option>
                      <option value="dotted">Garis Rapat Berbintik (...)</option>
                      <option value="solid">Garis Bawah Solid (___)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Status Pembayaran</label>
                    <select
                      value={statusBayar}
                      onChange={(e) => setStatusBayar(e.target.value as any)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg cursor-pointer"
                    >
                      <option value="Belum Lunas">BELUM LUNAS</option>
                      <option value="Lunas">LUNAS / SELESAI</option>
                      <option value="DP">DP / DEPOSIT</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] text-zinc-450 font-black uppercase tracking-wider block mb-1">Slogan Kaki / Footer Adv</label>
                  <input 
                    type="text" 
                    value={footerSlogan} 
                    onChange={(e) => setFooterSlogan(e.target.value)}
                    className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2.5 outline-none focus:border-emerald-500 rounded-lg font-sans"
                    maxLength={32}
                  />
                </div>

                {/* Checklist options */}
                <div className="flex flex-col gap-2 pt-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-300 hover:text-white transition">
                    <input 
                      type="checkbox" 
                      checked={showItemDetails} 
                      onChange={(e) => setShowItemDetails(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-800 bg-[#070709] accent-emerald-500 cursor-pointer"
                    />
                    <span>Tampilkan Rincian Detail Item (Kaos, Celana, Jaket) di bawah Jasa Kiloan</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-300 hover:text-white transition">
                    <input 
                      type="checkbox" 
                      checked={showPayment} 
                      onChange={(e) => setShowPayment(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-800 bg-[#070709] accent-emerald-500 cursor-pointer"
                    />
                    <span>Tampilkan Status Pembayaran tebal (BELUM LUNAS) di bagian akhir</span>
                  </label>
                </div>
              </div>

              {/* Sandbox calculation values play area */}
              {labelStylePref === "full" && (
                <div className="p-4 bg-zinc-950/40 border border-zinc-900 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-zinc-900 pb-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-[11px] font-black text-zinc-350 uppercase tracking-widest">
                      PLAYGROUND RINCIAN BIAYA & ARITMATIKA
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[8px] text-zinc-450 font-black block mb-1">Berat Kiloan (Kg)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={srv1Qty} 
                        onChange={(e) => setSrv1Qty(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2 outline-none focus:border-emerald-500 rounded-md font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-zinc-450 font-black block mb-1">Tarif / Kg (Rp)</label>
                      <input 
                        type="number" 
                        value={srv1Price} 
                        onChange={(e) => setSrv1Price(parseInt(e.target.value) || 0)}
                        className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2 outline-none focus:border-emerald-500 rounded-md font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-zinc-450 font-black block mb-1">Diskon (Rp)</label>
                      <input 
                        type="number" 
                        value={discountAmount} 
                        onChange={(e) => setDiscountAmount(parseInt(e.target.value) || 0)}
                        className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2 outline-none focus:border-emerald-500 rounded-md font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-zinc-450 font-black block mb-1">Status Printer</label>
                      <span className={`block text-center text-[10px] py-1.5 rounded font-black border uppercase tracking-wider ${
                        connected ? "bg-[#0d2a1f] border-emerald-500 text-emerald-400" : "bg-zinc-900 border-zinc-850 text-zinc-500"
                      }`}>
                        {connected ? "READY" : "OFFLINE"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] text-zinc-450 font-black block mb-0.5">Rincian Celana/Kaos Detail</label>
                    <input 
                      type="text" 
                      value={srv1Detail} 
                      onChange={(e) => setSrv1Detail(e.target.value)}
                      className="w-full text-xs bg-[#070709] border border-zinc-850 text-white p-2 outline-none focus:border-emerald-500 rounded-md font-sans"
                    />
                  </div>
                </div>
              )}

              {/* Command Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveLabelSettings}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-450 text-black text-xs font-black uppercase tracking-widest cursor-pointer rounded-xl transition flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-emerald-500/10 shrink-0"
                >
                  <Save className="w-4 h-4" />
                  SIMPAN PENGATURAN LABEL
                </button>

                <button
                  type="button"
                  onClick={handlePrintLabelSample}
                  disabled={!connected || !!printingStatus}
                  className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 text-center shrink-0 ${
                    connected 
                      ? "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/10" 
                      : "bg-zinc-900 border border-zinc-850 text-zinc-600 disabled:cursor-not-allowed"
                  }`}
                  title={connected ? "Cetak langsung ke thermal printer fisik" : "Printer Bluetooth tidak terhubung"}
                >
                  {printingStatus ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Mencetak...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      Cetak Test Label (BT)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: Pixel-perfect Smartphone Mockup mimicking "Pratinjau Label" perfectly! */}
            <div className="md:col-span-12 lg:col-span-5 flex flex-col items-center">
              
              <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2.5 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                SIMULATOR SCREEN SMARTPHONE
              </div>

              {/* SMARTPHONE CONTAINER OUTER FRAME */}
              <div className="phone-mockup-frame w-[280px] h-[520px] bg-[#1a1a1e] border-8 border-zinc-800 rounded-[30px] shadow-2xl relative flex flex-col overflow-hidden leading-normal shrink-0 select-none">
                
                {/* Speaker mesh & front camera notch element */}
                <div className="absolute top-0 inset-x-0 h-4 flex justify-center items-center pointer-events-none z-50">
                  <div className="w-18 h-3.5 bg-black rounded-b-xl border-x border-b border-zinc-90 w-24" />
                </div>

                {/* 1. Android Status Bar Mockup */}
                <div className="phone-mockup-statusbar pt-3 pb-1 px-4 flex justify-between items-center text-[8.5px] text-zinc-400 font-mono font-bold bg-[#0a0a0c] relative z-40">
                  <div className="flex items-center gap-1.5">
                    <span>1:14 PM</span>
                    <span className="text-[7.5px] px-1 bg-emerald-950 border border-emerald-500 rounded-sm text-emerald-400 leading-none">WIFI</span>
                  </div>
                  <div className="flex items-center gap-1 text-[8.5px]">
                    <span className="text-[7.5px]">38,4KB/d</span>
                    <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                    <Battery className="w-3.5 h-3.5 text-emerald-400" />
                    <span>63</span>
                  </div>
                </div>

                {/* 2. Top Navigation header with back arrow & Title (from requested image) */}
                <div className="phone-mockup-navbar px-4.5 py-3 h-12 bg-[#0a0a0c] border-b border-zinc-900 flex items-center gap-3 relative z-40">
                  <button className="text-zinc-200 cursor-pointer">
                    <ArrowLeft className="w-4 h-4 ml-0.5 mt-0.5" />
                  </button>
                  <span className="text-xs font-black uppercase tracking-wide text-[#F4F4F5]">
                    Pratinjau Label
                  </span>
                </div>

                {/* 3. SCROLLABLE RECEIPT BODY CANVAS */}
                <div className="flex-1 print-preview-paper bg-white p-4.5 overflow-y-auto no-scrollbar flex flex-col justify-start">
                  
                  {/* Store Name Customization */}
                  <div className="text-center mt-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center leading-relaxed block">
                      {storeName || "Damdam Laundry"}
                    </span>
                  </div>

                  {/* Receipt transaction label */}
                  <div className="text-center mt-3 space-y-0.5">
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wide block">
                      No. Transaksi
                    </span>
                    <span className="text-[10px] font-black text-zinc-300 font-mono block">
                      {trxNo || "TRX/260608/00999"}
                    </span>
                  </div>

                  {/* Customer display name centered (Ahmad) */}
                  <div className="text-center py-4 flex items-center justify-center">
                    <span className={`font-black text-[#F4F4F5] tracking-tight uppercase block leading-none transition-all ${
                      nameSize === "xl" ? "text-3xl font-extrabold" : nameSize === "large" ? "text-2xl font-bold" : "text-sm"
                    }`}>
                      {custName || "Ahmad"}
                    </span>
                  </div>

                  {/* If compact view chosen, show simpler tag summary */}
                  {labelStylePref === "compact" ? (
                    <div className="text-[9.5px] font-medium text-zinc-300 space-y-1.5 text-left pt-1">
                      {renderDividerLine()}
                      <div className="flex justify-between">
                        <span className="text-zinc-500 font-bold uppercase">KODE UNIT:</span>
                        <span className="font-mono font-black text-emerald-400 text-xs">{(trxNo && trxNo.length > 4 ? trxNo.substring(4) : "00999").toUpperCase()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500 font-bold">QTY TOTAL:</span>
                        <span className="font-extrabold">{srv1Qty} Kg / Pcs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500 font-bold">LAYANAN:</span>
                        <span className="font-bold">{srv1Name.split(" (")[0]}</span>
                      </div>
                      {parfum && (
                        <div className="flex justify-between">
                          <span className="text-zinc-500 font-bold">PARFUM:</span>
                          <span className="font-bold text-amber-400">{parfum}</span>
                        </div>
                      )}
                      
                      {renderDividerLine()}
                      
                      <div className="flex justify-between">
                        <span className="text-zinc-500 font-bold">TGL MASUK:</span>
                        <span>08 Jun 2026 13:14</span>
                      </div>
                      <div className="flex justify-between text-yellow-500 font-bold">
                        <span className="text-zinc-500">ESTSELESAI:</span>
                        <span>10 Jun 2026 13:14</span>
                      </div>
                      
                      {renderDividerLine()}
                      
                      <div className="text-center font-bold text-[8.5px] text-zinc-400 mt-2 italic">
                        {footerSlogan || "* Bagasi Penanda *"}
                      </div>
                    </div>
                  ) : (
                    // FULL RECEIPT LAYOUT STYLE (Seperti di Gambar)
                    <div className="text-[9.5px] text-zinc-300 font-medium space-y-1">
                      
                      {/* Top tabular block */}
                      <div className="space-y-1 border-t border-zinc-900 pt-2.5">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Waktu</span>
                          <span className="font-bold">08 Jun 2026, 13:14</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-zinc-500">Est. Selesai</span>
                          <span className="font-bold">10 Jun 2026, 13:14</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-zinc-500">Parfum</span>
                          <span className="font-bold text-amber-500/90">{parfum || "Downy Black"}</span>
                        </div>

                        {notes && (
                          <div className="flex justify-between gap-2">
                            <span className="text-zinc-500 shrink-0">Catatan</span>
                            <span className="font-bold truncate text-right max-w-[150px]">{notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Line divider character kustom */}
                      {renderDividerLine()}

                      {/* Services breakdown list */}
                      <div className="space-y-2">
                        {/* Service Item row 1 */}
                        <div className="space-y-0.5 text-left">
                          <span className="font-extrabold text-[#F4F4F5] block">
                            {srv1Name}
                          </span>
                          <div className="flex justify-between pl-1">
                            <span className="text-zinc-400">{srv1Qty} kg x Rp{srv1Price.toLocaleString("id-ID")}</span>
                            <span className="font-bold text-zinc-200">Rp{item1Total.toLocaleString("id-ID")}</span>
                          </div>
                          
                          {/* Optional detailed clothing list */}
                          {showItemDetails && srv1Detail && (
                            <p className="text-[8px] pl-1.5 text-zinc-500 font-sans italic leading-relaxed text-left shrink-0">
                              Detail item: {srv1Detail}
                            </p>
                          )}
                        </div>

                        {/* Service Item row 2 */}
                        {srv2Qty > 0 && (
                          <div className="space-y-0.5 text-left">
                            <span className="font-extrabold text-[#F4F4F5] block">
                              {srv2Name}
                            </span>
                            <div className="flex justify-between pl-1">
                              <span className="text-zinc-400">{srv2Qty} pcs x Rp{srv2Price.toLocaleString("id-ID")}</span>
                              <span className="font-bold text-zinc-200">Rp{item2Total.toLocaleString("id-ID")}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {renderDividerLine()}

                      {/* Billing sums */}
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Subtotal</span>
                          <span className="font-semibold text-zinc-250">Rp{subtotalSum.toLocaleString("id-ID")}</span>
                        </div>

                        {discountAmount > 0 && (
                          <div className="flex justify-between text-emerald-400/90">
                            <span>Diskon</span>
                            <span>-Rp{discountAmount.toLocaleString("id-ID")}</span>
                          </div>
                        )}

                        <div className="flex justify-between text-[11px] font-black border-t border-zinc-950 pt-1">
                          <span className="text-zinc-350">Total</span>
                          <span className="text-white">Rp{grandTotalSum.toLocaleString("id-ID")}</span>
                        </div>
                      </div>

                      {renderDividerLine()}

                      {/* Large centered uppercase Payment status (BELUM LUNAS) */}
                      {showPayment && (
                        <div className="text-center py-2.5 select-none leading-none">
                          <span className={`text-[12.5px] font-black tracking-widest text-[#F4F4F5] uppercase ${
                            statusBayar === "Lunas" 
                              ? "text-emerald-400 font-extrabold" 
                              : "text-red-400 font-black animate-pulse"
                          }`}>
                            {statusBayar.toUpperCase()}
                          </span>
                        </div>
                      )}

                      {/* Footer Advice */}
                      {footerSlogan && (
                        <div className="text-center font-bold text-[8.5px] text-zinc-500 tracking-wide mt-1.5 leading-tight uppercase font-mono">
                          {footerSlogan}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Empty simulated space at end of scroll thermal roll */}
                  <div className="h-6 shrink-0" />
                </div>

                {/* 4. Bottom Simulated Phone Navigation Bar pill */}
                <div className="py-2.5 bg-[#0a0a0c] flex justify-center items-center pointer-events-none relative z-40">
                  <div className="w-24 h-1 bg-zinc-750 rounded-full" />
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Modal Footer with operational info */}
        <div className="p-4 bg-[#0A0A0B] border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-550 font-mono font-bold shrink-0">
          <span>APPLICATIONS VER 2.5</span>
          <span className="text-zinc-650 opacity-40">© CAKRA FINANCE INC</span>
        </div>

      </div>
    </div>
  );
}
