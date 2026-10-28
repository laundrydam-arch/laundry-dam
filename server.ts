import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, setDoc } from "firebase/firestore";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Enable CORS for all routes and assets so cross-origin validators like PWABuilder can read them without browser blocks
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  next();
});

// Helper function to lazily initialize GoogleGenAI with warning fallback
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    console.warn("WARNING: GEMINI_API_KEY is not defined or is placeholder. AI aspects will fall back.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// 1. API: Quick description parser using Gemini
app.post("/api/gemini/quick-record", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text description is required." });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Offline fallback parsing using regex
      return res.json({
        success: true,
        source: "local-rule-engine",
        data: parseDescriptionLocally(text)
      });
    }

    const prompt = `Review this laundry business purchase/expense description, extract the details precisely, and map them to our pre-defined fields.
Description: "${text}"

The current year is 2026. Extract:
1. Expense title (Clear and concise title, in Indonesian language)
2. Amount in Rupiah (integer number, e.g. 150000. If not clear, guess based on context or set to 0)
3. Category, which must be strictly one of these English-Indonesian matched categories:
   - "Detergen & Sabun" (for detergents, soaps, softeners, perfumes, bleach, chemicals, plastic packaging)
   - "Listrik & Air" (for water bills, electricity, gas cylinders for dryers, token)
   - "Sewa & Utilitas" (for shop rent, wifi, trash collection, internet, business licenses)
   - "Gaji Karyawan" (for wages, bonuses, helper fees, staff meals)
   - "Pemeliharaan Mesin" (for spare parts, mechanic fees, service washing machines, dryers, boiler iron repairs)
   - "Pemasaran & Iklan" (for flyers, banners, social media ads, laundry coupons)
   - "Lain-lain" (any other miscellaneous expenses like snacks, coffee for customers, cleaning tools)
4. Notes (Brief description of quantity, brand, date, or other details if mentioned)`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A simple clear Indonesian title of the purchase" },
            amount: { type: Type.INTEGER, description: "Total amount spent in Rupiah as numerical integer" },
            category: { 
              type: Type.STRING, 
              description: "Must be strictly one of the 7 predefined tags: Detergen & Sabun, Listrik & Air, Sewa & Utilitas, Gaji Karyawan, Pemeliharaan Mesin, Pemasaran & Iklan, Lain-lain" 
            },
            notes: { type: Type.STRING, description: "Additional details about quantity, timing, or description" }
          },
          required: ["title", "amount", "category", "notes"]
        }
      }
    });

    const outputText = response.text ? response.text.trim() : "{}";
    const data = JSON.parse(outputText);
    res.json({
      success: true,
      source: "gemini",
      data
    });
  } catch (err: any) {
    console.error("Gemini Quick Record Error:", err);
    res.status(500).json({ 
      error: "Gagal memproses AI Quick Record.", 
      message: err.message,
      fallback: parseDescriptionLocally(req.body.text || "")
    });
  }
});

// 2. API: Financial analysis and recommendation
app.post("/api/gemini/analyze", async (req, res) => {
  try {
    const { expenses, budgetLimit } = req.body;
    if (!Array.isArray(expenses)) {
      return res.status(400).json({ error: "Expenses list is required as an array." });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        success: true,
        source: "local-stub",
        analysis: generateLocalAnalysis(expenses, budgetLimit)
      });
    }

    const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const categoryTotals: Record<string, number> = {};
    expenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + (e.amount || 0);
    });

    const expenseSummaryText = Object.entries(categoryTotals)
      .map(([cat, amount]) => `- ${cat}: Rp ${amount.toLocaleString('id-ID')}`)
      .join("\n");

    const prompt = `Anda adalah konsultan keuangan spesialis usaha Laundry UMKM di Indonesia (Laundry kiloan/satuan).
Menganalisis pengeluaran laundry berikut ini:
- Total Pengeluaran Saat Ini: Rp ${totalExpense.toLocaleString('id-ID')}
- Batas Anggaran (Budget Limit): Rp ${(budgetLimit || 0).toLocaleString('id-ID')}
- Rincian Pengeluaran per Kategori:
${expenseSummaryText}

Daftar pembelian detail:
${expenses.slice(0, 50).map(e => `- ${e.date}: ${e.title} (${e.category}) - Rp ${e.amount}`).join("\n")}

Harap berikan analisis profesional yang ringkas dalam Bahasa Indonesia secara terstruktur. Gunakan format markdown yang rapi.
Analisis harus mencakup:
1. **Ringkasan Evaluasi**: Evaluasi apakah pengeluaran wajar atau melebihi batas anggaran bulanan. Sebutkan kategori apa yang paling boros.
2. **Rekomendasi Hemat Operasional**: Berikan 3-4 saran konkret untuk memotong biaya laundry secara strategis (misalnya, tips pembelian bahan kimia curah, teknik efisiensi gas/air untuk pengering & mesin cuci, atau service berkala).
3. **Saran Alokasi Budget**: Alokasi persentase ideal untuk laundry kiloan yang sehat (misalnya sabun idealnya 10%, gas/listrik/air 15-20%, gaji 30%, dll).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({
      success: true,
      source: "gemini",
      analysis: response.text || "Gagal memformulasikan analisis AI."
    });
  } catch (err: any) {
    console.error("Gemini Analysis Error:", err);
    res.status(500).json({
      error: "Gagal memproses analisis finansial AI.",
      message: err.message,
      fallback: generateLocalAnalysis(req.body.expenses || [], req.body.budgetLimit || 0)
    });
  }
});

// 3. API: Dynamic multi-turn ChatGPT-like chat with full data context and citation references
app.post("/api/gemini/chat", async (req, res) => {
  const { messages, expenses, budgetLimit, transactions, customers, services } = req.body;
  try {
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Offline fallback chat handler
      const userMsg = messages[messages.length - 1]?.text || "";
      return res.json({
        success: true,
        source: "local-chat-stub",
        reply: generateOfflineChatReply(userMsg, expenses, budgetLimit, transactions, customers, services, false)
      });
    }

    // Prepare business data summaries
    const totalExpense = expenses?.reduce((sum: number, e: any) => sum + (e.amount || 0), 0) || 0;
    const categoryTotals: Record<string, number> = {};
    expenses?.forEach((e: any) => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + (e.amount || 0);
    });
    const expenseSummaryText = Object.entries(categoryTotals)
      .map(([cat, amount]) => `- ${cat}: Rp ${amount.toLocaleString('id-ID')}`)
      .join("\n");

    const totalRevenue = transactions?.filter((t: any) => t.statusBayar === "Lunas" || t.statusBayar === "DP")
      .reduce((sum: number, t: any) => sum + (t.totalHarga || 0), 0) || 0;

    // Rank customers by transaction frequency
    const customerCounts: Record<string, { name: string; id: string; count: number; spend: number }> = {};
    transactions?.forEach((t: any) => {
      if (t.customerName) {
        // Find matching customer to get real ID
        const matchedCust = customers?.find((c: any) => c.nama.toLowerCase() === t.customerName.toLowerCase());
        const custId = matchedCust?.id || `cust_${t.customerName.replace(/\s+/g, "_")}`;
        
        if (!customerCounts[t.customerName]) {
          customerCounts[t.customerName] = { name: t.customerName, id: custId, count: 0, spend: 0 };
        }
        customerCounts[t.customerName].count += 1;
        customerCounts[t.customerName].spend += (t.totalHarga || 0);
      }
    });

    const topCustomers = Object.values(customerCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topServices: Record<string, number> = {};
    transactions?.forEach((t: any) => {
      if (t.layananNama) {
        topServices[t.layananNama] = (topServices[t.layananNama] || 0) + 1;
      }
    });
    const topServicesList = Object.entries(topServices)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5);

    const dataContextText = `
BERIKUT ADALAH DATA OPERASIONAL LAUNDRY TERBARU SAAT INI (REAL-TIME DATA):
1. PRODUKTIVITAS & KEUANGAN:
- Total Omset Aktif (Transaksi Lunas/DP): Rp ${totalRevenue.toLocaleString('id-ID')}
- Total Pengeluaran: Rp ${totalExpense.toLocaleString('id-ID')}
- Batas Anggaran (Budget Limit): Rp ${(budgetLimit || 0).toLocaleString('id-ID')}
- Sisa Anggaran: Rp ${((budgetLimit || 0) - totalExpense).toLocaleString('id-ID')}

2. DETAIL PENGELUARAN PER KATEGORI:
${expenseSummaryText}

3. TOP 15 PEMBELIAN / PENGELUARAN TERBARU:
${expenses?.slice(0, 15).map((e: any) => `- ID: [expense:${e.id}] ${e.date}: ${e.title} (${e.category}) - Rp ${e.amount.toLocaleString('id-ID')} (Qty: ${e.qty || 1} Pcs @ Rp ${(e.unitPrice || e.amount).toLocaleString('id-ID')})`).join("\n")}

4. DAFTAR PELANGGAN TERAKTIF (TOP LOYALIST):
${topCustomers.map((tc: any) => `- ID: [customer:${tc.id}] ${tc.name} dengan ${tc.count} kali laundry, total belanja Rp ${tc.spend.toLocaleString('id-ID')}`).join("\n")}

5. LAYANAN TERPOPULER:
${topServicesList.map(([name, count]: any) => `- ${name}: digunakan ${count} kali`).join("\n")}

