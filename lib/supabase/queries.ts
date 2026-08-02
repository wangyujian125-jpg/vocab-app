/**
 * Supabase 数据访问层 - 当用户已登录时使用，未登录时回退到 localStorage
 *
 * 本模块封装了对四张数据表的 CRUD 操作：
 *   - custom_words : 用户自定义单词
 *   - wrong_words  : 错词本
 *   - plans        : 学习计划
 *   - progress     : 学习进度
 *
 * 所有函数均假设用户已经通过 Supabase Auth 登录，内部会自动获取
 * 当前用户 ID 进行数据隔离。遇到任何错误时优雅降级，返回空数组、
 * null 或 false，不会抛出异常。
 */

import { createClient } from "@/lib/supabase/client";
import type { VocabWord, WrongWord, LearningPlan } from "@/lib/types";

/* ============================================================
 *  类型定义
 * ============================================================ */

/** 学习进度记录（对应 progress 表的业务视图） */
export interface StudyProgress {
  studyDate: string; // 学习日期，格式 YYYY-MM-DD
  wordsLearned: number; // 当日新学单词数
  wordsReviewed: number; // 当日复习单词数
  dayNumber: number; // 对应计划的第几天
}

/* ============================================================
 *  数据库行类型（内部使用，用于类型安全映射）
 * ============================================================ */

interface CustomWordRow {
  word: string;
  pos: string;
  meaning: string;
  phonetic: string;
}

interface WrongWordRow {
  word: string;
  pos: string;
  meaning: string;
  phonetic: string;
}

interface PlanRow {
  bank_id: string;
  bank_name: string;
  theme: string;
  total_words: number;
  total_days: number;
  current_day: number;
  plan_data: LearningPlan["days"];
  created_at: string;
}

interface ProgressRow {
  study_date: string;
  words_learned: number;
  words_reviewed: number;
  day_number: number;
}

/* ============================================================
 *  Custom Words（自定义单词）
 *  表结构: id, user_id, word, pos, meaning, phonetic, created_at
 * ============================================================ */

/**
 * 获取当前用户的全部自定义单词。
 * @returns VocabWord 数组；出错时返回空数组。
 */
export async function fetchCustomWords(): Promise<VocabWord[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("custom_words")
      .select("word, pos, meaning, phonetic")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    return (data as CustomWordRow[]).map((row) => ({
      w: row.word,
      p: row.pos,
      m: row.meaning,
      ph: row.phonetic,
    }));
  } catch {
    return [];
  }
}

/**
 * 添加单个自定义单词。
 * @param word - 要添加的单词对象
 * @returns 成功返回 true，失败返回 false
 */
export async function addCustomWord(word: VocabWord): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("custom_words").insert({
      user_id: user.id,
      word: word.w,
      pos: word.p,
      meaning: word.m,
      phonetic: word.ph,
    });

    return !error;
  } catch {
    return false;
  }
}

/**
 * 批量添加自定义单词。
 * @param words - 要添加的单词数组
 * @returns 成功返回 true，失败返回 false
 */
export async function addCustomWordsBatch(
  words: VocabWord[],
): Promise<boolean> {
  try {
    if (words.length === 0) return true;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const rows = words.map((word) => ({
      user_id: user.id,
      word: word.w,
      pos: word.p,
      meaning: word.m,
      phonetic: word.ph,
    }));

    const { error } = await supabase.from("custom_words").insert(rows);

    return !error;
  } catch {
    return false;
  }
}

/**
 * 按单词文本删除自定义单词。
 * @param word - 要删除的单词文本
 * @returns 成功返回 true，失败返回 false
 */
export async function deleteCustomWord(word: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("custom_words")
      .delete()
      .eq("user_id", user.id)
      .eq("word", word);

    return !error;
  } catch {
    return false;
  }
}

/* ============================================================
 *  Wrong Words（错词本）
 *  表结构: id, user_id, word, pos, meaning, phonetic, added_at
 * ============================================================ */

/**
 * 获取当前用户的全部错词。
 * @returns WrongWord 数组；出错时返回空数组。
 */
export async function fetchWrongWords(): Promise<WrongWord[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("wrong_words")
      .select("word, pos, meaning, phonetic")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false });

    if (error || !data) return [];

    return (data as WrongWordRow[]).map((row) => ({
      w: row.word,
      p: row.pos,
      m: row.meaning,
      ph: row.phonetic,
    }));
  } catch {
    return [];
  }
}

/**
 * 添加错词到错词本。
 * @param word - 要添加的单词对象
 * @returns 成功返回 true，失败返回 false
 */
export async function addWrongWord(word: WrongWord): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("wrong_words").insert({
      user_id: user.id,
      word: word.w,
      pos: word.p,
      meaning: word.m,
      phonetic: word.ph,
    });

    return !error;
  } catch {
    return false;
  }
}

