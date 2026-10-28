import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  Sparkles, 
  AlertCircle, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  User, 
  Trash2, 
  MessageSquare, 
  BarChart3, 
  Coins, 
  Settings, 
  Flame 
} from "lucide-react";
import { Expense, Customer, Service, LaundryTransaction } from "../types";

interface AiAssistantProps {
  expenses: Expense[];
  budgetLimit: number;
  transactions: LaundryTransaction[];
  customers: Customer[];
  services: Service[];
  onNavigateToData: (type: string, id: string) => void;
}

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: Date;
}

export function AiAssistant({ 
  expenses, 
  budgetLimit, 
  transactions, 
  customers, 
  services, 
  onNavigateToData 
}: AiAssistantProps) {
  const [activeSegment, setActiveSegment] = useState<"chat" | "analytics">("chat");
  const [typedPrompt, setTypedPrompt] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // General evaluation analysis panel state
  const [analysis, setAnalysis] = useState<string>("");
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Chat message logs state with persistence in localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("damdam_laundry_chat_history_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({
          ...m,
          text: m.text ? m.text.replace(/Sari AI/g, "Damdam AI").replace(/Sari/g, "Damdam") : m.text,
          timestamp: new Date(m.timestamp)
        }));
      } catch (e) {
        console.error("Failed to parsed stored chat:", e);
      }
    }
    return [
      {
        id: "greetings",
        role: "model",
        text: (() => {
          const hours = new Date().getHours();
          let timeGreeting = "pagi";
          if (hours >= 11 && hours < 15) timeGreeting = "siang";
          else if (hours >= 15 && hours < 18) timeGreeting = "sore";
          else if (hours >= 18 || hours < 4) timeGreeting = "malam";
          
          return `### Iya halo Kak! Selamat ${timeGreeting}! 🥰✨\n\nPerkenalkan, saya **Damdam AI**, asisten pribadi, konsultan operasional, sekaligus sahabat keuangan andalan khusus untuk mendampingi ruko **DamDam Laundry** milik Kakak tercinta!\n\nSaat ini, Damdam telah memuat data transaksi kasir dan finansial ruko secara real-time. Kakak bisa mengajak Damdam mengulas pembukuan toko, mendeteksi kebocoran anggaran, melihat pelanggan paling loyal, atau menanyakan tips praktis menekan pengeluaran gas & detergen.\n\n**Yuk, coba tanya hal-hal menarik seperti ini ke Damdam:**\n- 💸 *"Siapa pengeluaran terboros ruko kita?"*\n- 👥 *"Siapa pelanggan setia kita?"*\n- 🧺 *"Apa saja nama layanan terpopuler kita?"*\n- ⚡ *"Bagi tips menghemat gas dryer atau sabun"*`;
        })(),
        timestamp: new Date()
      }
    ];
  });

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Save history to storage
  useEffect(() => {
    localStorage.setItem("damdam_laundry_chat_history_v2", JSON.stringify(messages));
  }, [messages]);

  // Scroll to bottom when message logs grow
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, chatLoading]);

  // Auto-generate leakage evaluation analysis on load
  const runAiAnalysis = async (forceRetry = false) => {
    if (analysis && !forceRetry) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses, budgetLimit }),
      });

      if (!response.ok) {
        throw new Error("Gagal memperoleh respons analisis.");
      }

      const data = await response.json();
      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        throw new Error(data.error || "Gagal memperoleh analisis.");
      }
    } catch (err: any) {
      console.error(err);
      setAnalysisError("Gagal memuat analisis otomatis dari AI.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    runAiAnalysis();
  }, [expenses, budgetLimit]);

  // Handle multi-turn ChatGPT-like send message
  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      text: trimmed,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setTypedPrompt("");
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, text: m.text })),
          expenses,
          budgetLimit,
          transactions,
          customers,
          services
        })
      });

      if (!response.ok) {
        throw new Error("Koneksi gagal");
      }

      const data = await response.json();
      if (data.success) {
        const aiMessage: Message = {
          id: `ai_${Date.now()}`,
          role: "model",
          text: data.reply,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error(data.error || "Gagal memproses respon.");
      }
    } catch (err: any) {
      console.error("Damdam AI Chat Error:", err);
      // Give a graceful network timeout or local feedback message
      const aiMessage: Message = {
        id: `ai_${Date.now()}`,
        role: "model",
        text: `### ⚠️ Gangguan Koneksi atau Layanan AI Sibuk\n\nMaaf, sepertinya saya tidak dapat terhubung dengan server pengolah bahasa terpusat saat ini.\n\n**Sebagai alternatif ringkasan cepat data Anda:**\n- Anda mencatat **${expenses.length} entri pengeluaran**.\n- Terdapat **${transactions.length} total pesanan laundry** masuk di kasir.\n- Total kas pelanggan terdaftar adalah **Ibu ${customers[0]?.nama || "Siti"}** dan teman-teman.\n\nPelayanan asisten akan pulih saat jaringan server atau kunci API Anda stabil. Terus pantau operasional murni ruko laundry Anda!`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  // Clear chat conversation history logs
  const handleClearChat = () => {
    if (window.confirm("Hapus seluruh percakapan aktif dengan Damdam AI?")) {
      const defaultGreeting: Message = {
        id: "greetings",
        role: "model",
        text: "Percakapan dibersihkan. Selamat datang kembali! Saya adalah **Damdam AI**, asisten logistik, keuangan, dan operasional DamDam Laundry. Bagaimana saya bisa membantu Anda mengembangkan unit usaha Anda hari ini? Tulis pertanyaan di bawah ini!",
        timestamp: new Date()
      };
      setMessages([defaultGreeting]);
      localStorage.removeItem("damdam_laundry_chat_history_v2");
    }
  };

  // Reference parsing generator to convert custom markdown bracket links to real buttons
  const renderTextWithReferences = (textLine: string) => {
    const regex = /\[(trx|customer|expense|service):([^\]]+)\]\(([^)]+)\)/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(textLine)) !== null) {
      const [fullMatch, type, id, label] = match;
      const matchIndex = match.index;

      // Add preceding text
      if (matchIndex > lastIndex) {
        elements.push(textLine.substring(lastIndex, matchIndex));
      }

      // Stylized badge depending on types
      let colorClass = "";
      let prefixIcon = "";
      if (type === "trx") {
        colorClass = "bg-sky-950 text-sky-400 border border-sky-850 hover:bg-sky-900 active:bg-sky-950 hover:border-sky-400";
        prefixIcon = "📄 ";
      } else if (type === "customer") {
        colorClass = "bg-purple-950 text-purple-400 border border-purple-850 hover:bg-purple-900 active:bg-purple-950 hover:border-purple-400";
        prefixIcon = "👥 ";
      } else if (type === "expense") {
        colorClass = "bg-amber-950 text-amber-400 border border-amber-850 hover:bg-amber-900 active:bg-amber-950 hover:border-amber-400";
        prefixIcon = "💸 ";
      } else if (type === "service") {
        colorClass = "bg-teal-950 text-teal-400 border border-teal-850 hover:bg-teal-900 active:bg-teal-950 hover:border-teal-400";
        prefixIcon = "🧺 ";
      }

      elements.push(
        <button
          key={matchIndex}
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToData(type, id);
          }}
          className={`inline-flex items-center px-2 py-0.5 mx-1 font-mono rounded-none text-[10px] font-black uppercase tracking-tight duration-150 cursor-pointer shadow-xs ${colorClass}`}
          title={`Lihat detail data ${label}`}
        >
          {prefixIcon}{label}
        </button>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < textLine.length) {
      elements.push(textLine.substring(lastIndex));
    }

    return elements.length > 0 ? <>{elements}</> : textLine;
  };

  // Human-friendly Indonesian markdown visual formatter with embedded reference rendering
  const formattedText = (text: string) => {
    return text.split("\n").map((line, idx) => {
      const cleanLine = line.trim();
      
      if (cleanLine.startsWith("###")) {
        return (
          <h3 key={idx} className="text-[11px] font-black text-white mt-4 mb-2 uppercase tracking-wider border-l-2 border-emerald-500 pl-2">
            {renderTextWithReferences(cleanLine.replace("###", ""))}
          </h3>
        );
      }
      
      if (cleanLine.startsWith("##")) {
        return (
          <h2 key={idx} className="text-xs font-black text-emerald-400 mt-5 mb-2 border-b border-[#27272A] pb-1.5 uppercase tracking-widest">
            {renderTextWithReferences(cleanLine.replace("##", ""))}
          </h2>
        );
      }
      
      if (cleanLine.startsWith("**") && cleanLine.endsWith("**")) {
        return (
          <h4 key={idx} className="font-extrabold text-zinc-100 mt-3 text-xs uppercase tracking-wide">
            {renderTextWithReferences(cleanLine.replace(/\*\*/g, ""))}
          </h4>
        );
      }
      
      if (cleanLine.startsWith("-") || cleanLine.startsWith("*")) {
        const parts = cleanLine.substring(1).split(":");
        if (parts.length > 1) {
          return (
            <div key={idx} className="ml-2 mb-2 leading-relaxed text-xs text-zinc-400 flex items-start gap-1.5">
              <span className="text-emerald-500 font-black mt-0.5 shrink-0">•</span>
              <span className="font-medium">
                <strong className="text-zinc-100 font-extrabold uppercase">{parts[0].replace(/\*\*/g, "")}:</strong>
                {renderTextWithReferences(parts.slice(1).join(":"))}
              </span>
            </div>
          );
        }
        return (
          <div key={idx} className="ml-2 mb-2 leading-relaxed text-xs text-zinc-400 flex items-start gap-1.5">
            <span className="text-emerald-500 font-black mt-0.5 shrink-0">•</span>
            <span className="font-medium">{renderTextWithReferences(cleanLine.substring(1).replace(/\*\*/g, ""))}</span>
          </div>
        );
      }

      if (/^\d+\./.test(cleanLine)) {
        const dotIndex = cleanLine.indexOf(".");
        const content = cleanLine.substring(dotIndex + 1);
        const parts = content.split(":");
        return (
          <div key={idx} className="ml-2 mb-2.5 leading-relaxed text-xs text-zinc-400 flex items-start gap-2">
            <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 font-mono text-[9px] w-5 h-5 flex items-center justify-center shrink-0 mt-0.5 font-bold">
              {cleanLine.substring(0, dotIndex)}
            </span>
            <span className="font-medium">
              {parts.length > 1 ? (
                <>
                  <strong className="text-zinc-100 font-black uppercase text-xs">{parts[0].replace(/\*\*/g, "")}:</strong>
                  {renderTextWithReferences(parts.slice(1).join(":"))}
                </>
              ) : (
                renderTextWithReferences(content.replace(/\*\*/g, ""))
              )}
            </span>
          </div>
        );
      }

      if (cleanLine === "") return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-xs text-zinc-400 leading-relaxed mb-2 font-semibold">
          {renderTextWithReferences(cleanLine.replace(/\*\*/g, ""))}
        </p>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B] text-white">
      
      {/* 1. TOP HEADER BRAND */}
      <div className="p-4 bg-[#121214] border-b border-[#27272A] shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-950 border border-[#27272A] flex items-center justify-center relative shrink-0">
            <Bot className="w-5 h-5 text-emerald-400" />
            <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-black uppercase tracking-wider">Asisten Bisnis Damdam AI</h2>
              <span className="bg-emerald-500 text-black font-mono text-[8px] font-black px-1.5 py-0.5 uppercase tracking-wider">
                V2.5
              </span>
            </div>
            <p className="text-[9px] text-zinc-400 uppercase font-black tracking-wider mt-0.5">
              KONSULTAN KHUSUS OPERASIONAL & LAYANAN LAUNDRY
            </p>
          </div>
        </div>
        
        {activeSegment === "chat" && (
          <button
            onClick={handleClearChat}
            className="p-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-red-500/50 text-zinc-500 hover:text-red-400 transition-all rounded-none"
            title="Bersihkan Percakapan"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. DUAL SEGMENT TAB SWITCH */}
      <div className="grid grid-cols-2 bg-[#121214] border-b border-zinc-900 shrink-0 select-none">
        <button
          onClick={() => setActiveSegment("chat")}
          className={`py-3 text-center text-[10.5px] font-black uppercase tracking-widest transition-all relative flex items-center justify-center gap-1.5 ${
            activeSegment === "chat" ? "text-emerald-400 bg-[#0A0A0B]/50" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Damdam Chat Room (ChatGPT)
          {activeSegment === "chat" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
          )}
        </button>
        <button
          onClick={() => setActiveSegment("analytics")}
          className={`py-3 text-center text-[10.5px] font-black uppercase tracking-widest transition-all relative flex items-center justify-center gap-1.5 ${
            activeSegment === "analytics" ? "text-emerald-400 bg-[#0A0A0B]/50" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Analis Kebocoran Anggaran
          {activeSegment === "analytics" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
          )}
        </button>
      </div>

      {/* 3. DYNAMIC CONTENT CONTAINER */}
      {activeSegment === "chat" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Chat scrolling feed */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
          >
            {messages.map((m) => {
              const isAi = m.role === "model";
              return (
                <div 
                  key={m.id} 
                  className={`flex gap-3 max-w-[85%] ${isAi ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                >
                  {/* Avatar wrapper */}
                  <div className={`w-8 h-8 rounded-none flex items-center justify-center shrink-0 border uppercase font-mono text-[10px] font-black ${
                    isAi 
                      ? "bg-emerald-950 text-emerald-400 border-emerald-900" 
                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                  }`}>
                    {isAi ? "AI" : <User className="w-4 h-4 text-zinc-400" />}
                  </div>

                  {/* Bubble body */}
                  <div className={`p-4 rounded-none border text-xs leading-relaxed relative ${
                    isAi 
                      ? "bg-[#121214] border-zinc-850 hover:border-zinc-8 * text-zinc-100" 
                      : "bg-zinc-950 border-[#27272A] text-zinc-200"
                  }`}>
                    {isAi && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" />}
                    
                    <div className="prose whitespace-pre-line text-zinc-300">
                      {formattedText(m.text)}
                    </div>
                    
                    <div className="mt-2 text-[8px] uppercase tracking-wide font-mono text-zinc-650 text-right">
                      {m.timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Chat loading typing bubble */}
            {chatLoading && (
              <div className="flex gap-3 max-w-[80%] mr-auto">
                <div className="w-8 h-8 rounded-none bg-emerald-950 border-emerald-900 border flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-emerald-400 animate-spin" />
                </div>
                <div className="p-3.5 bg-[#121214] border border-zinc-850 text-xs text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  Damdam AI sedang membaca statistik ruko Anda...
                </div>
              </div>
            )}
          </div>

          {/* Preset Chips Quick Actions above input box */}
          <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-900 overflow-x-auto whitespace-nowrap flex gap-1.5 shrink-0 no-scrollbar">
            <button
              onClick={() => handleSendMessage("💡 Siapa pelanggan teraktif kita bulan ini?")}
              className="py-1 px-3 bg-[#111112] border border-zinc-850 hover:border-emerald-500 text-zinc-300 transition-all font-semibold uppercase text-[9px] rounded-none cursor-pointer"
            >
              👥 Pelanggan Teraktif
            </button>
            <button
              onClick={() => handleSendMessage("💡 Ulas pengeluaran paling boros dan bocorkah anggaran kita?")}
              className="py-1 px-3 bg-[#111112] border border-zinc-850 hover:border-emerald-500 text-zinc-300 transition-all font-semibold uppercase text-[9px] rounded-none cursor-pointer"
            >
              💸 Biaya Terboros
            </button>
            <button
              onClick={() => handleSendMessage("💡 Beri tips efisiensi gas pengering & detergen laundry")}
              className="py-1 px-3 bg-[#111112] border border-zinc-850 hover:border-emerald-500 text-zinc-300 transition-all font-semibold uppercase text-[9px] rounded-none cursor-pointer"
            >
              ⚡ Hemat Sabun & Gas
            </button>
            <button
              onClick={() => handleSendMessage("💡 Apa jenis layanan laundry kita yang paling diminati?")}
              className="py-1 px-3 bg-[#111112] border border-zinc-850 hover:border-emerald-500 text-zinc-300 transition-all font-semibold uppercase text-[9px] rounded-none cursor-pointer"
            >
              🧺 Layanan Terlaris
            </button>
          </div>

          {/* Custom chat footer input bar */}
          <div className="p-3 bg-[#121214] border-t border-[#27272A] shrink-0">
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (typedPrompt.trim()) handleSendMessage(typedPrompt);
              }}
              className="flex gap-1.5"
            >
              <input
                type="text"
                value={typedPrompt}
                onChange={(e) => setTypedPrompt(e.target.value)}
                placeholder="Diskusikan tuntas operasional kita dengan Damdam AI..."
                className="flex-1 px-3 py-2.5 text-xs bg-zinc-950 border border-[#27272A] focus:outline-none focus:border-emerald-500 font-semibold text-zinc-200 placeholder-zinc-650 rounded-none"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || !typedPrompt.trim()}
                className="px-4 bg-emerald-500 text-black text-xs font-black hover:bg-emerald-400 transition-colors disabled:opacity-40 flex items-center justify-center min-w-[38px] rounded-none cursor-pointer uppercase tracking-wider"
              >
                {chatLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Analytics Tab Section */
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">
          <div className="bg-[#121214] border border-[#27272A] rounded-none p-4 relative overflow-hidden shrink-0">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
            <div className="flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h4 className="text-[10px] uppercase tracking-wider font-black text-white">Analis Kebocoran Finansial Otomatis</h4>
                <p className="text-[9px] text-zinc-400 mt-0.5 font-bold uppercase tracking-tight">Damdam AI menyisir pos-pos pembelanjaan sabun, gas, penyusutan mesin dan membandingkannya terhadap anggaran.</p>
              </div>
            </div>
          </div>

          <div className="bg-[#121214] border border-[#27272A] rounded-none p-5 flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between border-b border-[#27272A] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span className="text-[9.5px] font-black uppercase text-zinc-300 tracking-wider">Laporan Hasil Audit Anggaran</span>
              </div>
              <button
                onClick={() => runAiAnalysis(true)}
                disabled={analysisLoading}
                className="py-1 px-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-emerald-500 text-[9px] font-black text-emerald-400 tracking-wider uppercase flex items-center gap-1.5 rounded-none cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${analysisLoading ? "animate-spin" : ""}`} /> Refresh Audit
              </button>
            </div>

            {analysisLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                <SpinnerBot />
                <p className="text-xs font-black text-emerald-400 animate-pulse uppercase tracking-wider mt-3">Sedang mereview neraca laba-rugi ruko...</p>
                <p className="text-[9px] text-zinc-500 mt-1 max-w-[210px] uppercase font-bold tracking-tight">Membandingkan total pengeluaran operasional Anda terhadap batas anggaran Rp {(budgetLimit || 0).toLocaleString("id-ID")}.</p>
              </div>
            ) : analysisError ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-rose-500">
                <AlertCircle className="w-8 h-8 opacity-70 mb-2" />
                <p className="text-xs font-black uppercase tracking-wider">Kesalahan Memuat Analisis</p>
                <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-tight">Gagal terhubung atau Kunci API dibatasi. Coba klik refresh di pojok kanan atas.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-0.5">
                <div className="prose text-zinc-300 leading-relaxed">
                  {formattedText(analysis)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Simple spinning logo loading helper
function SpinnerBot() {
  return (
    <div className="relative">
      <Bot className="w-10 h-10 text-emerald-500 animate-bounce" />
      <Sparkles className="w-5 h-5 text-emerald-400 absolute -top-1 -right-1 animate-pulse" />
    </div>
  );
}