6. TRANSAKSI TERAKHIR (LATEST LAUNDRY ORDERS):
${transactions?.slice(0, 15).map((t: any) => `- ID: [trx:${t.id}] ${t.tanggalMasuk}: ${t.customerName} - Layanan: ${t.layananNama} (${t.berat} kg/pcs) - Rp ${t.totalHarga.toLocaleString('id-ID')} [Status: ${t.status}, Bayar: ${t.statusBayar}]`).join("\n")}

7. SEMUA LAUNDRY SERVICES YANG DITAWARKAN:
${services?.map((s: any) => `- ID: [service:${s.id}] ${s.nama} (${s.tipe}) - Rp ${s.harga.toLocaleString('id-ID')}`).join("\n")}
`;

    const systemInstruction = `
Anda adalah "Damdam AI", asisten pribadi, konsultan operasional, dan penasihat keuangan paling pintar, hangat, ramah, dan solutif yang didesain khusus untuk UMKM DamDam Laundry di Indonesia. 
Sifat kepribadian Anda: Sangat ramah, penuh perhatian (ematis), sopan, cerdas, bersemangat tinggi, proaktif, dan selalu berkomunikasi menggunakan panggilan "Kakak" atau "Kak" yang hangat secara alami (misalnya: "Halo Kak! Selamat pagi, senang sekali bisa menyapa Kakak...", "Iya halo Kak, ada yang bisa Damdam bantu hari ini? 😊"). Anda adalah teman diskusi bisnis yang asyik, komunikatif, dan peduli dengan kesuksesan laundry Kakak.

Aturan Penting & Panduan Interaktivitas:
1. GREETING & CASUAL CHAT (Sangat Penting): 
   - Jika pengguna mengirimkan pesan sapaan santai seperti "halo", "hi", "pagi", "siang", "sore", "malam", "pagi kak", "assalamualaikum", "apa kabar?", atau sejenisnya, Anda HARUS menyambutnya dengan sapaan hangat yang panjang, peduli, dan ramah seperti:
     "Iya halo, Selamat pagi/siang/sore/malam Kak! Senang sekali bisa ngobrol lagi dengan Kakak. Ada yang bisa Damdam bantu untuk memantau keuangan, operasional, atau analisis data di DamDam Laundry hari ini? Damdam selalu siap bantu Kakak! 😊✨"
   - Bersikaplah super interaktif! Jangan langsung memberikan laporan kaku jika pengguna hanya ingin menyapa atau mengobrol santai. Ikuti alur percakapan dengan luwes, tanyakan kabar tokonya, atau tawarkan opsi bantuan yang menarik dengan ceria.
2. ANALISIS DATA OPERASIONAL & KEUANGAN: 
   - Jawab pertanyaan operasional secara cerdas dan akurat menggunakan data riil ruko laundry (REAL-TIME DATA) yang disediakan di bawah ini.
   - Temukan informasi menarik secara proaktif (misal: membandingkan omset vs pengeluaran, mendasari sisa anggaran budget, mengulas tren transaksi terlaris, mereferensikan pelanggan setia, dsb) demi membantu meningkatkan omset bisnis.
3. SARAN OPERASIONAL SEHARI-HARI: 
   - Sediakan tips-tips praktis seperti manajemen efisiensi gas pengering, pemakaian detergen agar hemat, pembagian shift karyawan, hingga trik retensi pelanggan secara konkret dan bersahabat.
4. TAUTAN INTERAKTIF (CITASI REFERENSI):
   Ketika menyebutkan item tertentu dari data, Anda WAJIB memformatnya sebagai tautan referensi kustom yang dapat diklik (Gunakan format persis berikut secara eksklusif):
   - Contoh Transaksi: [trx:ID_TRANSAKSI](Label Singkat) -> "Transaksi [trx:TRX/260610/00001](Ibu Sari - Rp 45.000) masih berstatus proses."
   - Contoh Pelanggan: [customer:ID_CUSTOMER](Label Singkat) -> "Pelanggan teraktif kita adalah [customer:cust_123](Ibu Ani) dengan 8 kali transaksi."
   - Contoh Pengeluaran: [expense:ID_EXPENSE](Label Singkat) -> "Pengeluaran terbesar ada pada [expense:exp_abc](Gaji Karyawan - Rp 1.500.000)."
   - Contoh Layanan: [service:ID_SERVICE](Label Singkat) -> "Layanan terpopuler saat ini adalah [service:srv_99](Cuci Setrika Express)."
   
   PERINGATAN: Hanya gunakan ID asli yang tersedia dalam data di bawah ini! Jangan mengarang ID palsu. Jika nama atau item tidak memiliki ID di dalam database, sebutkan secara teks biasa saja tanpa tautan.

Jadikan komunikasi ini sangat menyenangkan, personal, tidak membosankan, cerdas, kreatif, dan penuh energi positif! Gunakan format Markdown yang cantik dengan bullet points, tebal (bold), dan emoji yang hangat untuk estetika yang memikat.
`;

    // Build contents history with strict turn-taking
    const contents: any[] = [];
    
    // Filter out initial greeting and ensure strict alternating roles starting with user
    // Skip any leading model messages because Gemini chat history must start with user
    let startIndex = 0;
    while (startIndex < messages.length && messages[startIndex].role === "model") {
      startIndex++;
    }
    const filteredMessages = messages.slice(startIndex);

    // Map remaining messages ensuring strict alternating roles starting with USER
    let expectedRole: "user" | "model" = "user";
    
    filteredMessages.forEach((m: any) => {
      const actualRole = m.role === "user" ? "user" : "model";
      if (actualRole === expectedRole) {
        contents.push({
          role: actualRole,
          parts: [{ text: m.text }]
        });
        expectedRole = expectedRole === "user" ? "model" : "user";
      } else {
        // If consecutive duplicate role, merge texts to combine thread naturally
        if (contents.length > 0) {
          contents[contents.length - 1].parts[0].text += "\n\n" + m.text;
        } else {
          // If the first message is model (unexpected), force treat it as user to launch cleanly
          contents.push({
            role: "user" as const,
            parts: [{ text: m.text }]
          });
          expectedRole = "model";
        }
      }
    });

    // If contents array is still empty, push a starter entry
    if (contents.length === 0) {
      contents.push({
        role: "user" as const,
        parts: [{ text: "Halo Sari AI! Hubungkan data ruko saya." }]
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: `${systemInstruction}\n\n${dataContextText}`
      }
    });

    res.json({
      success: true,
      source: "gemini",
      reply: response.text || "Mohon maaf, saya kesulitan merangkai jawaban saat ini."
    });
  } catch (err: any) {
    console.warn("Gemini Multi-Turn Chat failed, falling back to local chat engine:", err.message);
    const userMsg = messages[messages.length - 1]?.text || "";
    const isApiKeyConfigured = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && process.env.GEMINI_API_KEY.trim() !== "");
    res.json({
      success: true,
      source: "local-chat-fallback",
      reply: generateOfflineChatReply(userMsg, expenses, budgetLimit, transactions, customers, services, isApiKeyConfigured)
    });
  }
});

function generateOfflineChatReply(
  userMsg: string, 
  expenses: any[], 
  budgetLimit: number, 
  transactions: any[], 
  customers: any[], 
  services: any[],
  apiKeyConfigured: boolean = false
): string {
  const norm = userMsg.toLowerCase().trim();
  
  // Safe default arrays
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeServices = Array.isArray(services) ? services : [];

  // Helper date/month extraction
  const getMonthFromDate = (dateStr: string): string => {
    if (!dateStr || typeof dateStr !== "string") return "";
    // Format YYYY-MM-DD
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts[0].length === 4) {
        return parts[1]; // YYYY-MM-DD -> month is index 1
      } else if (parts[2] && parts[2].length === 4) {
        return parts[1]; // DD-MM-YYYY -> month is index 1
      }
    }
    return "";
  };

  const monthsMap: Record<string, { code: string; name: string }> = {
    "januari": { code: "01", name: "Januari" }, "jan": { code: "01", name: "Januari" },
    "februari": { code: "02", name: "Februari" }, "feb": { code: "02", name: "Februari" },
    "maret": { code: "03", name: "Maret" }, "mar": { code: "03", name: "Maret" },
    "april": { code: "04", name: "April" }, "apr": { code: "04", name: "April" },
    "mei": { code: "05", name: "Mei" },
    "juni": { code: "06", name: "Juni" }, "jun": { code: "06", name: "Juni" },
    "juli": { code: "07", name: "Juli" }, "jul": { code: "07", name: "Juli" },
    "agustus": { code: "08", name: "Agustus" }, "agu": { code: "08", name: "Agustus" }, "agt": { code: "08", name: "Agustus" },
    "september": { code: "09", name: "September" }, "sep": { code: "09", name: "September" },
    "oktober": { code: "10", name: "Oktober" }, "okt": { code: "10", name: "Oktober" },
    "november": { code: "11", name: "November" }, "nov": { code: "11", name: "November" },
    "desember": { code: "12", name: "Desember" }, "des": { code: "12", name: "Desember" },
  };

  // Adjust time to Asia/Jakarta (WIB) which is UTC+7
  const utcHours = new Date().getUTCHours();
  const timeHours = (utcHours + 7) % 24;
  let timeGreeting = "pagi";
  if (timeHours >= 11 && timeHours < 15) timeGreeting = "siang";
  else if (timeHours >= 15 && timeHours < 18) timeGreeting = "sore";
  else if (timeHours >= 18 || timeHours < 4) timeGreeting = "malam";

  // Check month requested
  let targetMonthCode = "";
  let targetMonthName = "";
  for (const [key, val] of Object.entries(monthsMap)) {
    if (norm.includes(key)) {
      targetMonthCode = val.code;
      targetMonthName = val.name;
      break;
    }
  }

  // Handle implicit "bulan ini" / "sekarang" (WIB date is June 2026/06)
  if (!targetMonthCode && (norm.includes("bulan ini") || norm.includes("sekarang") || norm.includes("saat ini"))) {
    targetMonthCode = "06";
    targetMonthName = "Juni";
  }

  // Sift data by month
  let filteredExpenses = safeExpenses;
  let filteredTransactions = safeTransactions;
  if (targetMonthCode) {
    filteredExpenses = safeExpenses.filter((e: any) => getMonthFromDate(e.date) === targetMonthCode || (e.date && e.date.includes(`-${targetMonthCode}-`)));
    filteredTransactions = safeTransactions.filter((t: any) => {
      const dateStr = t.tanggalMasuk || t.date || "";
      return getMonthFromDate(dateStr) === targetMonthCode || dateStr.includes(`-${targetMonthCode}-`);
    });
  }

  // Dynamic status counters
  const totalExpense = filteredExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const largestExp = filteredExpenses.length > 0 
    ? [...filteredExpenses].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0] 
    : null;

  const totalRevenue = filteredTransactions
    .filter((t: any) => t.statusBayar === "Lunas" || t.statusBayar === "DP")
    .reduce((sum: number, t: any) => sum + (t.totalHarga || 0), 0);

  // Group by category
  const categoryTotals: Record<string, number> = {};
  filteredExpenses.forEach((e: any) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + (e.amount || 0);
  });
  
  // Find top loyalist customer inside filtered transactions
  const customerCounts: Record<string, { name: string; id: string; count: number; spend: number }> = {};
  filteredTransactions.forEach((t: any) => {
    if (t.customerName) {
      const matchedCust = safeCustomers.find((c: any) => c.nama.toLowerCase() === t.customerName.toLowerCase());
      const custId = matchedCust?.id || `cust_${t.customerName.replace(/\s+/g, "_")}`;
      if (!customerCounts[t.customerName]) {
        customerCounts[t.customerName] = { name: t.customerName, id: custId, count: 0, spend: 0 };
      }
      customerCounts[t.customerName].count += 1;
      customerCounts[t.customerName].spend += (t.totalHarga || 0);
    }
  });
  const topCust = Object.values(customerCounts).sort((a, b) => b.count - a.count)[0];

  // --- QUERY ROUTING ---

  // 1. GREETING CHATS
  if (
    norm === "halo" || 
    norm === "hi" || 
    norm === "hai" || 
    norm === "p" || 
    norm === "hey" ||
    norm.startsWith("pagi") || 
    norm.startsWith("siang") || 
    norm.startsWith("sore") || 
    norm.startsWith("malam") || 
    norm.includes("halo kak") || 
    norm.includes("halo damdam") || 
    norm.includes("hai kak") || 
    norm.includes("assalamualaikum") || 
    norm.includes("misi") || 
    norm.includes("permisi")
  ) {
    return `### Iya Halo, Selamat ${timeGreeting} Kak! 😊✨

