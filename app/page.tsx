"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Calendar,
  ChevronRight,
  Clock3,
  Dumbbell,
  FileText,
  Flame,
  History,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  TimerReset,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Notes:
// 1) This is built to be dropped into app/page.tsx in a Next.js app.
// 2) Install deps first:
//    npm install framer-motion lucide-react recharts pdfjs-dist
// 3) If pdf import fails on first try, restart dev server after installing.

const STORAGE_KEY = "gym-app-v10-dark-pro";

type SetRow = {
  weight: string;
  reps: string;
  done: boolean;
};

type Exercise = {
  id: string;
  name: string;
  category: string;
  repTarget: string;
  tips: string[];
  sets: SetRow[];
};

type TrainingDay = {
  id: string;
  label: string;
  exercises: Exercise[];
};

type LiftLog = {
  id: string;
  date: string;
  day: string;
  exercise: string;
  sets: SetRow[];
  note?: string;
  source?: "manual" | "import";
};

type ImportPreview = {
  exercise: string;
  date: string;
  weight: string;
  reps: string;
};

type TabKey = "dashboard" | "workout" | "progress" | "history" | "import";

const EXERCISE_LIBRARY: Record<string, Omit<Exercise, "id" | "sets">[]> = {
  Push: [
    { name: "Bench Press", category: "Chest", repTarget: "5-8", tips: ["Set upper back first", "Touch low chest", "Press back and up"] },
    { name: "Incline Dumbbell Press", category: "Upper Chest", repTarget: "6-10", tips: ["Moderate incline", "Control stretch", "Drive elbows under wrists"] },
    { name: "Cable Lateral Raise", category: "Side Delts", repTarget: "10-15", tips: ["Lead with elbow", "Do not shrug", "Continuous tension"] },
    { name: "Triceps Pushdown", category: "Triceps", repTarget: "10-15", tips: ["Upper arms fixed", "Hard lockout", "Control eccentric"] },
  ],
  Pull: [
    { name: "Lat Pulldown", category: "Lats", repTarget: "8-12", tips: ["Pull elbows low", "No huge lean", "Own the eccentric"] },
    { name: "Chest Supported Row", category: "Upper Back", repTarget: "6-10", tips: ["Stay on the pad", "Pause at torso", "Drive elbows back"] },
    { name: "Face Pull", category: "Rear Delts", repTarget: "12-20", tips: ["Pull high", "Rotate back", "Slow return"] },
    { name: "EZ Bar Curl", category: "Biceps", repTarget: "8-12", tips: ["Keep elbows still", "No torso swing", "Control negative"] },
  ],
  Legs: [
    { name: "Back Squat", category: "Quads", repTarget: "5-8", tips: ["Brace hard", "Midfoot pressure", "Drive up hard"] },
    { name: "Romanian Deadlift", category: "Hamstrings", repTarget: "6-10", tips: ["Push hips back", "Bar close", "Stop at stretch"] },
    { name: "Leg Extension", category: "Quads", repTarget: "10-15", tips: ["Control squeeze", "No bouncing", "Full top contraction"] },
    { name: "Seated Hamstring Curl", category: "Hamstrings", repTarget: "10-15", tips: ["Set hips back", "Pause in squeeze", "Slow eccentric"] },
  ],
};

