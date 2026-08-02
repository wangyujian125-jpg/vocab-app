'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listBanks, getBank } from '@/lib/wordbanks';
import type { VocabWord, VocabBank } from '@/lib/wordbanks';
import { genPlan, genParagraph, getThemeList, normalizePos, primaryMeaning } from '@/lib/generator';
import type {
  LearningPlan,
  DayPlan,
  WrongWord,
  GeneratedParagraph,
  GeneratedSentence,
  Pos,
} from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const STORE_KEY = 'vocab-store-v2';

/* ---------- TTS helper ---------- */
function speakWord(word: string, rate: number = 0.9) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

/* ---------- POS helpers ---------- */
const POS_LABEL: Record<Pos, string> = {
  n: '名词',
  v: '动词',
  adj: '形容词',
  adv: '副词',
};
const POS_COLOR: Record<Pos, string> = {
  n: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  v: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  adj: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  adv: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

/* ---------- Paragraph rendering helper ---------- */
function renderParagraphText(
  paragraph: GeneratedParagraph,
  wrongWords: WrongWord[],
  onWordClick: (e: React.MouseEvent, sentence: GeneratedSentence) => void
): React.ReactNode[] {
  const text = paragraph.plain;
  // Find positions of each word in the text
  const wordPositions = paragraph.items
    .map(item => ({ item, index: text.indexOf(item.word) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index);

  const segments: React.ReactNode[] = [];
  let lastEnd = 0;
  wordPositions.forEach(({ item, index }, i) => {
    if (index < lastEnd) return; // skip overlapping / duplicate occurrences
    if (index > lastEnd) {
      segments.push(<span key={`t${i}`}>{text.substring(lastEnd, index)}</span>);
    }
    const isInWrong = wrongWords.some(w => w.w === item.word);
    segments.push(
      <span
        key={`w${i}`}
        className={
          'ctx-word cursor-pointer font-semibold text-blue-600 underline decoration-dotted underline-offset-4 transition-colors hover:bg-blue-50 hover:text-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30 ' +
          (isInWrong ? 'in-wrong !text-red-500 !decoration-red-400 dark:!text-red-400' : '')
        }
        onClick={(e) => onWordClick(e, item)}
      >
        {item.word}
      </span>
    );
    lastEnd = index + item.word.length;
  });
  if (lastEnd < text.length) {
    segments.push(<span key="end">{text.substring(lastEnd)}</span>);
  }
  return segments;
}

type View = 'setup' | 'reading' | 'wrong' | 'import';

interface BubbleState {
  x: number;
  y: number;
  sentence: GeneratedSentence;
}

export function VocabApp() {
  const router = useRouter();
  const [view, setView] = useState<View>('setup');
  const [banks, setBanks] = useState<VocabBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [currentDay, setCurrentDay] = useState(1);
  const [wrongWords, setWrongWords] = useState<WrongWord[]>([]);
  const [customWords, setCustomWords] = useState<VocabWord[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [days, setDays] = useState(10);
  const [perDay, setPerDay] = useState(20);
  const [themeId, setThemeId] = useState('kaoyan');
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [reviewParagraph, setReviewParagraph] = useState<GeneratedParagraph | null>(null);
  const [importText, setImportText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const themes = useMemo(() => getThemeList(), []);

  /* ---------- Supabase auth: check login state ---------- */
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  /* ---------- load banks on mount ---------- */
  useEffect(() => {
    setBanks(listBanks());
  }, []);

  /* ---------- load from localStorage on mount ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.plan) setPlan(s.plan);
        if (Array.isArray(s.wrongWords)) setWrongWords(s.wrongWords);
        if (Array.isArray(s.customWords)) setCustomWords(s.customWords);
        if (typeof s.currentDay === 'number') setCurrentDay(s.currentDay);
        if (typeof s.autoSpeak === 'boolean') setAutoSpeak(s.autoSpeak);
        if (typeof s.darkMode === 'boolean') setDarkMode(s.darkMode);
        if (s.themeId) setThemeId(s.themeId);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  /* ---------- save to localStorage on changes ---------- */
  useEffect(() => {
    if (!loaded) return;
    const store = {
      plan,
      wrongWords,
      customWords,
      currentDay,
      autoSpeak,
      darkMode,
      themeId,
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, [plan, wrongWords, customWords, currentDay, autoSpeak, darkMode, themeId, loaded]);

  /* ---------- dark mode toggle ---------- */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  /* ---------- word lookup map (banks + customWords + wrongWords) ---------- */
  const wordMap = useMemo(() => {
    const map = new Map<string, { phonetic: string; pos: string; meaning: string }>();
    const add = (w: { w: string; p: string; m: string; ph: string }) => {
      if (!map.has(w.w)) {
        map.set(w.w, { phonetic: w.ph || '', pos: w.p || '', meaning: w.m || '' });
      }
    };
    banks.forEach(b => b.words.forEach(add));
    customWords.forEach(add);
    wrongWords.forEach(add);
    return map;
  }, [banks, customWords, wrongWords]);

  /* ---------- bubble: close on outside click / Escape ---------- */
  useEffect(() => {
    if (!bubble) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.def-bubble') || t.closest('.ctx-word')) return;
      setBubble(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBubble(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [bubble]);

  /* ---------- derived data ---------- */
  const totalDays = plan?.days.length ?? 0;
  const safeDay = Math.min(Math.max(1, currentDay), Math.max(1, totalDays));
  const dayPlan: DayPlan | null =
    plan && totalDays > 0 ? plan.days[safeDay - 1] ?? null : null;

  const isInWrong = (word: string) => wrongWords.some(w => w.w === word);

  /* ---------- handlers ---------- */
  const addToWrong = (w: { w: string; p: string; m: string; ph: string }) => {
    if (isInWrong(w.w)) return;
    setWrongWords(prev => [...prev, { w: w.w, p: w.p, m: w.m, ph: w.ph }]);
  };

  const removeFromWrong = (word: string) => {
    setWrongWords(prev => prev.filter(w => w.w !== word));
  };

  const onWordClick = (e: React.MouseEvent, item: GeneratedSentence) => {
    setBubble({ x: e.clientX, y: e.clientY, sentence: item });
    if (autoSpeak) speakWord(item.word);
  };

  const startLearning = () => {
    const bank = selectedBankId ? getBank(selectedBankId) : null;
    if (!bank) return;
    const dayPlans = genPlan(bank.words, days, perDay, themeId);
    setPlan({
      bankId: bank.id,
      bankName: bank.name,
      totalWords: bank.words.length,
      days: dayPlans,
      theme: themeId,
      created: Date.now(),
    });
    setCurrentDay(1);
    setView('reading');
  };

  const startCustom = () => {
    if (customWords.length === 0) return;
    const dayPlans = genPlan(customWords, days, perDay, themeId);
    setPlan({
      bankId: 'custom',
      bankName: '自定义词库',
      totalWords: customWords.length,
      days: dayPlans,
      theme: themeId,
      created: Date.now(),
    });
    setCurrentDay(1);
    setView('reading');
  };

  const parseImport = (text: string): VocabWord[] => {
    return text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split(/[,|，｜]/).map(s => s.trim());
        return {
          w: parts[0] || '',
          p: parts[1] || 'n',
          m: parts[2] || '',
          ph: parts[3] || '',
        };
      })
      .filter(w => w.w);
  };

  const doImport = () => {
    const words = parseImport(importText);
    if (words.length === 0) return;
    setCustomWords(prev => {
      const existing = new Set(prev.map(w => w.w));
      return [...prev, ...words.filter(w => !existing.has(w.w))];
    });
    setImportText('');
  };

  const removeCustom = (word: string) => {
    setCustomWords(prev => prev.filter(w => w.w !== word));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      const words = parseImport(text);
      if (words.length > 0) {
        setCustomWords(prev => {
          const existing = new Set(prev.map(w => w.w));
          return [...prev, ...words.filter(w => !existing.has(w.w))];
        });
      }
      // 重置 input 以便重复上传同一文件
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const exportWrong = () => {
    const text = wrongWords.map(w => `${w.w},${w.p},${w.m},${w.ph}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '生词本.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const genReview = () => {
    if (wrongWords.length === 0) return;
    const words: VocabWord[] = wrongWords.map(w => ({ w: w.w, p: w.p, m: w.m, ph: w.ph }));
    setReviewParagraph(genParagraph(words, themeId, Date.now()));
  };

  const clearWrong = () => {
    if (window.confirm('确定要清空生词本吗？此操作不可撤销。')) {
      setWrongWords([]);
      setReviewParagraph(null);
    }
  };

  const tabs: { id: View; label: string }[] = [
    { id: 'setup', label: '开始学习' },
    { id: 'reading', label: '阅读段落' },
    { id: 'wrong', label: '生词本' },
    { id: 'import', label: '导入词汇' },
  ];

  /* ---------- definition bubble ---------- */
  const renderBubble = () => {
    if (!bubble) return null;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const BH = 270;
    const BW = 288;
    const showAbove = bubble.y + BH > vh;
    const top = showAbove ? Math.max(8, bubble.y - BH - 8) : bubble.y + 12;
    const left = Math.min(Math.max(8, bubble.x - BW / 2), vw - BW - 8);
    const s = bubble.sentence;
    const lookup = wordMap.get(s.word);
    const ph = lookup?.phonetic || '';
    const already = isInWrong(s.word);

    return (
      <div
        className="def-bubble fixed z-50 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        style={{ left, top }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-blue-600 dark:text-blue-400">{s.word}</div>
            {ph && <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{ph}</div>}
          </div>
          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${POS_COLOR[s.pos] || POS_COLOR.n}`}>
            {POS_LABEL[s.pos] || s.pos}
          </span>
        </div>
        <div className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">{s.meaning}</div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => speakWord(s.word)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white transition hover:bg-blue-700"
          >
            朗读
          </button>
          <button
            onClick={() => addToWrong({ w: s.word, p: s.pos, m: s.meaning, ph })}
            disabled={already}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              already
                ? 'cursor-default bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            {already ? '已在生词本' : '加入生词本'}
          </button>
          <button
            onClick={() => setBubble(null)}
            aria-label="关闭"
            className="ml-auto rounded-lg px-2 py-1.5 text-sm text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  /* ---------- shared word row ---------- */
  const renderWordRow = (
    w: VocabWord,
    actions: React.ReactNode
  ) => {
    const pos = normalizePos(w.p);
    return (
      <div
        key={w.w}
        className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-blue-600 dark:text-blue-400">{w.w}</span>
            {w.ph && <span className="text-xs text-gray-400">{w.ph}</span>}
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${POS_COLOR[pos] || POS_COLOR.n}`}>
              {POS_LABEL[pos] || w.p}
            </span>
          </div>
          <div className="truncate text-sm text-gray-500 dark:text-gray-400">
            {primaryMeaning(w.m) || w.m}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
    );
  };

  /* ---------- main render ---------- */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 transition-colors dark:bg-gray-900 dark:text-gray-100">
      {/* ---------- Navigation bar ---------- */}
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-700 dark:bg-gray-800/90">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">语境背词</div>
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === t.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {t.label}
                {t.id === 'wrong' && wrongWords.length > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {wrongWords.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {authReady && user ? (
              <>
                <span className="hidden text-xs text-green-600 sm:inline dark:text-green-400">
                  ● 云端同步中
                </span>
                <span className="hidden max-w-[120px] truncate text-xs text-gray-500 md:inline dark:text-gray-400">
                  {user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  退出
                </button>
              </>
            ) : authReady && !user ? (
              <>
                <button
                  onClick={() => router.push('/auth/login')}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  登录
                </button>
                <button
                  onClick={() => router.push('/auth/sign-up')}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
                >
                  注册
                </button>
              </>
            ) : null}
            <button
              onClick={() => setAutoSpeak(v => !v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                autoSpeak
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              朗读 {autoSpeak ? '开' : '关'}
            </button>
            <button
              onClick={() => setDarkMode(v => !v)}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              {darkMode ? '浅色' : '深色'}
            </button>
          </div>
        </div>
      </nav>

      {/* ---------- Cloud sync banner (only when not logged in) ---------- */}
      {authReady && !user && (
        <div className="bg-blue-50 px-4 py-2 text-center text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          当前为离线模式（数据保存在本地浏览器）。{' '}
          <button
            onClick={() => router.push('/auth/sign-up')}
            className="font-semibold underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200"
          >
            注册新账号
          </button>
          {' '}或{' '}
          <button
            onClick={() => router.push('/auth/login')}
            className="font-semibold underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200"
          >
            登录
          </button>
          {' '}后即可使用云端同步功能
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* ===================== SETUP VIEW ===================== */}
        {view === 'setup' && (
          <div className="space-y-6">
            <div>
              <h2 className="mb-1 text-lg font-semibold">选择词库</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                点击词库卡片以选中，再设置学习参数。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {banks.map(b => {
                const selected = selectedBankId === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBankId(b.id)}
                    className={`rounded-xl border p-4 text-left shadow-sm transition hover:shadow-md dark:bg-gray-800 ${
                      selected
                        ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900/50'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{b.name}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                        {b.words.length} 词
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{b.desc}</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{b.count}</p>
                  </button>
                );
              })}
            </div>

            {/* configuration form */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 text-base font-semibold">学习参数</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-600 dark:text-gray-300">记忆周期（天）</span>
                  <input
                    type="number"
                    min={1}
                    value={days}
                    onChange={e => setDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-600 dark:text-gray-300">每日词量</span>
                  <input
                    type="number"
                    min={1}
                    value={perDay}
                    onChange={e => setPerDay(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-600 dark:text-gray-300">叙事主题</span>
                  <select
                    value={themeId}
                    onChange={e => setThemeId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900"
                  >
                    {themes.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={startLearning}
                  disabled={!selectedBankId}
                  className={`rounded-lg px-5 py-2.5 text-sm font-medium text-white transition ${
                    selectedBankId ? 'bg-blue-600 hover:bg-blue-700' : 'cursor-not-allowed bg-gray-300 dark:bg-gray-700'
                  }`}
                >
                  开始学习
                </button>
                {plan && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => setView('reading')}
                      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                    >
                      继续学习
                    </button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      当前进度：第 {safeDay} 天 / 共 {totalDays} 天 · {plan.bankName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================== READING VIEW ===================== */}
        {view === 'reading' && (
          <div className="space-y-5">
            {!plan || !dayPlan ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-600">
                <p className="text-gray-500 dark:text-gray-400">请先选择词库并创建学习计划</p>
                <button
                  onClick={() => setView('setup')}
                  className="mt-4 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  前往设置
                </button>
              </div>
            ) : (
              <>
                {/* progress */}
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">
                      第 {safeDay} 天 / 共 {totalDays} 天
                    </span>
                    <span className="text-gray-400">{plan.bankName}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-2 rounded-full bg-blue-600 transition-all"
                      style={{ width: `${totalDays ? (safeDay / totalDays) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* paragraph */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-3 text-base font-semibold text-blue-600 dark:text-blue-400">
                    {dayPlan.paragraph.title}
                  </h3>
                  <p className="text-base leading-loose tracking-wide text-gray-800 dark:text-gray-100">
                    {renderParagraphText(dayPlan.paragraph, wrongWords, onWordClick)}
                  </p>
                  <p className="mt-3 text-xs text-gray-400">
                    点击段落中的英文单词可查看释义并朗读。
                  </p>
                </div>

                {/* day navigation */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setCurrentDay(d => Math.max(1, d - 1))}
                    disabled={safeDay <= 1}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    上一天
                  </button>
                  <button
                    onClick={() => setCurrentDay(d => Math.min(totalDays, d + 1))}
                    disabled={safeDay >= totalDays}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    下一天
                  </button>
                  <button
                    onClick={() => setView('setup')}
                    className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    返回设置
                  </button>
                </div>

                {/* word list */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="mb-3 text-base font-semibold">本日单词（{dayPlan.words.length}）</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {dayPlan.words.map(w => {
                      const inWrong = isInWrong(w.w);
                      return renderWordRow(
                        w,
                        <>
                          <button
                            onClick={() => speakWord(w.w)}
                            className="rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            朗读
                          </button>
                          <button
                            onClick={() => addToWrong(w)}
                            disabled={inWrong}
                            className={`rounded px-2 py-1 text-xs transition ${
                              inWrong
                                ? 'cursor-default text-gray-400'
                                : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                            }`}
                          >
                            {inWrong ? '已在生词本' : '加入生词本'}
                          </button>
                        </>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===================== WRONG WORDS VIEW ===================== */}
        {view === 'wrong' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">生词本</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                {wrongWords.length} 词
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  onClick={exportWrong}
                  disabled={wrongWords.length === 0}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  导出
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={wrongWords.length === 0}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  打印
                </button>
                <button
                  onClick={genReview}
                  disabled={wrongWords.length === 0}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white transition hover:bg-blue-700 disabled:opacity-40"
                >
                  生成复习段落
                </button>
                <button
                  onClick={clearWrong}
                  disabled={wrongWords.length === 0}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white transition hover:bg-red-600 disabled:opacity-40"
                >
                  清空
                </button>
              </div>
            </div>

            {wrongWords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400 dark:border-gray-600">
                生词本为空
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {wrongWords.map(w =>
                  renderWordRow(
                    w,
                    <>
                      <button
                        onClick={() => speakWord(w.w)}
                        className="rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        朗读
                      </button>
                      <button
                        onClick={() => removeFromWrong(w.w)}
                        className="rounded px-2 py-1 text-xs text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        移除
                      </button>
                    </>
                  )
                )}
              </div>
            )}

            {reviewParagraph && (
              <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm dark:border-blue-900/50 dark:bg-gray-800">
                <h3 className="mb-3 text-base font-semibold text-blue-600 dark:text-blue-400">
                  {reviewParagraph.title}
                </h3>
                <p className="text-base leading-loose tracking-wide text-gray-800 dark:text-gray-100">
                  {renderParagraphText(reviewParagraph, wrongWords, onWordClick)}
                </p>
                <p className="mt-3 text-xs text-gray-400">
                  点击段落中的英文单词可查看释义并朗读。
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===================== IMPORT VIEW ===================== */}
        {view === 'import' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-2 text-base font-semibold">导入自定义词汇</h3>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                每行一个单词，格式：单词,词性,释义,音标 或 单词|词性|释义|音标
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="mb-3 flex items-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium transition hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  上传文件（.txt / .csv）
                </button>
                <span className="text-xs text-gray-400">或直接在下方粘贴</span>
              </div>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                rows={6}
                placeholder={'ability,n,能力,/əˈbɪləti/\naccept|v|接受|/əkˈsept/'}
                className="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={doImport}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  导入
                </button>
                <button
                  onClick={startCustom}
                  disabled={customWords.length === 0}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  使用自定义词库学习
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  已导入 {customWords.length} 个自定义单词
                </span>
              </div>
            </div>

            {customWords.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <h3 className="mb-3 text-base font-semibold">自定义词库（{customWords.length}）</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {customWords.map(w =>
                    renderWordRow(
                      w,
                      <button
                        onClick={() => removeCustom(w.w)}
                        className="rounded px-2 py-1 text-xs text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        移除
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {renderBubble()}
    </div>
  );
}