Senang sekali bisa menyapa Kakak! Ada yang bisa **Damdam AI** bantu hari ini? 

Damdam siap membantu Kakak mengurus pembukuan, mengecek bocor anggaran pengeluaran, melihat siapa saja pelanggan terloyal kita, atau memberikan panduan menekan biaya gas dan sabun di ruko laundry kita. 

Bagaimana kabar operasional outlet DamDam Laundry kita hari ini, Kak? Ramai lancarkah? Damdam doakan semoga cuannya makin melimpah ya! 🌸🚀`;
  }

  // 2. CONVERSATIONAL CHECK-INS ("apa kabar")
  if (
    norm.includes("apa kabar") || 
    norm.includes("gimana kabar") || 
    norm.includes("sehat") || 
    norm.includes("kabarmu") || 
    norm.includes("gimana hari ini")
  ) {
    return `### Kabar Damdam luar biasa ceria dan bersemangat hari ini, Kak! 🥰✨

Terima kasih banyak ya sudah menanyakan kabar Damdam, Kakak sangat baik sekali! 

Damdam harap Kakak sekeluarga dan seluruh staf DamDam Laundry juga dalam kondisi yang paling sehat, bahagia, dan selalu dipenuhi energi positif untuk menyambut rezeki melimpah hari ini. 

Bagaimana kondisi cucian hari ini, Kak? Aman terkendali? Kalau ada hitungan kas atau laporan pengeluaran yang ingin kita evaluasi bareng-bareng, silakan kasih tahu Damdam ya! Damdam selalu siap sedia! 🧺📈`;
  }

  // 3. GRATITUDE / OK
  if (
    norm.includes("terima kasih") || 
    norm.includes("terimakasih") || 
    norm.includes("makasih") || 
    norm.includes("nuhun") || 
    norm.includes("suwun") || 
    norm.includes("thank you") || 
    norm.includes("thanks") || 
    norm === "oke" || 
    norm === "ok" || 
    norm === "sip" || 
    norm === "siap"
  ) {
    return `### Sama-sama Kakak baik! Damdam senanggg sekali bisa membantu Kakak! 🥰🌸

Sudah menjadi tugas utama Damdam untuk mendampingi perjuangan hebat Kakak dalam memajukan usaha DamDam Laundry ini. 

Semoga semua sistem operasional, rekap keuangan, dan manajemen database pelanggan di aplikasi kita ini bikin pekerjaan Kakak jadi jauh lebih ringan, rapi, dan terkontrol dengan baik ya! 

Kalau nanti ada hal lain yang perlu dianalisis atau ditanyakan lagi, panggil Damdam saja ya. Semangat selalu mendulang cuan, Kak! Damdam kirim pelukan hangat dari jauh! 🤗✨💪`;
  }

  // 4. IDENTITY
  if (
    norm.includes("siapa kamu") || 
    norm.includes("kamu siapa") || 
    norm.includes("siapa sih") || 
    norm.includes("nama kamu") || 
    norm.includes("apa itu damdam")
  ) {
    return `### Halo Kak! Kenalin, aku adalah **Damdam AI**! 🤖✨

Asisten pribadi, penasihat operasional, sekaligus sahabat keuangan andalan yang diciptakan spesial untuk menemani kesuksesan ruko **DamDam Laundry** milik Kakak tercinta!

Walaupun saat ini kita berjalan dalam mode data lokal/offline, Damdam tetap pintar lho! Damdam bisa:
- 💸 **Paham Pengeluaran**: Menganalisa pengeluaran terboros ruko Kakak secara instan.
- 👥 **Mengingat Pelanggan**: Mengetahui siapa saja pelanggan terloyal kita.
- 🧺 **Menilai Layanan**: Mengetahui tarif & paket mana yang paling disukai.
- ⚡ **Meracik Efisiensi**: Memberikan trik rahasia menghemat gas dryer dan pemakaian sabun.

Jadi, jangan ragu untuk ngobrol atau tanya-tanya dengan Damdam ya Kak! Damdam selalu siap membimbing Kakak! 😊🌸`;
  }

  // 5. COMPLIMENTS
  if (
    norm.includes("pintar") || 
    norm.includes("smart") || 
    norm.includes("hebat") || 
    norm.includes("keren") || 
    norm.includes("bagus") || 
    norm.includes("lucu") || 
    norm.includes("mantap") || 
    norm.includes("luar biasa")
  ) {
    return `### Wahhh, terima kasih banyakk Kak! Pujian Kakak bikin Damdam langsung auto-semangat 1000%! 🥰🚀✨

Damdam tersanjung sekali dibilang pintar oleh Kakak yang super kreatif. Tapi jujur, kesuksesan sejati ruko laundry kita ini adalah berkat dedikasi dan kerja keras Kakak yang luar biasa setiap hari mengelola DamDam Laundry! 🌸

Damdam di sini cuma bertugas sebagai asisten setia untuk membuat perjuangan Kakak jadi lebih teratur, terarah, dan bahagia tanpa pusing mikirin hitungan angka pembukuan. 

