import { Karyawan, ShiftOverride, ShiftSettings, ShiftType } from "../types";

export const DEFAULT_SHIFT_REMINDER_TEMPLATE = `🧺 *PENGINGAT JADWAL SHIFT KERJA* 📢
*{nama_laundry}*

Halo, *{nama}*! 👋
Berikut adalah jadwal shift kerja Anda untuk periode minggu depan:

🗓️ *Periode:* {periode}
⏰ *Jadwal Shift:* {shift}
🕒 *Jam Kerja:* *{jam_kerja}*

📌 *Ketentuan & Catatan:*
{catatan_khusus}
• Wajib melakukan *Check-In Absensi GPS* via aplikasi web saat tiba di ruko.

_Pesan otomatis dikirim oleh Damdam POS System_ 🤖✨`;

export const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  pagiStartTime: "07:30",
  pagiEndTime: "18:00",
  siangStartTime: "11:00",
  siangEndTime: "21:00",
  reminderDay: 0, // 0 = Sunday (Minggu)
  reminderTime: "20:00", // 20:00 WIB
  isAutoReminderEnabled: true,
  reminderMessageTemplate: DEFAULT_SHIFT_REMINDER_TEMPLATE,
};

const INDO_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const INDO_MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

/**
 * Returns Monday 00:00:00 of the week containing the given date
 */
export function getMondayOfDate(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday ...
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.getFullYear(), date.getMonth(), diff, 0, 0, 0, 0);
  return monday;
}

/**
 * Returns Sunday 23:59:59 of the week containing the given Monday
 */
