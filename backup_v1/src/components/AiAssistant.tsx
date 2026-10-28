import React, { useState, useEffect } from "react";
import { Bot, Sparkles, AlertCircle, RefreshCw, Send, CheckCircle2 } from "lucide-react";
import { Expense } from "../types";

interface AiAssistantProps {
  expenses: Expense[];
  budgetLimit: number;
}

export function AiAssistant({ expenses, budgetLimit }: AiAssistantProps) {
  const [analysis, setAnalysis] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [typedPrompt, setTypedPrompt] = useState("");
  const [customResponse, setCustomResponse] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  // Auto-generate analysis on component load
  const runAiAnalysis = async (forceRetry = false) => {
    if (analysis && !forceRetry) return; // cache results

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses, budgetLimit }),
      });

      if (!response.ok) {
        throw new Error("Gagal memperoleh respons dari server.");
      }

      const data = await response.json();
      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        throw new Error(data.error || "Gagal memperoleh analisis.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Gagal terhubung ke Asisten AI. Kunci API tidak tersedia atau server sibuk.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAiAnalysis();
  }, [expenses, budgetLimit]);

  // Handle preset consulting questions
  const askPresetQuestion = async (question: string) => {
    setCustomLoading(true);
    setCustomResponse(null);
    setTypedPrompt(question);
    
    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          expenses, 
          budgetLimit, 
          customPrompt: question 
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCustomResponse(data.analysis);
      } else {
        throw new Error("Respons gagal.");
      }
    } catch (err) {
      // Offline fallback responses for immediate Indonesian laundry consulting
      let fallbackText = "";
      if (question.includes("Detergen")) {
        fallbackText = `### 🧴 Tips Penghematan Detergen & Pewangi
1. **Gunakan Dispenser Takaran Otomatis atau Gelas Takar**: Jangan biarkan karyawan menuangkan langsung dari jerigen. 1 kelebihan tutup botol per muatan mesin 7kg dapat merugikan Rp 2.500.000,- lebih dalam setahun.
2. **Beralih ke Detergen Konsentrat Rendah Busa (He - High Efficiency)**: Detergen khusus ini membersihkan pakaian lebih optimal dan membutuhkan pembilasan air 50% lebih sedikit, menghemat pengeluaran air PDAM secara signifikan.
3. **Membeli dalam Drum Besar (Curah)**: Bekerjasamalah dengan pabrik sabun kimia rumahan bersertifikat. Harga detergen per liter bisa turun dari Rp 15.000 menjadi Rp 8.000.`;
      } else if (question.includes("listrik")) {
        fallbackText = `### ⚡ Tips Efisiensi Air & Listrik Mesin Cuci
1. **Aturan Muatan Penuh (Full Load Only)**: Jalankan mesin hanya ketika kapasitas terisi minimal 80%. Mencuci 2kg pada mesin 8kg membuang 75% air dan energi listrik percuma.
2. **Koneksi Air Gravitasi (Tandon Atas / Torn)**: Gunakan tangki penampung air di atas atap ruko. Mesin cuci menyedot air tanpa paksaan pompa listrik dorong secara terus menerus, menekan tagihan listrik PLN hingga 20%.
3. **Suhu Air Dingin (Cold Water)**: Jangan gunakan fitur pemanas air bawaan mesin cuci (heater) kecuali noda medis membandel. Elemen pemanas menyedot daya hingga 2000 Watt!`;
      } else if (question.includes("Gaji")) {
        fallbackText = `### 👥 Aturan Porsi Gaji Karyawan Laundry Sehat
1. **Idealnya 25% - 30% dari Omset Bulanan**: Total gaji seluruh karyawan (kasir, cuci, setrika) tidak boleh melebihi sepertiga pemasukan bruto laundry.
2. **Skema Insentif Kiloan (Upah per KG)**: Berikan gaji pokok kecil + bonus per kilogram pakaian yang diselesaikan (misalnya Rp 500/kg untuk penyetrika). Ini memacu produktivitas, menjaga efisiensi usaha, serta mencegah karyawan malas-malasan saat sepi.`;
      } else {
        fallbackText = `### 🔥 Hemat Gas Dryer (Mesin Pengering)
1. **Bersihkan Lint Filter Tiap Selesai Siklus**: Debu serat kain menyumbat saringan udara panas, membuat waktu pengeringan bertambah dari 40 menit menjadi 60 menit. Ini meningkatkan konsumsi gas melon (LPG) sebesar 33%.
2. **Gunakan Bola Pengering (Dryer Balls)**: Masukkan 4-6 bola wool/plastik ke dalam mesin pengering. Bola ini memisahkan lembaran pakaian sehingga udara panas mengalir rata, menyingkat waktu pengeringan sebesar 15%.`;
      }
      setCustomResponse(fallbackText);
    } finally {
      setCustomLoading(false);
    }
  };

  const handleCustomSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedPrompt.trim()) return;
    askPresetQuestion(typedPrompt);
  };

  // Human-friendly Indonesian markdown visual formatter
  const formattedText = (text: string) => {
    return text.split("\n").map((line, idx) => {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("###")) {
        return <h3 key={idx} className="text-xs font-black text-white mt-4 mb-2 uppercase tracking-widest">{cleanLine.replace("###", "")}</h3>;
      }
      if (cleanLine.startsWith("##")) {
        return <h2 key={idx} className="text-xs font-black text-emerald-400 mt-5 mb-2 border-b border-[#27272A] pb-1.5 uppercase tracking-widest">{cleanLine.replace("##", "")}</h2>;
      }
      if (cleanLine.startsWith("**") && cleanLine.endsWith("**")) {
        return <h4 key={idx} className="font-extrabold text-zinc-100 mt-3 text-xs uppercase tracking-wide">{cleanLine.replace(/\*\*/g, "")}</h4>;
      }
      if (cleanLine.startsWith("-") || cleanLine.startsWith("*")) {
        // Render sub elements with bold headings
        const parts = cleanLine.substring(1).split(":");
        if (parts.length > 1) {
          return (
            <div key={idx} className="ml-2 mb-2 leading-relaxed text-xs text-zinc-400 flex items-start gap-1.5 font-semibold">
              <span className="text-emerald-500 font-bold">•</span>
              <span>
                <strong className="text-zinc-100 font-black uppercase">{parts[0].replace(/\*\*/g, "")}:</strong>
                {parts.slice(1).join(":")}
              </span>
            </div>
          );
        }
        return (
          <div key={idx} className="ml-2 mb-2 leading-relaxed text-xs text-zinc-400 flex items-start gap-1.5 font-semibold">
            <span className="text-emerald-500 font-bold">•</span>
            <span>{cleanLine.substring(1).replace(/\*\*/g, "")}</span>
          </div>
        );
      }
      if (/^\d+\./.test(cleanLine)) {
        // Matches numbered list "1. Tips"
        const dotIndex = cleanLine.indexOf(".");
        const content = cleanLine.substring(dotIndex + 1);
        const parts = content.split(":");
        return (
          <div key={idx} className="ml-2 mb-2.5 leading-relaxed text-xs text-zinc-400 flex items-start gap-2">
            <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 font-mono text-[9px] w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
              {cleanLine.substring(0, dotIndex)}
            </span>
            <span>
              {parts.length > 1 ? (
                <>
                  <strong className="text-zinc-100 font-black uppercase text-xs">{parts[0].replace(/\*\*/g, "")}:</strong>
                  {parts.slice(1).join(":")}
                </>
              ) : (
                content.replace(/\*\*/g, "")
              )}
            </span>
          </div>
        );
      }
      if (cleanLine === "") return <div key={idx} className="h-2" />;
      return <p key={idx} className="text-xs text-zinc-400 leading-relaxed mb-2 font-medium">{cleanLine.replace(/\*\*/g, "")}</p>;
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-4 py-4 bg-[#0A0A0B] text-white scroll-smooth animate-fade-in">
      {/* Advisor Header Frame */}
      <div className="bg-[#121214] border border-[#27272A] p-4 text-white hover:border-zinc-800 transition-all relative overflow-hidden mb-5 rounded-none shadow-sm pb-5">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
        <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-5">
          <Bot className="w-32 h-32" />
        </div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-12 h-12 rounded-none bg-zinc-950 flex items-center justify-center border border-zinc-850 shrink-0">
            <Bot className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-black uppercase tracking-wider">Asisten Keuangan Sari AI</h2>
              <span className="bg-emerald-500 text-black font-mono text-[9px] font-black px-1.5 py-0.5 rounded-none uppercase tracking-wider">
                AKTIF
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-wider mt-1">
              KONSULTAN KHUSUS OPERASIONAL LAUNDRY UMKM ANDA
            </p>
          </div>
        </div>
      </div>

      {/* Preset Consulting Queries */}
      <div className="mb-4">
        <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> DISKUSI & TIPS INSTAN
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => askPresetQuestion("💡 Bagaimana cara menghemat biaya Detergen?")}
            className="p-2.5 bg-zinc-950 border border-[#27272A] text-left rounded-none hover:border-emerald-500 hover:bg-[#121214] transition-all text-xs text-zinc-200 font-bold cursor-pointer shadow-xs flex flex-col justify-between min-h-[70px]"
          >
            <span className="uppercase text-[10px] tracking-wide">🧴 Hemat Sabun & Pewangi</span>
            <span className="text-[9px] text-emerald-400 mt-1 font-black uppercase tracking-wider">TANYA AI &rarr;</span>
          </button>
          <button
            onClick={() => askPresetQuestion("💡 Tips efisiensi air & listrik mesin cuci laundry?")}
            className="p-2.5 bg-zinc-950 border border-[#27272A] text-left rounded-none hover:border-emerald-500 hover:bg-[#121214] transition-all text-xs text-zinc-200 font-bold cursor-pointer shadow-xs flex flex-col justify-between min-h-[70px]"
          >
            <span className="uppercase text-[10px] tracking-wide">⚡ Tekan Token & PDAM</span>
            <span className="text-[9px] text-emerald-400 mt-1 font-black uppercase tracking-wider">TANYA AI &rarr;</span>
          </button>
          <button
            onClick={() => askPresetQuestion("💡 Berapa porsi upah atau gaji ideal karyawan laundry?")}
            className="p-2.5 bg-zinc-950 border border-[#27272A] text-left rounded-none hover:border-emerald-500 hover:bg-[#121214] transition-all text-xs text-zinc-200 font-bold cursor-pointer shadow-xs flex flex-col justify-between min-h-[70px]"
          >
            <span className="uppercase text-[10px] tracking-wide">👥 Gaji Karyawan Sehat</span>
            <span className="text-[9px] text-emerald-400 mt-1 font-black uppercase tracking-wider">TANYA AI &rarr;</span>
          </button>
          <button
            onClick={() => askPresetQuestion("💡 Cara merawat mesin pengering / dryer agar hemat gas?")}
            className="p-2.5 bg-zinc-950 border border-[#27272A] text-left rounded-none hover:border-emerald-500 hover:bg-[#121214] transition-all text-xs text-zinc-200 font-bold cursor-pointer shadow-xs flex flex-col justify-between min-h-[70px]"
          >
            <span className="uppercase text-[10px] tracking-wide">🔥 Rawat & Hemat Mesin</span>
            <span className="text-[9px] text-emerald-400 mt-1 font-black uppercase tracking-wider">TANYA AI &rarr;</span>
          </button>
        </div>
      </div>

      {/* Custom Consultation input form */}
      <form onSubmit={handleCustomSend} className="mb-5 flex gap-1.5">
        <input
          type="text"
          value={typedPrompt}
          onChange={(e) => setTypedPrompt(e.target.value)}
          placeholder="Tanya hal lain (misl: cara negosiasi sewa)..."
          className="flex-1 px-3 py-2.5 text-xs bg-zinc-950 border border-[#27272A] rounded-none focus:outline-none focus:border-emerald-500 font-semibold text-zinc-200 placeholder-zinc-650"
        />
        <button
          type="submit"
          disabled={customLoading || !typedPrompt.trim()}
          className="px-4 bg-emerald-500 text-black text-xs font-black rounded-none hover:bg-emerald-450 transition-colors disabled:opacity-40 flex items-center justify-center cursor-pointer min-w-[38px] uppercase tracking-wider"
        >
          {customLoading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </form>

      {/* Preset Custom response if any */}
      {customResponse && (
        <div className="p-4 bg-zinc-950 border border-emerald-500 rounded-none shadow-md mb-5 relative animate-fade-in text-white">
          <button 
            onClick={() => setCustomResponse(null)} 
            className="absolute top-2.5 right-2.5 text-[9px] font-black text-zinc-500 hover:text-white uppercase tracking-widest"
          >
            [ BATAL ]
          </button>
          <div className="flex items-center gap-1.5 mb-2.5 text-[#10B981] font-black text-[11px] uppercase tracking-widest border-b border-[#27272A] pb-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Hasil Jawaban Konsultasi AI
          </div>
          <div className="prose text-zinc-350">
            {formattedText(customResponse)}
          </div>
        </div>
      )}

      {/* Main Expenses Analysis Panel */}
      <div className="bg-[#121214] border border-[#27272A] rounded-none shadow-xs p-4 flex-1 flex flex-col min-h-[300px]">
        <div className="flex items-center justify-between border-b border-[#27272A] pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-500" />
            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">
              Analis Kebocoran Anggaran
            </h4>
          </div>
          <button
            onClick={() => runAiAnalysis(true)}
            disabled={loading}
            className="p-1 px-2.5 bg-zinc-950 border border-zinc-850 rounded-none hover:border-emerald-500 transition-all text-[9px] font-black text-zinc-300 uppercase tracking-wider flex items-center gap-1 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <div className="relative mb-3">
              <Bot className="w-10 h-10 text-emerald-500 animate-bounce" />
              <Sparkles className="w-5 h-5 text-emerald-400 absolute -top-1 -right-1.5 animate-pulse" />
            </div>
            <p className="text-xs font-black text-white animate-pulse uppercase tracking-wider">Sari AI sedang menganalisa struktur keuangan...</p>
            <p className="text-[10px] text-zinc-500 mt-1 max-w-[210px] uppercase font-bold tracking-tight">Membandingkan pengeluaran sabun, listrik, air, dan pemeliharaan mesin terhadap anggaran Anda.</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-rose-500">
            <AlertCircle className="w-8 h-8 opacity-70 mb-2" />
            <p className="text-xs font-black uppercase tracking-wider">Terjadi Gangguan Koneksi</p>
            <p className="text-[10px] text-zinc-500 mt-1 max-w-[220px] uppercase font-bold tracking-tight">
              Sari AI menyajikan simulasi analisis lokal karena Kunci API Gemini belum diaktifkan.
            </p>
            <button
              onClick={() => runAiAnalysis(true)}
              className="mt-3 text-[9px] bg-zinc-950 hover:bg-zinc-900 text-emerald-400 font-black py-1.5 px-3 rounded-none border border-[#27272A] uppercase tracking-wider cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-0.5">
            <div className="prose">
              {formattedText(analysis)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