function makeExercise(base: Omit<Exercise, "id" | "sets">, index: number): Exercise {
  return {
    id: `${base.name}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    name: base.name,
    category: base.category,
    repTarget: base.repTarget,
    tips: base.tips,
    sets: [
      { weight: "", reps: "", done: false },
      { weight: "", reps: "", done: false },
    ],
  };
}

function makeDefaultDays(): TrainingDay[] {
  return [
    { id: "push", label: "Push", exercises: EXERCISE_LIBRARY.Push.map((e, i) => makeExercise(e, i)) },
    { id: "pull", label: "Pull", exercises: EXERCISE_LIBRARY.Pull.map((e, i) => makeExercise(e, i)) },
    { id: "legs", label: "Legs", exercises: EXERCISE_LIBRARY.Legs.map((e, i) => makeExercise(e, i)) },
  ];
}

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getTopSet(sets: SetRow[]) {
  const valid = sets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
  if (!valid.length) return null;
  return [...valid].sort((a, b) => estimate1RM(Number(b.weight), Number(b.reps)) - estimate1RM(Number(a.weight), Number(a.reps)))[0];
}

function estimate1RM(weight: number, reps: number) {
  if (!weight || !reps) return 0;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function parseImportText(raw: string): ImportPreview[] {
  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out: ImportPreview[] = [];
  for (const line of lines) {
    const match = line.match(/(.+?)\s*-\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d+(?:\.\d+)?)x(\d+)/i);
    if (!match) continue;
    out.push({
      exercise: match[1].trim(),
      date: match[2],
      weight: match[3],
      reps: match[4],
    });
  }
  return out;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    fullText += pageText + "\n";
  }

  return fullText;
}

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [days, setDays] = useState<TrainingDay[]>(makeDefaultDays());
  const [activeDayId, setActiveDayId] = useState("push");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [bodyweight, setBodyweight] = useState("95.0");
  const [sessionNote, setSessionNote] = useState("");
  const [logs, setLogs] = useState<LiftLog[]>([]);
  const [search, setSearch] = useState("");
  const [restSeconds, setRestSeconds] = useState(90);
  const [timerOn, setTimerOn] = useState(false);
  const [importText, setImportText] = useState("");
  const [pdfRawText, setPdfRawText] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfMessage, setPdfMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setDark(parsed.dark ?? true);
      setTab(parsed.tab ?? "dashboard");
      setDays(parsed.days ?? makeDefaultDays());
      setActiveDayId(parsed.activeDayId ?? "push");
      setSessionDate(parsed.sessionDate ?? new Date().toISOString().slice(0, 10));
      setBodyweight(parsed.bodyweight ?? "95.0");
      setSessionNote(parsed.sessionNote ?? "");
      setLogs(parsed.logs ?? []);
      setImportText(parsed.importText ?? "");
      setPdfRawText(parsed.pdfRawText ?? "");
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dark,
        tab,
        days,
        activeDayId,
        sessionDate,
        bodyweight,
        sessionNote,
        logs,
        importText,
        pdfRawText,
      })
    );
  }, [mounted, dark, tab, days, activeDayId, sessionDate, bodyweight, sessionNote, logs, importText, pdfRawText]);

  useEffect(() => {
    if (!timerOn) return;
    const id = window.setInterval(() => {
      setRestSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setTimerOn(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerOn]);

  const activeDay = useMemo(() => days.find((d) => d.id === activeDayId) ?? days[0], [days, activeDayId]);

  const filteredExercises = useMemo(() => {
    if (!activeDay) return [];
    const q = search.trim().toLowerCase();
    if (!q) return activeDay.exercises;
    return activeDay.exercises.filter(
      (e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    );
  }, [activeDay, search]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();
    logs.forEach((log) => {
      const top = getTopSet(log.sets);
      if (!top) return;
      const current = grouped.get(log.date) ?? 0;
      grouped.set(log.date, current + estimate1RM(Number(top.weight), Number(top.reps)));
    });
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, strength]) => ({ date, strength: Math.round(strength) }));
  }, [logs]);

  const recentHistory = useMemo(() => [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25), [logs]);

  const streak = useMemo(() => {
    if (!logs.length) return 0;
    const uniqueDates = [...new Set(logs.map((l) => l.date))].sort().reverse();
    let count = 0;
    let current = new Date();
    current.setHours(0, 0, 0, 0);

    for (let i = 0; i < uniqueDates.length; i++) {
      const d = new Date(uniqueDates[i]);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((current.getTime() - d.getTime()) / 86400000);
      if ((i === 0 && (diff === 0 || diff === 1)) || (i > 0 && diff === 1)) {
        count += 1;
        current = d;
      } else {
        break;
      }
    }
    return count;
  }, [logs]);

  const totalSessions = useMemo(() => new Set(logs.map((l) => `${l.date}-${l.day}`)).size, [logs]);
  const importedEntries = useMemo(() => logs.filter((l) => l.source === "import").length, [logs]);

  function updateSet(exerciseId: string, setIndex: number, field: keyof SetRow, value: string | boolean) {
    setDays((prev) =>
      prev.map((day) => {
        if (day.id !== activeDayId) return day;
        return {
          ...day,
          exercises: day.exercises.map((exercise) => {
            if (exercise.id !== exerciseId) return exercise;
            const nextSets = [...exercise.sets];
            nextSets[setIndex] = { ...nextSets[setIndex], [field]: value } as SetRow;
            return { ...exercise, sets: nextSets };
          }),
        };
      })
    );
  }

  function addSet(exerciseId: string) {
    setDays((prev) =>
      prev.map((day) => {
        if (day.id !== activeDayId) return day;
        return {
          ...day,
          exercises: day.exercises.map((exercise) =>
            exercise.id === exerciseId
              ? { ...exercise, sets: [...exercise.sets, { weight: "", reps: "", done: false }] }
              : exercise
          ),
        };
      })
    );
  }

  function removeExercise(exerciseId: string) {
    setDays((prev) =>
      prev.map((day) =>
        day.id === activeDayId
          ? { ...day, exercises: day.exercises.filter((e) => e.id !== exerciseId) }
          : day
      )
    );
  }

  function addExerciseFromLibrary(name: string) {
    const source = EXERCISE_LIBRARY[activeDay.label as keyof typeof EXERCISE_LIBRARY]?.find((e) => e.name === name);
    if (!source) return;
    setDays((prev) =>
      prev.map((day) =>
        day.id === activeDayId
          ? { ...day, exercises: [...day.exercises, makeExercise(source, day.exercises.length + 1)] }
          : day
      )
    );
  }

  function saveSession() {
    if (!activeDay) return;
    const sessionLogs: LiftLog[] = activeDay.exercises
      .filter((exercise) => exercise.sets.some((s) => Number(s.weight) > 0 && Number(s.reps) > 0))
      .map((exercise) => ({
        id: `${sessionDate}-${activeDay.id}-${exercise.id}-${Math.random().toString(36).slice(2, 7)}`,
        date: sessionDate,
        day: activeDay.label,
        exercise: exercise.name,
        sets: exercise.sets,
        note: sessionNote,
        source: "manual",
      }));

    if (!sessionLogs.length) return;

    setLogs((prev) => [...prev, ...sessionLogs]);
    setDays((prev) =>
      prev.map((day) =>
        day.id === activeDayId
          ? {
              ...day,
              exercises: day.exercises.map((exercise) => ({
                ...exercise,
                sets: exercise.sets.map(() => ({ weight: "", reps: "", done: false })),
              })),
            }
          : day
      )
    );
    setSessionNote("");
    setTab("history");
  }

  function buildPreviewFromText(raw: string) {
    const preview = parseImportText(raw);
    setImportPreview(preview);
  }

  function importPreviewData() {
    if (!importPreview.length) return;
    const newLogs: LiftLog[] = importPreview.map((row, i) => ({
      id: `import-${i}-${Math.random().toString(36).slice(2, 7)}`,
      date: row.date,
      day: "Imported",
      exercise: row.exercise,
      sets: [{ weight: row.weight, reps: row.reps, done: true }],
      note: "Imported historic data",
      source: "import",
    }));
    setLogs((prev) => [...prev, ...newLogs]);
    setImportPreview([]);
    setImportText("");
    setPdfRawText("");
    setTab("history");
  }

  async function onPdfUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPdfLoading(true);
    setPdfMessage("Reading PDF...");

    try {
      const text = await extractPdfText(file);
      setPdfRawText(text);
      setPdfMessage("PDF text extracted. Now format the lines below into: Exercise - YYYY-MM-DD - 90x5");
    } catch (error) {
      console.error(error);
      setPdfMessage("PDF import failed. Install pdfjs-dist and restart dev server, or paste cleaned text manually.");
    } finally {
      setPdfLoading(false);
    }
  }

  const themeRoot = dark
    ? "min-h-screen bg-[#060816] text-white"
    : "min-h-screen bg-slate-100 text-slate-900";

  const panel = dark
    ? "border border-white/10 bg-white/5 backdrop-blur-xl"
    : "border border-slate-200 bg-white";

  const muted = dark ? "text-slate-400" : "text-slate-500";
  const inputCls = dark
    ? "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
    : "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500";
  const buttonPrimary = "rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90";
  const buttonSecondary = dark
    ? "rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
    : "rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50";

  if (!mounted) return null;

  return (
    <div className={themeRoot}>
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 overflow-hidden rounded-[32px] ${panel} shadow-2xl`}
        >
          <div className="relative p-6 md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_30%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300">
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1">Gym App V10</span>
                  <span className="rounded-full border border-white/10 px-3 py-1">Dark Pro UI</span>
                  <span className="rounded-full border border-white/10 px-3 py-1">Text + PDF Import</span>
                </div>
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
                  Sleek, dark, professional training tracker.
                </h1>
                <p className={`mt-3 max-w-2xl text-sm md:text-base ${muted}`}>
                  Better than the basic page you have live now: proper dashboard, workout logging, progress, session history, and historic data import.
                </p>
              </div>

              <div className="grid min-w-[280px] gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <StatCard icon={<Flame className="h-4 w-4" />} label="Streak" value={`${streak} days`} dark={dark} />
                <StatCard icon={<History className="h-4 w-4" />} label="Sessions" value={String(totalSessions)} dark={dark} />
                <StatCard icon={<Upload className="h-4 w-4" />} label="Imported" value={String(importedEntries)} dark={dark} />
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          {[
            ["dashboard", <LayoutDashboard className="h-4 w-4" />, "Dashboard"],
            ["workout", <Dumbbell className="h-4 w-4" />, "Workout"],
            ["progress", <LineChartIcon className="h-4 w-4" />, "Progress"],
            ["history", <Calendar className="h-4 w-4" />, "History"],
            ["import", <Upload className="h-4 w-4" />, "Import"],
          ].map(([key, icon, label]) => {
            const active = tab === key;
            return (
              <button
                key={String(key)}
                onClick={() => setTab(key as TabKey)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-cyan-400 text-slate-950"
                    : dark
                    ? "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                    : "border border-slate-300 bg-white text-slate-900"
                }`}
              >
                {icon}
                {label}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-3">
            <div className={`rounded-2xl ${panel} px-4 py-3 text-sm`}>
              Bodyweight: <span className="font-semibold">{bodyweight} kg</span>
            </div>
            <button onClick={() => setDark((v) => !v)} className={buttonSecondary}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {tab === "dashboard" && (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className={`rounded-[28px] p-5 md:p-6 ${panel}`}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">Today’s training split</div>
                  <div className={`text-sm ${muted}`}>Jump straight into the day you want to run.</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {days.map((day) => (
                  <button
                    key={day.id}
                    onClick={() => {
                      setActiveDayId(day.id);
                      setTab("workout");
                    }}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      dark
                        ? "border-white/10 bg-white/5 hover:bg-white/10"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{day.label}</div>
                        <div className={`mt-1 text-xs ${muted}`}>{day.exercises.length} exercises</div>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="grid gap-4">
              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Zap className="h-4 w-4 text-cyan-300" /> Quick stats
                </div>
                <div className={`grid gap-3 text-sm ${muted}`}>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">Live app style is now much closer to your V9 direction.</div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">Historic data can be pasted as text or extracted from PDF.</div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">Everything persists in local storage for now, so it survives refresh.</div>
                </div>
              </div>

              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-3 text-sm font-semibold">Strength trend</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"} />
                      <XAxis dataKey="date" stroke={dark ? "#94a3b8" : "#64748b"} />
                      <YAxis stroke={dark ? "#94a3b8" : "#64748b"} />
                      <Tooltip />
                      <Area type="monotone" dataKey="strength" strokeWidth={2} fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "workout" && activeDay && (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className={`rounded-[28px] p-5 md:p-6 ${panel}`}>
              <div className="mb-5 grid gap-3 md:grid-cols-4">
                <div>
                  <label className={`mb-2 block text-xs uppercase tracking-[0.18em] ${muted}`}>Day</label>
                  <select value={activeDayId} onChange={(e) => setActiveDayId(e.target.value)} className={inputCls}>
                    {days.map((day) => (
                      <option key={day.id} value={day.id} className="text-slate-900">
                        {day.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-xs uppercase tracking-[0.18em] ${muted}`}>Date</label>
                  <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={`mb-2 block text-xs uppercase tracking-[0.18em] ${muted}`}>Bodyweight</label>
                  <input value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={`mb-2 block text-xs uppercase tracking-[0.18em] ${muted}`}>Search</label>
                  <div className="relative">
                    <Search className={`absolute left-3 top-3.5 h-4 w-4 ${muted}`} />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bench, chest, lats..." className={`${inputCls} pl-10`} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {filteredExercises.map((exercise) => {
                  const top = getTopSet(exercise.sets);
                  return (
                    <div key={exercise.id} className={`rounded-[24px] border p-4 ${dark ? "border-white/10 bg-black/10" : "border-slate-200 bg-slate-50"}`}>
                      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-lg font-semibold">{exercise.name}</div>
                          <div className={`mt-1 text-xs ${muted}`}>{exercise.category} • {exercise.repTarget}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {top && (
                            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
                              e1RM {estimate1RM(Number(top.weight), Number(top.reps))} kg
                            </div>
                          )}
                          <button onClick={() => addSet(exercise.id)} className={buttonSecondary}>
                            <Plus className="h-4 w-4" />
                          </button>
                          <button onClick={() => removeExercise(exercise.id)} className={buttonSecondary}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {exercise.sets.map((set, i) => (
                          <div key={i} className="grid gap-2 rounded-2xl border border-white/10 p-3 md:grid-cols-[100px_100px_110px_1fr]">
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="Weight"
                              value={set.weight}
                              onChange={(e) => updateSet(exercise.id, i, "weight", e.target.value)}
                              className={inputCls}
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              placeholder="Reps"
                              value={set.reps}
                              onChange={(e) => updateSet(exercise.id, i, "reps", e.target.value)}
                              className={inputCls}
                            />
                            <button
                              onClick={() => updateSet(exercise.id, i, "done", !set.done)}
                              className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                                set.done ? "bg-emerald-400 text-slate-950" : buttonSecondary
                              }`}
                            >
                              {set.done ? "Done" : "Mark done"}
                            </button>
                            <div className={`flex items-center text-sm ${muted}`}>
                              Set {i + 1}
                              {Number(set.weight) > 0 && Number(set.reps) > 0 && (
                                <span className="ml-3 text-cyan-300">
                                  e1RM {estimate1RM(Number(set.weight), Number(set.reps))} kg
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  value={sessionNote}
                  onChange={(e) => setSessionNote(e.target.value)}
                  placeholder="Notes: sleep, fatigue, strong lockout, shoulder pump..."
                  className={inputCls}
                />
                <button onClick={() => { setRestSeconds(90); setTimerOn(true); }} className={buttonSecondary}>
                  <Clock3 className="mr-2 inline h-4 w-4" /> {formatSeconds(restSeconds)}
                </button>
                <button onClick={saveSession} className={buttonPrimary}>Save session</button>
              </div>
            </section>

            <section className="grid gap-4">
              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-violet-300" /> Technique cues
                </div>
                <div className="space-y-3">
                  {activeDay.exercises.slice(0, 3).map((exercise) => (
                    <div key={exercise.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                      <div className="mb-2 text-sm font-semibold">{exercise.name}</div>
                      <ul className={`space-y-1 text-sm ${muted}`}>
                        {exercise.tips.map((tip, i) => (
                          <li key={i}>• {tip}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <TimerReset className="h-4 w-4 text-cyan-300" /> Rest timer
                </div>
                <div className="text-5xl font-semibold tracking-tight">{formatSeconds(restSeconds)}</div>
                <div className={`mt-2 text-sm ${muted}`}>{timerOn ? "Timer running" : "Ready"}</div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => setTimerOn(true)} className={buttonPrimary}>Start</button>
                  <button onClick={() => { setTimerOn(false); setRestSeconds(90); }} className={buttonSecondary}>Reset</button>
                </div>
              </div>

              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-3 text-sm font-semibold">Add exercise</div>
                <div className="grid gap-2">
                  {(EXERCISE_LIBRARY[activeDay.label as keyof typeof EXERCISE_LIBRARY] ?? []).map((exercise) => (
                    <button
                      key={exercise.name}
                      onClick={() => addExerciseFromLibrary(exercise.name)}
                      className={`flex items-center justify-between rounded-2xl border p-3 text-left text-sm transition ${
                        dark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span>{exercise.name}</span>
                      <Plus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "progress" && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className={`rounded-[28px] p-5 md:p-6 ${panel}`}>
              <div className="mb-4 text-lg font-semibold">Performance trend</div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"} />
                    <XAxis dataKey="date" stroke={dark ? "#94a3b8" : "#64748b"} />
                    <YAxis stroke={dark ? "#94a3b8" : "#64748b"} />
                    <Tooltip />
                    <Line type="monotone" dataKey="strength" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="grid gap-4">
              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-cyan-300" /> Summary
                </div>
                <div className="space-y-3">
                  <MiniStat label="Logged exercises" value={String(logs.length)} dark={dark} />
                  <MiniStat label="Session days" value={String(totalSessions)} dark={dark} />
                  <MiniStat label="Imported entries" value={String(importedEntries)} dark={dark} />
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "history" && (
          <section className={`rounded-[28px] p-5 md:p-6 ${panel}`}>
            <div className="mb-4 text-lg font-semibold">Recent history</div>
            <div className="grid gap-3">
              {recentHistory.length === 0 && <div className={muted}>No sessions logged yet.</div>}
              {recentHistory.map((log) => {
                const top = getTopSet(log.sets);
                return (
                  <div key={log.id} className={`rounded-2xl border p-4 ${dark ? "border-white/10 bg-black/10" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-semibold">{log.exercise}</div>
                        <div className={`text-sm ${muted}`}>{log.date} • {log.day}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {top && <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">e1RM {estimate1RM(Number(top.weight), Number(top.reps))}</span>}
                        {log.source === "import" && <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs text-violet-300">Imported</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "import" && (
          <div className="grid gap-4 xl:grid-cols-2">
            <section className={`rounded-[28px] p-5 md:p-6 ${panel}`}>
              <div className="mb-4 text-lg font-semibold">Import historic data</div>
              <div className={`mb-4 rounded-2xl border p-4 text-sm ${dark ? "border-white/10 bg-black/10 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                Use one line per entry in this format:<br />
                <span className="font-mono">Bench Press - 2026-04-01 - 90x5</span>
              </div>

              <label className={`mb-2 block text-xs uppercase tracking-[0.18em] ${muted}`}>Paste text</label>
              <textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  buildPreviewFromText(e.target.value);
                }}
                placeholder={"Bench Press - 2026-04-01 - 90x5\nIncline Dumbbell Press - 2026-04-01 - 34x10\nLat Pulldown - 2026-04-03 - 75x11"}
                className={`${inputCls} min-h-[240px] resize-y`}
              />

              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => fileInputRef.current?.click()} className={buttonSecondary}>
                  <FileText className="mr-2 inline h-4 w-4" /> Upload PDF
                </button>
                <button onClick={importPreviewData} className={buttonPrimary}>Import preview data</button>
                <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={onPdfUpload} />
              </div>

              <div className={`mt-4 text-sm ${muted}`}>
                {pdfLoading ? "Extracting PDF text..." : pdfMessage}
              </div>
            </section>

            <section className="grid gap-4">
              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-3 text-lg font-semibold">PDF extracted text</div>
                <textarea
                  value={pdfRawText}
                  onChange={(e) => setPdfRawText(e.target.value)}
                  placeholder="Extracted PDF text will appear here. Clean it into the import format above if needed."
                  className={`${inputCls} min-h-[220px] resize-y`}
                />
              </div>

              <div className={`rounded-[28px] p-5 ${panel}`}>
                <div className="mb-3 text-lg font-semibold">Preview</div>
                <div className="max-h-[260px] space-y-2 overflow-auto">
                  {importPreview.length === 0 && <div className={muted}>No valid lines parsed yet.</div>}
                  {importPreview.map((row, i) => (
                    <div key={`${row.exercise}-${i}`} className={`rounded-2xl border p-3 ${dark ? "border-white/10 bg-black/10" : "border-slate-200 bg-slate-50"}`}>
                      <div className="font-medium">{row.exercise}</div>
                      <div className={`text-sm ${muted}`}>{row.date} • {row.weight} x {row.reps}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, dark }: { icon: React.ReactNode; label: string; value: string; dark: boolean }) {
  return (
    <div className={`rounded-[24px] border p-4 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, dark }: { label: string; value: string; dark: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${dark ? "border-white/10 bg-black/10" : "border-slate-200 bg-slate-50"}`}>
      <div className={`text-xs uppercase tracking-[0.18em] ${dark ? "text-slate-400" : "text-slate-500"}`}>{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