export function getSundayOfDate(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

/**
 * Returns next week's Monday
 */
export function getNextWeekMonday(refDate: Date = new Date()): Date {
  const curMonday = getMondayOfDate(refDate);
  const nextMonday = new Date(curMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return nextMonday;
}

/**
 * Formats a Date into Indonesian string, e.g. "31 Agustus 2026"
 */
export function formatIndonesianDate(d: Date, shortMonth = false): string {
  const day = d.getDate().toString().padStart(2, "0");
  const month = shortMonth ? INDO_MONTHS_SHORT[d.getMonth()] : INDO_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Formats a week range, e.g. "Senin, 31 Agu 2026 s/d Minggu, 06 Sep 2026"
 */
export function formatWeekRange(monday: Date, short = true): string {
  const sunday = getSundayOfDate(monday);
  return `Senin, ${formatIndonesianDate(monday, short)} s/d Minggu, ${formatIndonesianDate(sunday, short)}`;
}

/**
 * Converts a Date to YYYY-MM-DD string
 */
export function dateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculates the weekly shift for a given employee on a specific target date/week.
 * Automatically alternates ("rolls") every Monday relative to the employee's anchor week.
 */
export function calculateEmployeeShift(
  karyawan: Partial<Karyawan>,
  targetDate: Date = new Date(),
  customSettings?: Partial<ShiftSettings>
): {
  shift: ShiftType;
  shiftName: string;
  jamMulai: string;
  jamSelesai: string;
  jamKerja: string;
  mondayDate: Date;
  sundayDate: Date;
  periodLabel: string;
  isRolling: boolean;
} {
  const settings: ShiftSettings = { ...DEFAULT_SHIFT_SETTINGS, ...customSettings };
  const currentMonday = getMondayOfDate(new Date());
  const targetMonday = getMondayOfDate(targetDate);
  const targetSunday = getSundayOfDate(targetMonday);

  const rawShift = karyawan.currentShift;
  if (rawShift === "tidak_ada") {
    return {
      shift: "tidak_ada",
      shiftName: "Tidak Ada Shift",
      jamMulai: "-",
      jamSelesai: "-",
      jamKerja: "Libur / Bebas Tugas",
      mondayDate: targetMonday,
      sundayDate: targetSunday,
      periodLabel: formatWeekRange(targetMonday, true),
      isRolling: false
    };
  }

  const baseShift: ShiftType = (rawShift === "siang" ? "siang" : "pagi");
  const isAutoRolling = karyawan.autoRollingShift !== false;

  let finalShift: ShiftType = baseShift;

  if (isAutoRolling) {
    // karyawan.currentShift is the designated shift for the current active week (currentMonday).
    // Weekly rolling computes differences relative to currentMonday:
    // - Minggu Ini (diffWeeks === 0): always baseShift (matches Data Staf 100%)
    // - Minggu Depan (diffWeeks === 1): alternating shift (rolling)
    // - 1 Minggu Lalu (diffWeeks === -1): alternating shift (past week in history)
    // - 2 Minggu Lalu (diffWeeks === -2): same as baseShift
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const diffWeeks = Math.round((targetMonday.getTime() - currentMonday.getTime()) / msPerWeek);
    const isFlipped = Math.abs(diffWeeks) % 2 === 1;
    if (isFlipped) {
      finalShift = baseShift === "pagi" ? "siang" : "pagi";
    }
  }

  const isPagi = finalShift === "pagi";
  const jamMulai = isPagi ? settings.pagiStartTime : settings.siangStartTime;
  const jamSelesai = isPagi ? settings.pagiEndTime : settings.siangEndTime;
  const shiftName = isPagi ? "Shift Pagi" : "Shift Siang";
  const jamKerja = `${jamMulai} - ${jamSelesai} WIB`;

  return {
    shift: finalShift,
    shiftName,
    jamMulai,
    jamSelesai,
    jamKerja,
    mondayDate: targetMonday,
    sundayDate: targetSunday,
    periodLabel: formatWeekRange(targetMonday, true),
    isRolling: isAutoRolling
  };
}

/**
 * Builds the customized Sunday night reminder WhatsApp message
 */
export function buildShiftReminderWhatsAppMessage(
  karyawan: Karyawan,
  targetMonday: Date,
  customSettings?: Partial<ShiftSettings>,
  namaLaundry: string = "DAMDAM LAUNDRY"
): string {
  const shiftInfo = calculateEmployeeShift(karyawan, targetMonday, customSettings);
  const nama = karyawan.nama || "Karyawan";

  const rawTemplate = (customSettings?.reminderMessageTemplate && customSettings.reminderMessageTemplate.trim().length > 0)
    ? customSettings.reminderMessageTemplate
    : DEFAULT_SHIFT_REMINDER_TEMPLATE;

  if (shiftInfo.shift === "tidak_ada") {
    const catatanKhusus = "• Minggu ini Anda tidak memiliki jadwal shift kerja (Libur / Bebas Tugas).\n• Selamat beristirahat dan menikmati hari libur! 🌴✨";
    return rawTemplate
      .replace(/\{nama\}/gi, nama)
      .replace(/\{periode\}/gi, shiftInfo.periodLabel)
      .replace(/\{shift\}/gi, "*TIDAK ADA SHIFT (LIBUR)* 🌴")
      .replace(/\{nama_shift\}/gi, "Tidak Ada Shift (Libur)")
      .replace(/\{jam_kerja\}/gi, "Libur / Bebas Tugas")
      .replace(/\{jam_mulai\}/gi, "-")
      .replace(/\{jam_selesai\}/gi, "-")
      .replace(/\{catatan_khusus\}/gi, catatanKhusus)
      .replace(/\{nama_laundry\}/gi, namaLaundry);
  }

  const isPagi = shiftInfo.shift === "pagi";

  const shiftEmoji = isPagi ? "🌅" : "☀️";
  const shiftTitle = isPagi ? "*SHIFT PAGI*" : "*SHIFT SIANG*";
  const tip1 = isPagi 
    ? "• Harap hadir tepat waktu sebelum outlet dibuka pukul 07.30 WIB." 
    : "• Harap hadir tepat waktu sebelum pergantian shift dimulai pukul 11.00 WIB.";
  const tip3 = isPagi
    ? "• Selamat beristirahat malam ini, tidur lebih awal & jaga stamina ya! 💪🔥"
    : "• Selamat beristirahat malam ini, jaga kesehatan & semangat bekerja besok! 💪🔥";

  const catatanKhusus = `${tip1}\n${tip3}`;

  return rawTemplate
    .replace(/\{nama\}/gi, nama)
    .replace(/\{periode\}/gi, shiftInfo.periodLabel)
    .replace(/\{shift\}/gi, `${shiftTitle} ${shiftEmoji}`)
    .replace(/\{nama_shift\}/gi, shiftInfo.shiftName)
    .replace(/\{jam_kerja\}/gi, shiftInfo.jamKerja)
    .replace(/\{jam_mulai\}/gi, shiftInfo.jamMulai)
    .replace(/\{jam_selesai\}/gi, shiftInfo.jamSelesai)
    .replace(/\{catatan_khusus\}/gi, catatanKhusus)
    .replace(/\{nama_laundry\}/gi, namaLaundry);
}

export interface DayInfo {
  date: Date;
  ymd: string; // YYYY-MM-DD
  dayName: string; // "Senin", "Selasa", dll.
  dayNumber: number; // 1-31
}

export interface WeekInfo {
  monday: Date;
  sunday: Date;
  ymd: string; // Monday YYYY-MM-DD
  sundayYMD: string; // Sunday YYYY-MM-DD
  weeksAgo: number; // 0 = Minggu ini, 1 = 1 minggu lalu, dst.
  label: string;
  shortRange: string;
  days: DayInfo[];
  weekNumber: number;
}

export interface MonthInfo {
  year: number;
  monthIndex: number; // 0-11
  label: string; // "September 2026"
  ym: string; // "2026-09"
  monthsAgo: number; // 0 = Bulan ini, 1 = 1 bulan lalu, dst.
  weeks: WeekInfo[];
}

const INDO_DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/**
 * Returns array of 7 days (Monday to Sunday) for a given Monday
 */
export function getDaysOfWeek(monday: Date): DayInfo[] {
  const days: DayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    days.push({
      date: d,
      ymd: dateToYMD(d),
      dayName: INDO_DAY_NAMES[d.getDay()],
      dayNumber: d.getDate()
    });
  }
  return days;
}

/**
 * Simple ISO week number calculation
 */
export function getISOWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Generates an array of past weeks starting from current week going backwards
 */
export function getPastWeeks(count: number = 26, refDate: Date = new Date()): WeekInfo[] {
  const currentMonday = getMondayOfDate(refDate);
  const weeks: WeekInfo[] = [];

  for (let i = 0; i < count; i++) {
    const monday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - (i * 7));
    const sunday = getSundayOfDate(monday);
    const ymd = dateToYMD(monday);
    const sundayYMD = dateToYMD(sunday);
    const days = getDaysOfWeek(monday);
    const weekNumber = getISOWeekNumber(monday);

    let labelPrefix = "";
    if (i === 0) {
      labelPrefix = "Minggu Ini";
    } else if (i === 1) {
      labelPrefix = "1 Minggu Lalu";
    } else {
      labelPrefix = `${i} Minggu Lalu`;
    }

    const shortRange = `${formatIndonesianDate(monday, true)} – ${formatIndonesianDate(sunday, true)}`;
    const label = `${labelPrefix} (${shortRange})`;

    weeks.push({
      monday,
      sunday,
      ymd,
      sundayYMD,
      weeksAgo: i,
      label,
      shortRange,
      days,
      weekNumber
    });
  }

  return weeks;
}

/**
 * Generates an array of past months starting from current month going backwards
 */
export function getPastMonths(count: number = 12, refDate: Date = new Date()): MonthInfo[] {
  const months: MonthInfo[] = [];
  const curYear = refDate.getFullYear();
  const curMonth = refDate.getMonth();

  for (let i = 0; i < count; i++) {
    const targetDate = new Date(curYear, curMonth - i, 1);
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth();
    const monthName = INDO_MONTHS[m];
    const ym = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = `${monthName} ${y}`;

    // Find all weeks that belong to this month
    // We check every Monday from first Monday in/near month to last Monday
    const firstDayOfMonth = new Date(y, m, 1);
    const lastDayOfMonth = new Date(y, m + 1, 0);

    const startMonday = getMondayOfDate(firstDayOfMonth);
    const monthWeeks: WeekInfo[] = [];

    let scanMonday = new Date(startMonday);
    while (scanMonday <= lastDayOfMonth) {
      const scanSunday = getSundayOfDate(scanMonday);
      // A week is considered part of this month if Thursday is in this month (ISO standard)
      const thursday = new Date(scanMonday.getFullYear(), scanMonday.getMonth(), scanMonday.getDate() + 3);
      if (thursday.getMonth() === m && thursday.getFullYear() === y) {
        const ymd = dateToYMD(scanMonday);
        const sundayYMD = dateToYMD(scanSunday);
        const days = getDaysOfWeek(scanMonday);
        const weekNumber = getISOWeekNumber(scanMonday);
        
        // Calculate weeksAgo relative to currentMonday
        const currentMonday = getMondayOfDate(refDate);
        const weeksAgo = Math.round((currentMonday.getTime() - scanMonday.getTime()) / (7 * 86400000));

        monthWeeks.push({
          monday: new Date(scanMonday),
          sunday: scanSunday,
          ymd,
          sundayYMD,
          weeksAgo,
          label: `${formatWeekRange(scanMonday, true)}`,
          shortRange: `${formatIndonesianDate(scanMonday, true)} – ${formatIndonesianDate(scanSunday, true)}`,
          days,
          weekNumber
        });
      }
      scanMonday.setDate(scanMonday.getDate() + 7);
    }

    months.push({
      year: y,
      monthIndex: m,
      label,
      ym,
      monthsAgo: i,
      weeks: monthWeeks
    });
  }

  return months;
}

/**
 * Calculates employee shift taking into account manual overrides for specific weeks
 */
export function calculateEmployeeShiftWithOverride(
  karyawan: Partial<Karyawan>,
  targetDate: Date = new Date(),
  customSettings?: Partial<ShiftSettings>,
  overrides?: Record<string, ShiftOverride>
): {
  shift: ShiftType;
  shiftName: string;
  jamMulai: string;
  jamSelesai: string;
  jamKerja: string;
  mondayDate: Date;
  sundayDate: Date;
  periodLabel: string;
  isRolling: boolean;
  isManualOverride: boolean;
  overrideNote?: string;
} {
  const baseCalculated = calculateEmployeeShift(karyawan, targetDate, customSettings);
  const mondayYMD = dateToYMD(baseCalculated.mondayDate);
  const overrideKey = `${karyawan.id}_${mondayYMD}`;
  const override = overrides ? overrides[overrideKey] : undefined;

  if (override) {
    if (override.shift === "tidak_ada") {
      return {
        ...baseCalculated,
        shift: "tidak_ada",
        shiftName: "Tidak Ada Shift",
        jamMulai: "-",
        jamSelesai: "-",
        jamKerja: "Libur / Bebas Tugas",
        isManualOverride: true,
        overrideNote: override.note
      };
    }

    const settings: ShiftSettings = { ...DEFAULT_SHIFT_SETTINGS, ...customSettings };
    const isPagi = override.shift === "pagi";
    const jamMulai = isPagi ? settings.pagiStartTime : settings.siangStartTime;
    const jamSelesai = isPagi ? settings.pagiEndTime : settings.siangEndTime;
    const shiftName = isPagi ? "Shift Pagi" : "Shift Siang";
    const jamKerja = `${jamMulai} - ${jamSelesai} WIB`;

    return {
      ...baseCalculated,
      shift: override.shift,
      shiftName,
      jamMulai,
      jamSelesai,
      jamKerja,
      isManualOverride: true,
      overrideNote: override.note
    };
  }

  return {
    ...baseCalculated,
    isManualOverride: false
  };
}