/**
 * 按单词文本从错词本删除。
 * @param word - 要删除的单词文本
 * @returns 成功返回 true，失败返回 false
 */
export async function deleteWrongWord(word: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("wrong_words")
      .delete()
      .eq("user_id", user.id)
      .eq("word", word);

    return !error;
  } catch {
    return false;
  }
}

/**
 * 清空当前用户的全部错词。
 * @returns 成功返回 true，失败返回 false
 */
export async function clearWrongWords(): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("wrong_words")
      .delete()
      .eq("user_id", user.id);

    return !error;
  } catch {
    return false;
  }
}

/* ============================================================
 *  Plans（学习计划）
 *  表结构: id, user_id, bank_id, bank_name, theme, total_words,
 *          total_days, current_day, plan_data(jsonb), created_at, updated_at
 * ============================================================ */

/**
 * 获取当前用户最近创建的学习计划。
 * @returns LearningPlan 对象；不存在或出错时返回 null。
 */
export async function fetchPlan(): Promise<LearningPlan | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("plans")
      .select(
        "bank_id, bank_name, theme, total_words, total_days, current_day, plan_data, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as PlanRow;

    return {
      bankId: row.bank_id,
      bankName: row.bank_name,
      totalWords: row.total_words,
      days: Array.isArray(row.plan_data) ? row.plan_data : [],
      theme: row.theme,
      created: row.created_at
        ? new Date(row.created_at).getTime()
        : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * 保存学习计划（存在则更新，否则新建）。
 *
 * 将 days 数组序列化到 plan_data JSONB 列，其余字段做驼峰 ->
 * 下划线映射。
 *
 * @param plan - 学习计划对象
 * @returns 成功返回 true，失败返回 false
 */
export async function savePlan(plan: LearningPlan): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const totalDays = plan.days.length;

    const { error } = await supabase.from("plans").upsert(
      {
        user_id: user.id,
        bank_id: plan.bankId,
        bank_name: plan.bankName,
        theme: plan.theme,
        total_words: plan.totalWords,
        total_days: totalDays,
        current_day: 1,
        plan_data: plan.days, // JSONB 列，直接存数组
        created_at: new Date(plan.created).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return !error;
  } catch {
    return false;
  }
}

/**
 * 更新学习计划的当前天数。
 * @param currentDay - 新的当前天数（从 1 开始）
 * @returns 成功返回 true，失败返回 false
 */
export async function updatePlanDay(currentDay: number): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("plans")
      .update({
        current_day: currentDay,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return !error;
  } catch {
    return false;
  }
}

/**
 * 删除当前用户的全部学习计划。
 * @returns 成功返回 true，失败返回 false
 */
export async function deletePlan(): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("plans")
      .delete()
      .eq("user_id", user.id);

    return !error;
  } catch {
    return false;
  }
}

/* ============================================================
 *  Progress（学习进度）
 *  表结构: id, user_id, study_date, words_learned, words_reviewed,
 *          day_number, created_at
 * ============================================================ */

/**
 * 获取当前用户的全部学习进度记录（按日期升序）。
 * @returns StudyProgress 数组；出错时返回空数组。
 */
export async function fetchProgress(): Promise<StudyProgress[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("progress")
      .select("study_date, words_learned, words_reviewed, day_number")
      .eq("user_id", user.id)
      .order("study_date", { ascending: true });

    if (error || !data) return [];

    return (data as ProgressRow[]).map((row) => ({
      studyDate: row.study_date,
      wordsLearned: row.words_learned,
      wordsReviewed: row.words_reviewed,
      dayNumber: row.day_number,
    }));
  } catch {
    return [];
  }
}

/**
 * 保存单条学习进度记录（同一天存在则更新）。
 * @param progress - 学习进度对象
 * @returns 成功返回 true，失败返回 false
 */
export async function saveProgress(progress: StudyProgress): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("progress").upsert(
      {
        user_id: user.id,
        study_date: progress.studyDate,
        words_learned: progress.wordsLearned,
        words_reviewed: progress.wordsReviewed,
        day_number: progress.dayNumber,
      },
      { onConflict: "user_id,study_date" },
    );

    return !error;
  } catch {
    return false;
  }
}

/**
 * 获取今日的学习进度记录。
 * @returns StudyProgress 对象；今日无记录或出错时返回 null。
 */
export async function getTodayProgress(): Promise<StudyProgress | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const { data, error } = await supabase
      .from("progress")
      .select("study_date, words_learned, words_reviewed, day_number")
      .eq("user_id", user.id)
      .eq("study_date", today)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as ProgressRow;

    return {
      studyDate: row.study_date,
      wordsLearned: row.words_learned,
      wordsReviewed: row.words_reviewed,
      dayNumber: row.day_number,
    };
  } catch {
    return null;
  }
}