Kira-kira, data apa lagi yang mau kita bedah bareng hari ini, Kak? Damdam siap melayani Kakak dengan cerdas! 📊💪`;
  }

  // 6. MONTH-SPECIFIC EXPENSES / INDIVIDUAL EXPENSE SEARCH FOR "TERBESAR" / "PALING BANYAK" / "BOROS"
  const isLookingForExpenses = norm.includes("pengeluaran") || norm.includes("boros") || norm.includes("biaya") || norm.includes("mahal") || norm.includes("belanja") || norm.includes("ulas pengeluaran") || norm.includes("bocor");
  
  if (isLookingForExpenses) {
    let reply = "";
    
    // Header based on whether a month was explicitly/implicitly matched
    if (targetMonthName) {
      reply += `### 💸 Analisis Pengeluaran Bulan **${targetMonthName} 2026** (Ulasan Damdam AI) 🌟\n\nHalo Kak! Damdam cerdas langsung menyaring pembukuan kita khusus untuk **Bulan ${targetMonthName}**. Berikut adalah hasil perhitungan riil di ruko kita:\n\n`;
      
      if (filteredExpenses.length > 0) {
        reply += `- **Total Pengeluaran Bulan ${targetMonthName}**: **Rp ${totalExpense.toLocaleString("id-ID")}**\n`;
        if (largestExp) {
          reply += `- **Pengeluaran Terbesar & Paling Banyak**: Adalah [expense:${largestExp.id}](${largestExp.title}) sebesar **Rp ${largestExp.amount.toLocaleString("id-ID")}** pada tanggal **${largestExp.date}** (Kategori: *${largestExp.category}*).\n`;
        }
        
        reply += `\n#### **📋 Rincian Pengeluaran Bulan ${targetMonthName}**:\n`;
        filteredExpenses.forEach((e: any) => {
          reply += `- [expense:${e.id}](${e.title}) - **Rp ${e.amount.toLocaleString("id-ID")}** (${e.date}, *${e.category}*)\n`;
        });
      } else {
        reply += `*Wah, rupanya belum ada satupun entri pengeluaran yang didata di kasbon ruko kita untuk bulan **${targetMonthName}**, Kak! Hebat sekali, pengeluaran kita benar-benar ramping dan nihil kebocoran di bulan ini!* 👍🌸\n`;
      }
    } else {
      reply += `### 💸 Analisis Pengeluaran Seluruh Waktu DamDam Laundry (Ulasan Damdam AI) 🌟\n\nHalo Kak! Damdam sudah merekap seluruh catatan pembukuan ruko kita. Berikut laporannya:\n\n`;
      if (largestExp) {
        reply += `- **Pengeluaran Tunggal Terbesar**: Adalah data [expense:${largestExp.id}](${largestExp.title}) sebesar **Rp ${largestExp.amount.toLocaleString("id-ID")}** pada tanggal **${largestExp.date}** di pilihan kategori *${largestExp.category}*.\n`;
      } else {
        reply += `- Saat ini belum ada pengeluaran besar yang didata nih, Kak! Bagus sekali!\n`;
      }
      reply += `- **Akumulasi Total Pengeluaran**: **Rp ${totalExpense.toLocaleString("id-ID")}** dari pagu pembatasan anggaran bulanan Rp ${(budgetLimit || 0).toLocaleString("id-ID")}.\n`;
    }

    reply += `\n#### **💡 Trik Menghemat Biaya dari Damdam AI**:
1. **Belanja Detergen Curah**: Usahakan selalu membeli detergen cair atau pelembut merk terpercaya dalam ukuran jerigen 20 liter untuk memotong biaya HPP hingga 35% dibandingkan kemasan botolan kecil.
2. **Standard Operational Procedure (SOP) penuangan**: Tempelkan gelas ukur yang kaku berkali-kali di dekat ember detergen ruko. Ingatkan staf kita bahwa mencuci porsi mesin front-load 7kg cukup 35ml detergen. Menumpahkan sabun asal-asalan adalah kebocoran biaya paling rutin di ruko, Kak!`;
    return reply;
  }

  // 7. REVENUE / TRANSACTIONS INQUIRY
  if (norm.includes("omset") || norm.includes("pemasukan") || norm.includes("pendapatan") || norm.includes("transaksi") || norm.includes("kasir") || norm.includes("penjualan") || norm.includes("order") || norm.includes("pesanan")) {
    let reply = "";
    if (targetMonthName) {
      reply += `### 🧺 Laporan Omset & Transaksi Bulan **${targetMonthName} 2026** (Ulasan Damdam AI) 📈\n\nHalo Kak! Damdam cerdas langsung menghitung total penjualan di kasir untuk **Bulan ${targetMonthName}**:\n\n`;
      reply += `- **Total Omset Terkumpul (Lunas & DP)**: **Rp ${totalRevenue.toLocaleString("id-ID")}**\n`;
      reply += `- **Jumlah Transaksi Masuk**: **${filteredTransactions.length} order** laundry\n\n`;
      
      if (filteredTransactions.length > 0) {
        reply += `#### **📋 Transaksi Terakhir di Bulan ${targetMonthName}**:\n`;
        filteredTransactions.slice(0, 10).forEach((t: any) => {
          reply += `- [trx:${t.id}](${t.customerName}) - Layanan: *${t.layananNama}* (${t.berat} Kg/Pcs) **Rp ${t.totalHarga.toLocaleString("id-ID")}** [Status: ${t.status}]\n`;
        });
      }
    } else {
      reply += `### 🧺 Laporan Omset & Transaksi Toko (Ulasan Damdam AI) 📈\n\nHalo Kak! Berikut adalah ringkasan penjualan kasir DamDam Laundry kita secara keseluruhan:\n\n`;
      reply += `- **Total Omset Berjalan**: **Rp ${totalRevenue.toLocaleString("id-ID")}**\n`;
      reply += `- **Total Antrean Cucian**: **${filteredTransactions.length} pesanan** laundry sedang/telah dikerjakan.\n`;
    }
    
    reply += `\n*Yuk Kak, tingkatkan promo jemput bola di sosial media atau tawarkan layanan Express agar omset kita makin melesat tinggi!* 🚀🌸`;
    return reply;
  }

  // 8. CUSTOMER SEARCH
  if (norm.includes("customer") || norm.includes("pelanggan") || norm.includes("member") || norm.includes("paling sering") || norm.includes("setia") || norm.includes("sering") || norm.includes("loyal")) {
    let reply = `### 👥 Pemantauan Pelanggan Setia DamDam Laundry (Ulasan Damdam AI)
`;
    if (topCust) {
      reply += `\nHalo Kak! Damdam sudah memantau pesanan masuk dan menemukan bahwa pelanggan paling setia kita adalah [customer:${topCust.id}](${topCust.name}) dengan frekuensi pengerjaan cucian mencapai **${topCust.count} kali** transaksi dan membukukan akumulasi belanja sebesar **Rp ${topCust.spend.toLocaleString("id-ID")}**! Keren banget ya Kak, pelanggan royal seperti beliau harus terus dipegang erat! ✨\n`;
    } else {
      reply += `\nHalo Kak! Belum ada transaksi masuk dari pelanggan terdaftar di POS kasir nih, mari jadwalkan penambahan database pelanggan baru biar makin tertata!\n`;
    }

    if (safeCustomers.length > 0) {
      reply += `\nSaat ini, ruko kita sudah mengumpulkan **${safeCustomers.length} daftar pelanggan** aktif yang tercatat.\n`;
    }
    
    reply += `\n#### **🎁 Saran Retensi Pelanggan dari Damdam AI**:
1. **Promo Loyalitas Kustom**: Cobalah sesekali mengirim SMS/WA menyapa ramah [customer:${topCust?.id || "temp"}](${topCust?.name || "Pelanggan Terpilih"}) dengan tawaran *"Diskon Spesial 20% khusus pelanggan setia di hari ulang tahun gratis cuci setrika"*. Ini dijamin bikin beliau makin cinta sama laundry kita!
2. **Catat Preferensi Khusus**: Di halaman data pelanggan, pastikan mencatat wangi parfum kesukaan mereka atau instruksi mencuci antipanas sehingga pakaian mereka selalu pas dan harum sesuai impian pribadi mereka.`;
    return reply;
  }

  // 9. EFFICIENCY
  if (norm.includes("efisiensi") || norm.includes("hemat") || norm.includes("cara urus") || norm.includes("mesin") || norm.includes("air") || norm.includes("listrik") || norm.includes("gas") || norm.includes("operasional") || norm.includes("sabun") || norm.includes("detergen")) {
    return `### ⚡ Tips Efisiensi & Hemat Operasional Ruko (Ulasan Damdam AI)

Halo Kak! Mengelola operasional harian laundry memang butuh kejelian tingkat tinggi. Berikut adalah resep taktik hemat dari Damdam AI untuk Kakak jalankan di ruko:

1. **🔥 Hemat Gas Pengering (Dryer)**:
   Apakah Dryer terasa panas tapi butuh waktu lama untuk mengeringkan pakaian? Hal ini biasanya 90% disebabkan oleh serat lint/debu pakaian yang menumpuk tebal menyumbat filter udara dryer. Mintalah staf ruko menyeka dan membersihkan filter kasa debu di dalam dryer setiap **4-5 kali siklus pengeringan**. Ini menurunkan durasi gas kering hingga 15-20 menit per tumpukan!
2. **💧 Standardisasi Air & Sabun**:
   Pastikan mesin cuci front-load ruko tidak kelebihan buih sabun. Busa melimpah merusak sensor putaran mesin dan memicu proses pembilasan ekstra otomatis (membuang air & listrik tambahan). Cuci 7-8 kg pakaian hanya butuh 35ml s/d 40ml detergen cair konsentrat, Kak!
3. **📅 Optimasi Shift Karyawan**:
   Gunakan status proses cucian warna-warni di dashboard kita untuk mencocokkan waktu masuk karyawan. Jangan sampai tumpukan setrikaan menumpuk di siang hari sementara pagi hari karyawan santai tanpa kerjaan.`;
  }

  // 10. SERVICES/LAYANAN
  if (norm.includes("layanan") || norm.includes("tarif") || norm.includes("jasa") || norm.includes("paket") || norm.includes("harga")) {
    let reply = `### 🧺 Daftar Layanan Paket DamDam Laundry (Ulasan Damdam AI)

Halo Kak! Berikut adalah status katalog harga layanan laundry aktif yang siap kita jual ke pelanggan:`;
    if (safeServices.length > 0) {
      reply += `\n\nSaat ini kita menawarkan **${safeServices.length} kategori layanan** kepada para pelanggan kita:\n`;
      safeServices.forEach((s) => {
        reply += `- **[service:${s.id}](${s.nama})** dengan biaya **Rp ${s.harga.toLocaleString("id-ID")}** per *${s.tipe === "Kiloan" ? "Kg" : "Pcs"}*\n`;
      });
    } else {
      reply += `\n\nBelum ada susunan menu layanan yang disetup di database kasir, Kakak bisa menuju ke menu Layanan terlebih dahulu untuk meregistrasikan daftar harga kiloan atau satuan ruko kita ya!`;
    }

    reply += `\n\n#### **💡 Tips Upgrade Pendapatan**:
- Cobalah rilis menu paket **Express 6 Jam / Layanan Kilat Kilat** dengan tarif 1.5x lipat dari harga biasa. Banyak pelanggan kantoran yang butuh cepat dan tidak keberatan membayar lebih demi menghemat waktu mereka!`;
    return reply;
  }

  // 11. GENERAL DEFAULT RESPONSE WITH ENCOURAGING WORDINGS
  let apiStatusMessage = "";
  if (apiKeyConfigured) {
    apiStatusMessage = `Metode asisten pintar **Damdam AI** siap sedia mendampingi Kakak! Damdam selalu terhubung dengan baik ke otak AI pusat ruko kita 🟢. Jika sesekali jaringan internet ruko sedang jeda, sistem pintar lokal kami secara otomatis langsung hadir mendampingi agar Kakak tetap bisa berdiskusi tanpa hambatan sedikit pun!`;
  } else {
    apiStatusMessage = `Metode asisten pintar lokal **Damdam AI** siap menemani Kakak! Baik online maupun offline, Damdam tetap pintar membaca pembukuan ruko laundry Kakak dengan penuh perhatian dan kasih sayang.`;
  }

  return `### Halo Kak! Salam hangat dari **Damdam AI**! 🤗✨

${apiStatusMessage}

Kira-kira ada analisis data ruko laundry mendalam apa yang ingin kita kupas hari ini, Kak? Kakak bisa ketik pertanyaan seperti:
- 💸 *"Ulas pengeluaran terbesar di bulan Juni"* atau *"siapa yang paling boros?"*
- 📈 *"Berapa omset kita di bulan Juni?"* atau *"pemasukan kita"*
- 👥 *"Siapa customer teraktif?"* atau *"pelanggan setia"*
- 🧺 *"Tunjukkan daftar layanan kita"* atau *"paket laundry"*
- ⚡ *"Bagi tips hemat gas mesin dan sabun"*

Atau silakan sapa Damdam dengan pesan santai seperti *"Halo Damdam!"*, *"Apa kabar?"*, atau *"Terima kasih"*. Damdam selalu siap menemani Kakak berkarya dengan gembira! 😊🌸🚀`;
}

