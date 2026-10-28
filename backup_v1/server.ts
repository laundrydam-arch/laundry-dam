import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

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


// --- SPA Vite Setup ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
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