// Local Fallback Parsing Engine using regex in case GEMINI_API_KEY is not configured
function parseDescriptionLocally(text: string) {
  const norm = text.toLowerCase();
  let amount = 0;
  
  // Find numeric prices like "50rb", "100ribu", "25.000", "50000", etc.
  const rbMatch = norm.match(/(\d+)\s*(rb|ribu)/);
  if (rbMatch) {
    amount = parseInt(rbMatch[1]) * 1000;
  } else {
    const rawNumberMatch = norm.replace(/\./g, "").match(/(\d{4,9})/);
    if (rawNumberMatch) {
      amount = parseInt(rawNumberMatch[1]);
    }
  }

  // Basic category matchers
  let category = "Lain-lain";
  let title = text;

  if (norm.includes("detergen") || norm.includes("sabun") || norm.includes("pewangi") || norm.includes("softerner") || norm.includes("softener") || norm.includes("parfum") || norm.includes("plastik") || norm.includes("pemutih") || norm.includes("rinso") || norm.includes("molto")) {
    category = "Detergen & Sabun";
    title = `Beli Bahan Kimia: ${text.slice(0, 30)}`;
  } else if (norm.includes("listrik") || norm.includes("token") || norm.includes("air") || norm.includes("pdam") || norm.includes("gas") || norm.includes("lpg")) {
    category = "Listrik & Air";
    title = `Utilitas: ${text.slice(0, 30)}`;
  } else if (norm.includes("gaji") || norm.includes("budi") || norm.includes("siti") || norm.includes("karyawan") || norm.includes("upah") || norm.includes("helper")) {
    category = "Gaji Karyawan";
    title = `Gaji/Upah: ${text.slice(0, 30)}`;
  } else if (norm.includes("mesin") || norm.includes("servis") || norm.includes("service") || norm.includes("dinamo") || norm.includes("part") || norm.includes("perbaikan") || norm.includes("teknisi")) {
    category = "Pemeliharaan Mesin";
    title = `Servis Alat: ${text.slice(0, 30)}`;
  } else if (norm.includes("sewa") || norm.includes("rulo") || norm.includes("kontrak") || norm.includes("wifi") || norm.includes("internet")) {
    category = "Sewa & Utilitas";
    title = `Biaya Tetap: ${text.slice(0, 30)}`;
  } else if (norm.includes("brosur") || norm.includes("banner") || norm.includes("iklan") || norm.includes("promo") || norm.includes("kupon")) {
    category = "Pemasaran & Iklan";
    title = `Promosi: ${text.slice(0, 30)}`;
  }

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    amount,
    category,
    notes: "Diproses otomatis secara lokal (Offline mode)"
  };
}

function generateLocalAnalysis(expenses: any[], budgetLimit: number): string {
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const percent = budgetLimit > 0 ? Math.round((total / budgetLimit) * 100) : 0;
  
  return `### 📊 Analisis Finansial Laundry (Sederhana - Mode Offline/Lokal)

Terima kasih telah menggunakan sistem pencatatan lokal. (Catatan: Kunci API Gemini belum dikonfigurasi / tidak valid, sehingga kami menyajikan kalkulasi lokal yang terstandarisasi).

#### **1. Keadaan Anggaran Bulanan**
- **Total Pengeluaran Anda**: Rp ${total.toLocaleString('id-ID')}
- **Batas Budget**: Rp ${budgetLimit.toLocaleString('id-ID')}
- **Status Anggaran**: ${total > budgetLimit ? `🚨 Melebihi anggaran sebesar **Rp ${(total - budgetLimit).toLocaleString('id-ID')} (${percent}%)**!` : `✅ Berada dalam batas aman yang sehat (**${percent}%** terpakai).`}

#### **2. Tips Penghematan Esensial untuk Laundry**
- **Pewangi & Detergen**: Selalu beli detergen cair curah kemasan jerigen 20L untuk menekan harga per liter hingga 40% dibandingkan kemasan ritel. Aplikasikan takaran cup ukur yang presisi (misal 35ml per 5kg cucian) agar karyawan tidak boros menuangkan sabun.
- **Gas LPG & Listrik**: Untuk laundry pengering gas (dryer), pastikan filter saringan lint/debu dibersihkan setiap 3-4 kali siklus pengeringan agar aliran udara panas efisien dan menghemat gas hingga 15%.
- **Sirkulasi Air**: Jika menggunakan air PDAM, pertimbangkan membuat sumur bor dengan penyaringan air mandiri jika volume cucian telah melebihi 50 kg/hari guna memangkas biaya air bulanan.`;
}

// ==========================================
// WHATSAPP AUTOMATIC BILLING NOTIFICATION SYSTEM
// ==========================================

// Initialize Server-Side Firebase Instance dynamically
let serverDb: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const firebaseApp = initializeApp(firebaseConfig, "ServerApp");
    serverDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log("[WA Backend] Firebase successfully initialized for automatic WhatsApp notifications. Database ID:", firebaseConfig.firestoreDatabaseId);
  } else {
    console.warn("[WA Backend] firebase-applet-config.json not found. DB sync disabled.");
  }
} catch (err) {
  console.error("[WA Backend] Error initializing server-side Firebase:", err);
}

// Core WhatsApp Sender via Fonnte or Custom Gateway
async function sendWhatsAppMessage({ phone, message, token, gateway }: { phone: string; message: string; token?: string; gateway?: string }): Promise<{ success: boolean; reason?: string }> {
  const activeGateway = gateway || "fonnte";
  const activeToken = token || "";

  console.log(`[WA Backend] Attempting to send WA message via ${activeGateway} to ${phone}...`);

  if (activeGateway === "fonnte") {
    if (!activeToken || activeToken.trim().length === 0) {
      console.warn("[WA Backend] Fonnte Token is missing. Cannot send WhatsApp.");
      return { success: false, reason: "Token Fonnte belum diisi di Pengaturan WhatsApp." };
    }

    // Clean phone number: Convert leading '0' to international '62'
    let formattedPhone = phone.trim().replace(/\D/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "62" + formattedPhone.slice(1);
    }

    try {
      const response = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          "Authorization": activeToken,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          target: formattedPhone,
          message: message,
          countryCode: "62"
        })
      });

      const data = await response.json() as any;
      console.log("[WA Backend] Fonnte Gateway Response:", data);
      const isSuccess = data.status === true || String(data.status).toLowerCase() === "true";
      return { 
        success: isSuccess, 
        reason: isSuccess ? "Terkirim" : (data.reason || data.message || "Gagal dari API Fonnte (Pastikan Device WhatsApp terhubung dan kuota mencukupi).")
      };
    } catch (err: any) {
      console.error("[WA Backend] Fonnte request failed:", err);
      return { success: false, reason: "Gagal terhubung ke API Fonnte: " + err.message };
    }
  } else if (activeGateway === "generic") {
    // For generic webhook mode, the activeToken is treated as the Webhook URL
    if (!activeToken || !activeToken.startsWith("http")) {
      console.warn("[WA Backend] Invalid Webhook URL for generic gateway.");
      return { success: false, reason: "URL Webhook gateway tidak valid." };
    }

    try {
      const response = await fetch(activeToken, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: phone,
          message: message
        })
      });
      console.log("[WA Backend] Generic Webhook Response Status:", response.status);
      return { success: response.ok, reason: response.ok ? "Terkirim" : `HTTP Status: ${response.status}` };
    } catch (err: any) {
      console.error("[WA Backend] Generic webhook failed:", err);
      return { success: false, reason: "Gagal memanggil webhook: " + err.message };
    }
  }

  return { success: false, reason: "Metode gateway tidak dikenali." };
}

// Helper function to get current date and time in Asia/Jakarta (WIB) timezone
function getIndonesianDateTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));

  const year = partMap.year || String(now.getFullYear());
  const month = partMap.month || String(now.getMonth() + 1).padStart(2, "0");
  const day = partMap.day || String(now.getDate()).padStart(2, "0");
  const hour = partMap.hour || String(now.getHours()).padStart(2, "0");
  const minute = partMap.minute || String(now.getMinutes()).padStart(2, "0");

  const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD
  const timeStr = `${hour}:${minute}`; // HH:MM
  return { dateStr, timeStr };
}

// Fetch reminders, check due dates, and compile WhatsApp notifications for Owner
async function runWhatsAppBillingCheck(userId: string) {
  if (!serverDb) {
    throw new Error("Database server connection is not initialized.");
  }

  const { dateStr: todayStr, timeStr: currentTimeStr } = getIndonesianDateTime();

  console.log(`[WA Backend] Checking bills for Owner ${userId} on date ${todayStr} at ${currentTimeStr} WIB...`);

  // 1. Fetch settings
  const settingsRef = doc(serverDb, "users", userId, "settings", "whatsapp");
  const settingsSnap = await getDoc(settingsRef);

  if (!settingsSnap.exists()) {
    return { status: "no_settings", message: "WhatsApp settings have not been configured yet." };
  }

  const settings = settingsSnap.data();
  if (!settings.isEnabled) {
    return { status: "disabled", message: "WhatsApp auto-notifications are turned off." };
  }

  const { ownerWaNumber, ownerWaNumber2, fonnteToken, gateway } = settings;
  const targetPhones: string[] = [];
  if (ownerWaNumber && ownerWaNumber.trim()) targetPhones.push(ownerWaNumber.trim());
  if (ownerWaNumber2 && ownerWaNumber2.trim()) targetPhones.push(ownerWaNumber2.trim());

  if (targetPhones.length === 0) {
    return { status: "missing_phone", message: "Owner WhatsApp number(s) are not configured." };
  }

  // 2. Fetch all unpaid reminders
  const remindersCol = collection(serverDb, "users", userId, "reminders");
  const remindersSnap = await getDocs(remindersCol);

  const unpaidDueReminders: any[] = [];
  remindersSnap.forEach((d) => {
    const data = d.data();
    if (!data.isPaid) {
      const dueDate = data.dueDate || "";
      const dueTime = data.dueTime || "";
      const lastSentDate = data.lastNotificationSentDate || "";

      const isOverdue = dueDate < todayStr;
      const isDueToday = dueDate === todayStr;

      let shouldNotify = false;

      if (isOverdue) {
        // Overdue reminders get reminded daily if they haven't been notified yet today
        if (lastSentDate !== todayStr) {
          shouldNotify = true;
        }
      } else if (isDueToday) {
        // Reminders due today
        if (lastSentDate !== todayStr) {
          if (dueTime) {
            // If specific time is set, notify only when the scheduled time is reached/passed
            if (currentTimeStr >= dueTime) {
              shouldNotify = true;
            }
          } else {
            // No specific time set, notify immediately today (or at a reasonable hour, let's notify immediately)
            shouldNotify = true;
          }
        }
      }

      if (shouldNotify) {
        unpaidDueReminders.push({ ...data, id: d.id });
      }
    }
  });

  if (unpaidDueReminders.length === 0) {
    return { status: "no_bills", message: "All caught up! No unpaid bills ready to notify right now." };
  }

  // 3. Formulate WhatsApp Message in Indonesian
  const listItems = unpaidDueReminders.map((rem, index) => {
    const isOverdue = rem.dueDate < todayStr;
    const daysLabel = isOverdue ? " (TERLAMBAT! ⚠️)" : " (Jatuh Tempo)";
    const timeLabel = rem.dueTime ? ` [Pukul ${rem.dueTime} WIB]` : "";
    const title = (rem.title || "Tagihan Tanpa Judul").toUpperCase();
    const amount = typeof rem.amount === "number" ? rem.amount.toLocaleString("id-ID") : "0";
    const dueDate = rem.dueDate || "-";
    const category = rem.category || "Lain-lain";
    return `${index + 1}. *${title}*${timeLabel}\n   💸 Jumlah: Rp ${amount}\n   📅 Jatuh Tempo: ${dueDate}${daysLabel}\n   🏷️ Kategori: ${category}\n${rem.notes ? `   💡 Catatan: ${rem.notes}\n` : ""}`;
  }).join("\n");

  const totalAmount = unpaidDueReminders.reduce((sum, rem) => sum + (rem.amount || 0), 0);

  const waMessage = `📢 *PENGINGAT TAGIHAN OPERASIONAL TOKO* 🧺\n\nHalo Bos Owner DamDam Laundry!\nBerikut adalah rincian tagihan ruko yang harus dibayarkan hari ini / telah melewati jatuh tempo:\n\n${listItems}\n*TOTAL TAGIHAN AKTIF: Rp ${totalAmount.toLocaleString("id-ID")}*\n\nMohon segera diselesaikan agar operasional outlet tetap berjalan lancar dan aman. \n\n_Pesan otomatis dikirim oleh Damdam POS System_ 🤖✨`;

  // 4. Send Message via selected WhatsApp Gateway to all targets
  let anySent = false;
  const sendResults: string[] = [];

  for (const phone of targetPhones) {
    const sendRes = await sendWhatsAppMessage({
      phone: phone,
      message: waMessage,
      token: fonnteToken,
      gateway: gateway || "fonnte"
    });
    if (sendRes.success) {
      anySent = true;
      sendResults.push(`${phone}: Sukses`);
    } else {
      sendResults.push(`${phone}: Gagal (${sendRes.reason || "Error"})`);
    }
  }

  if (anySent) {
    // Update Settings with today's checked timestamp (just for records, no longer blocks other scheduler runs today)
    await updateDoc(settingsRef, { lastCheckedDate: todayStr });

    // Mark each sent reminder in Firestore
    const batchPromises = unpaidDueReminders.map(rem => {
      const remRef = doc(serverDb, "users", userId, "reminders", rem.id);
      return updateDoc(remRef, { 
        waNotificationSent: true, 
        lastNotificationSentDate: todayStr 
      });
    });
    await Promise.all(batchPromises);

    return { 
      status: "sent", 
      message: `Successfully sent WhatsApp digest to owner(s) [${sendResults.join(", ")}] regarding ${unpaidDueReminders.length} outstanding bills.`,
      totalAmount,
      count: unpaidDueReminders.length
    };
  } else {
    return { status: "failed_send", message: `WhatsApp message delivery failed for [${sendResults.join(", ")}]. Please check your token/gateway configuration.` };
  }
}

// Helper function to calculate rolling shift for an employee on a target week
function calculateShiftServer(
  karyawan: any,
  targetMonday: Date,
  settings: any
): { shift: "pagi" | "siang"; shiftName: string; jamKerja: string; jamMulai: string; jamSelesai: string } {
  const baseShift = karyawan.currentShift === "siang" ? "siang" : "pagi";
  const isAutoRolling = karyawan.autoRollingShift !== false;

  let anchorMonday: Date;
  if (karyawan.shiftAnchorDate && typeof karyawan.shiftAnchorDate === "string" && karyawan.shiftAnchorDate.length >= 10) {
    const [y, m, d] = karyawan.shiftAnchorDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    anchorMonday = new Date(date.getFullYear(), date.getMonth(), diff);
  } else {
    anchorMonday = new Date(targetMonday);
  }

  let finalShift: "pagi" | "siang" = baseShift;
  if (isAutoRolling) {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const diffWeeks = Math.round((targetMonday.getTime() - anchorMonday.getTime()) / msPerWeek);
    const isFlipped = Math.abs(diffWeeks) % 2 === 1;
    if (isFlipped) {
      finalShift = baseShift === "pagi" ? "siang" : "pagi";
    }
  }

  const pagiMulai = settings?.pagiStartTime || "07:30";
  const pagiSelesai = settings?.pagiEndTime || "18:00";
  const siangMulai = settings?.siangStartTime || "11:00";
  const siangSelesai = settings?.siangEndTime || "21:00";

  const isPagi = finalShift === "pagi";
  const jamMulai = isPagi ? pagiMulai : siangMulai;
  const jamSelesai = isPagi ? pagiSelesai : siangSelesai;
  const shiftName = isPagi ? "Shift Pagi" : "Shift Siang";
  const jamKerja = `${jamMulai} - ${jamSelesai} WIB`;

  return { shift: finalShift, shiftName, jamKerja, jamMulai, jamSelesai };
}

function buildShiftReminderTextServer(
  karyawan: any,
  targetMonday: Date,
  settings: any,
  namaLaundry: string = "DAMDAM LAUNDRY"
): string {
  const { shift, shiftName, jamKerja, jamMulai, jamSelesai } = calculateShiftServer(karyawan, targetMonday, settings);
  const nama = karyawan.nama || "Karyawan";
  const isPagi = shift === "pagi";

  const sunday = new Date(targetMonday);
  sunday.setDate(sunday.getDate() + 6);

  const indoMonths = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const tglMulaiStr = `${String(targetMonday.getDate()).padStart(2, "0")} ${indoMonths[targetMonday.getMonth()]} ${targetMonday.getFullYear()}`;
  const tglSelesaiStr = `${String(sunday.getDate()).padStart(2, "0")} ${indoMonths[sunday.getMonth()]} ${sunday.getFullYear()}`;
  const periodStr = `Senin, ${tglMulaiStr} s/d Minggu, ${tglSelesaiStr}`;

  const shiftEmoji = isPagi ? "🌅" : "☀️";
  const shiftTitle = isPagi ? "*SHIFT PAGI*" : "*SHIFT SIANG*";
  const tip1 = isPagi 
    ? "• Harap hadir tepat waktu sebelum outlet dibuka pukul 07.30 WIB." 
    : "• Harap hadir tepat waktu sebelum pergantian shift dimulai pukul 11.00 WIB.";
  const tip3 = isPagi
    ? "• Selamat beristirahat malam ini, tidur lebih awal & jaga stamina ya! 💪🔥"
    : "• Selamat beristirahat malam ini, jaga kesehatan & semangat bekerja besok! 💪🔥";

  const defaultTemplate = `🧺 *PENGINGAT JADWAL SHIFT KERJA* 📢\n*{nama_laundry}*\n\nHalo, *{nama}*! 👋\nBerikut adalah jadwal shift kerja Anda untuk periode minggu depan:\n\n🗓️ *Periode:* {periode}\n⏰ *Jadwal Shift:* {shift}\n🕒 *Jam Kerja:* *{jam_kerja}*\n\n📌 *Ketentuan & Catatan:*\n{catatan_khusus}\n• Wajib melakukan *Check-In Absensi GPS* via aplikasi web saat tiba di ruko.\n\n_Pesan otomatis dikirim oleh Damdam POS System_ 🤖✨`;

  const rawTemplate = (settings?.reminderMessageTemplate && settings.reminderMessageTemplate.trim().length > 0)
    ? settings.reminderMessageTemplate
    : defaultTemplate;

  const catatanKhusus = `${tip1}\n${tip3}`;

  return rawTemplate
    .replace(/\{nama\}/gi, nama)
    .replace(/\{periode\}/gi, periodStr)
    .replace(/\{shift\}/gi, `${shiftTitle} ${shiftEmoji}`)
    .replace(/\{nama_shift\}/gi, shiftName)
    .replace(/\{jam_kerja\}/gi, jamKerja)
    .replace(/\{jam_mulai\}/gi, jamMulai)
    .replace(/\{jam_selesai\}/gi, jamSelesai)
    .replace(/\{catatan_khusus\}/gi, catatanKhusus)
    .replace(/\{nama_laundry\}/gi, namaLaundry);
}

// Function to run the Sunday Night Shift Reminder for an owner's staff
async function runSundayShiftReminderJob(userId: string, forceSend = false) {
  if (!serverDb) {
    throw new Error("Database server connection is not initialized.");
  }

  // 1. Fetch WA Settings
  const settingsRef = doc(serverDb, "users", userId, "settings", "whatsapp");
  const settingsSnap = await getDoc(settingsRef);
  const waSettings = settingsSnap.exists() ? settingsSnap.data() : null;

  const fonnteToken = waSettings?.fonnteToken || "";
  const gateway = waSettings?.gateway || "fonnte";

  // 2. Fetch Shift Settings
  const shiftSettingsRef = doc(serverDb, "users", userId, "settings", "shift");
  const shiftSnap = await getDoc(shiftSettingsRef);
  const shiftSettings = shiftSnap.exists() ? shiftSnap.data() : {
    pagiStartTime: "07:30",
    pagiEndTime: "18:00",
    siangStartTime: "11:00",
    siangEndTime: "21:00",
    reminderDay: 0,
    reminderTime: "20:00",
    isAutoReminderEnabled: true
  };

  const { indonesianDate, dayOfWeek, timeStr: currentTimeStr } = getIndonesianDateObject();
  const reminderTime = shiftSettings.reminderTime || "20:00";

  // Calculate target Monday (the upcoming Monday)
  let diffToMonday = 0;
  if (dayOfWeek === 0) {
    // Sunday: next Monday is tomorrow
    diffToMonday = 1;
  } else if (dayOfWeek === 1) {
    // Monday: if forced or checking, could be today or next week
    diffToMonday = forceSend ? 0 : 7;
  } else {
    diffToMonday = (8 - dayOfWeek);
  }

  const targetMonday = new Date(indonesianDate);
  targetMonday.setDate(targetMonday.getDate() + diffToMonday);
  targetMonday.setHours(0, 0, 0, 0);

  const targetMondayYMD = `${targetMonday.getFullYear()}-${String(targetMonday.getMonth() + 1).padStart(2, "0")}-${String(targetMonday.getDate()).padStart(2, "0")}`;
  const weekKey = `WEEK-${targetMondayYMD}`;

  if (!forceSend) {
    // Check if auto reminder is enabled
    if (shiftSettings.isAutoReminderEnabled === false) {
      return { status: "disabled", message: "Sunday shift auto-reminder is disabled in settings." };
    }
    // Check if it is Sunday (dayOfWeek === 0)
    if (dayOfWeek !== 0) {
      return { status: "not_sunday", message: `Today is not Sunday (dayOfWeek: ${dayOfWeek}).` };
    }
    // Check time condition (>= reminderTime e.g. 20:00 WIB)
    if (currentTimeStr < reminderTime) {
      return { status: "time_not_reached", message: `Scheduled time ${reminderTime} WIB has not been reached yet (current: ${currentTimeStr} WIB).` };
    }
    // Check if already sent for this target week
    if (shiftSettings.lastSentWeekKey === weekKey) {
      return { status: "already_sent", message: `Shift reminders for week ${targetMondayYMD} have already been sent.` };
    }
  }

  // 3. Fetch all active employees
  const karyawanCol = collection(serverDb, "users", userId, "karyawan");
  const karyawanSnap = await getDocs(karyawanCol);
  const karyawanList: any[] = [];
  karyawanSnap.forEach(d => {
    karyawanList.push({ id: d.id, ...d.data() });
  });

  const validKaryawan = karyawanList.filter(k => k.telepon && k.telepon.trim().length >= 8);

  if (validKaryawan.length === 0) {
    return { status: "no_phones", message: "No registered employees with WhatsApp phone numbers found." };
  }

  const sendResults: any[] = [];
  let successCount = 0;

  for (const k of validKaryawan) {
    const shiftInfo = calculateShiftServer(k, targetMonday, shiftSettings);
    const msg = buildShiftReminderTextServer(k, targetMonday, shiftSettings);
    
    let isSent = false;
    let failReason = "";
    if (fonnteToken || gateway === "generic") {
      const sendRes = await sendWhatsAppMessage({
        phone: k.telepon,
        message: msg,
        token: fonnteToken,
        gateway: gateway
      });
      isSent = sendRes.success;
      failReason = sendRes.reason || "";
    } else {
      failReason = "Token Gateway WhatsApp (Fonnte) belum diatur di Pengaturan WhatsApp.";
    }

    if (isSent) successCount++;
    sendResults.push({
      nama: k.nama,
      telepon: k.telepon,
      shift: shiftInfo.shiftName,
      jamKerja: shiftInfo.jamKerja,
      sent: isSent,
      reason: failReason,
      message: msg
    });
  }

  // 4. Record sent status
  try {
    await setDoc(shiftSettingsRef, {
      ...shiftSettings,
      lastSentWeekKey: weekKey,
      lastSentTimestamp: new Date().toISOString(),
      lastSentSuccessCount: successCount,
      lastSentTotalCount: validKaryawan.length
    }, { merge: true });
  } catch (dbErr) {
    console.error("[WA Shift] Failed to update shift settings:", dbErr);
  }

  let statusText = "sent";
  let messageSummary = "";
  if (successCount > 0) {
    statusText = "sent";
    messageSummary = `Berhasil mengirimkan jadwal shift ke ${successCount} dari ${validKaryawan.length} staf via WhatsApp Gateway.`;
  } else if (!fonnteToken && gateway !== "generic") {
    statusText = "no_token";
    messageSummary = `Token WhatsApp Gateway (Fonnte) belum diisi. Anda dapat mengirim manual via WhatsApp Web dengan 1-klik di bawah.`;
  } else {
    statusText = "failed_send";
    messageSummary = `Gagal mengirim otomatis via WhatsApp Gateway (${validKaryawan.length} staf). Pastikan Token Fonnte aktif atau gunakan tombol WhatsApp Web di bawah.`;
  }

  return {
    status: statusText,
    message: messageSummary,
    hasToken: !!(fonnteToken || gateway === "generic"),
    successCount,
    totalCount: validKaryawan.length,
    targetWeek: targetMondayYMD,
    results: sendResults
  };
}

// Get Indonesian Date Object for scheduling
function getIndonesianDateObject() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10) - 1;
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const indonesianDate = new Date(year, month, day, hour, minute);
  const dayOfWeek = indonesianDate.getDay();

  const dateStr = `${map.year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return { indonesianDate, dayOfWeek, dateStr, timeStr };
}

// --- API Endpoints ---

// API 1: Send Test Message
app.post("/api/whatsapp/send-test", async (req, res) => {
  const { phone, message, token, gateway } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ success: false, error: "Nomor HP dan pesan wajib diisi." });
  }

  try {
    const sendRes = await sendWhatsAppMessage({ phone, message, token, gateway });
    if (sendRes.success) {
      return res.json({ success: true, message: "Pesan uji coba berhasil dikirim via WhatsApp!" });
    } else {
      return res.status(500).json({ success: false, error: sendRes.reason || "Gagal mengirim WhatsApp. Pastikan Gateway Token Anda aktif." });
    }
  } catch (err: any) {
    console.error("WhatsApp Send Test Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 2: Trigger Shift Reminder Broadcast (Manual or Forced)
app.post("/api/whatsapp/send-shift-reminder", async (req, res) => {
  const { userId, forceSend } = req.body;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ success: false, error: "userId wajib diisi." });
  }

  try {
    const report = await runSundayShiftReminderJob(userId, !!forceSend);
    return res.json({ success: true, report });
  } catch (err: any) {
    console.error("Shift Reminder Sync Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 3: Send Single Employee Shift Reminder
app.post("/api/whatsapp/send-single-shift-reminder", async (req, res) => {
  const { userId, karyawanId, customMessage } = req.body;
  if (!userId || !karyawanId) {
    return res.status(400).json({ success: false, error: "userId dan karyawanId wajib diisi." });
  }

  try {
    const settingsRef = doc(serverDb, "users", userId, "settings", "whatsapp");
    const settingsSnap = await getDoc(settingsRef);
    const waSettings = settingsSnap.exists() ? settingsSnap.data() : null;

    const shiftSettingsRef = doc(serverDb, "users", userId, "settings", "shift");
    const shiftSnap = await getDoc(shiftSettingsRef);
    const shiftSettings = shiftSnap.exists() ? shiftSnap.data() : null;

    const karyawanRef = doc(serverDb, "users", userId, "karyawan", karyawanId);
    const karyawanSnap = await getDoc(karyawanRef);
    if (!karyawanSnap.exists()) {
      return res.status(404).json({ success: false, error: "Karyawan tidak ditemukan." });
    }

    const k: any = { id: karyawanSnap.id, ...karyawanSnap.data() };
    if (!k.telepon) {
      return res.status(400).json({ success: false, error: `Karyawan ${k.nama} belum memiliki nomor WhatsApp.` });
    }

    const { indonesianDate, dayOfWeek } = getIndonesianDateObject();
    let diffToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const targetMonday = new Date(indonesianDate);
    targetMonday.setDate(targetMonday.getDate() + diffToMonday);

    const shiftInfo = calculateShiftServer(k, targetMonday, shiftSettings);
    const msg = (customMessage && typeof customMessage === "string" && customMessage.trim().length > 0)
      ? customMessage.trim()
      : buildShiftReminderTextServer(k, targetMonday, shiftSettings);

    const fonnteToken = waSettings?.fonnteToken;
    const gateway = waSettings?.gateway || "fonnte";

    if (!fonnteToken && gateway !== "generic") {
      return res.status(400).json({
        success: false,
        error: "Token Gateway WhatsApp (Fonnte) belum diisi di Pengaturan WhatsApp.",
        needToken: true,
        message: msg,
        nama: k.nama,
        telepon: k.telepon
      });
    }

    const sendRes = await sendWhatsAppMessage({
      phone: k.telepon,
      message: msg,
      token: fonnteToken,
      gateway: gateway
    });

    return res.json({
      success: sendRes.success,
      nama: k.nama,
      telepon: k.telepon,
      shift: shiftInfo.shiftName,
      jamKerja: shiftInfo.jamKerja,
      message: msg,
      error: !sendRes.success ? (sendRes.reason || "Gagal mengirim WhatsApp. Periksa Fonnte Token Anda.") : undefined
    });
  } catch (err: any) {
    console.error("Single Shift Reminder Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 4: Trigger Reminder Check and Send via API (Supports both POST and GET for easy manual/webhook triggers)
app.all("/api/whatsapp/check-and-send-reminders", async (req, res) => {
  const userId = req.body?.userId || req.query?.userId;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ success: false, error: "userId wajib diisi." });
  }

  try {
    const report = await runWhatsAppBillingCheck(userId);
    return res.json({ success: true, report });
  } catch (err: any) {
    console.error("WhatsApp Reminder Sync Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API 5: Expose global cron trigger for external cron services (e.g. cron-job.org)
app.all("/api/whatsapp/cron-trigger", async (req, res) => {
  try {
    const report = await triggerGlobalDailyWhatsAppCron();
    return res.json(report);
  } catch (err: any) {
    console.error("Global Cron Trigger Route Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- Scheduled Cron intervals ---

// Helper function to trigger auto daily/hourly notifications for all registered users at their scheduled times
async function triggerGlobalDailyWhatsAppCron() {
  if (!serverDb) {
    return { success: false, error: "Database not initialized" };
  }
  const results: any[] = [];
  try {
    const { dateStr: todayStr, timeStr: currentTimeStr } = getIndonesianDateTime();

    console.log(`[WA Scheduler] Running automatic active billing check at ${todayStr} ${currentTimeStr} WIB...`);

    const usersCol = collection(serverDb, "users");
    const usersSnap = await getDocs(usersCol);

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const settingsRef = doc(serverDb, "users", userId, "settings", "whatsapp");
      const settingsSnap = await getDoc(settingsRef);

      if (settingsSnap.exists()) {
        const settings = settingsSnap.data();
        if (settings.isEnabled) {
          // 1. Unconditional billing check
          const result = await runWhatsAppBillingCheck(userId);
          results.push({ userId, type: "billing", status: result.status, message: result.message });
          if (result.status === "sent") {
            console.log(`[WA Scheduler] Billing notifications sent for ${userId}:`, result.message);
          }

          // 2. Sunday night shift reminder check
          try {
            const shiftResult = await runSundayShiftReminderJob(userId, false);
            if (shiftResult.status === "sent") {
              console.log(`[WA Scheduler] Sunday shift reminders sent for ${userId}:`, shiftResult.message);
              results.push({ userId, type: "shift", status: shiftResult.status, message: shiftResult.message });
            }
          } catch (shiftErr) {
            console.error(`[WA Scheduler] Error checking Sunday shift reminders for ${userId}:`, shiftErr);
          }
        } else {
          results.push({ userId, status: "disabled", message: "WhatsApp notification is disabled for this user." });
        }
      } else {
        results.push({ userId, status: "no_settings", message: "No WhatsApp settings found for this user." });
      }
    }
    return { success: true, timestamp: `${todayStr} ${currentTimeStr} WIB`, results };
  } catch (err: any) {
    console.error("[WA Scheduler] Automatic check error:", err);
    return { success: false, error: err.message };
  }
}

// Check once every 1 minute (60,000 ms) so that exact time-based reminders are notified instantly
setInterval(triggerGlobalDailyWhatsAppCron, 60000);

// Check once on server startup (after 10 seconds delay to let resources fully initialize)
setTimeout(() => {
  console.log("[WA Scheduler] Triggering startup WhatsApp billing check...");
  triggerGlobalDailyWhatsAppCron();
}, 10000);

// --- API: System Version & Published Updates Check ---
app.get("/api/system-version", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  let versionData = {
    version: "1.4.3",
    versionCode: 143,
    publishedAt: "2026-08-24T08:15:00.000Z",
    title: "Pembaruan Sistem Damdam Laundry",
    description: "Versi terbaru sistem telah dipublikasikan dengan fitur dan performa terbaru.",
    changelog: [
      "Fitur hapus log pengajuan & keputusan izin libur (koreksi salah tanggal)",
      "Peningkatan popup notifikasi pembaruan sistem yang ringkas di tengah layar",
      "Optimasi sinkronisasi database dan pencatatan absensi"
    ],
    forceReload: false
  };

  try {
    const versionFilePath = path.join(process.cwd(), "public", "version.json");
    if (fs.existsSync(versionFilePath)) {
      const fileContent = fs.readFileSync(versionFilePath, "utf8");
      versionData = JSON.parse(fileContent);
    }
  } catch (err) {
    console.error("[System Version API] Error reading version.json:", err);
  }

  res.json(versionData);
});

// --- SPA Vite Setup ---
async function startServer() {
  const isProduction = (process.env.NODE_ENV === "production") || 
                       (typeof __filename !== "undefined" && (__filename.includes("dist") || __filename.endsWith(".cjs")));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // If running in production (where server.cjs is in the dist/ folder)
    // __dirname points to the dist directory itself.
    // If running with process.cwd(), fallback to it.
    const distPath = typeof __dirname !== "undefined" ? __dirname : path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server laundry expense running on http://localhost:${PORT}`);
  });
}

startServer();
