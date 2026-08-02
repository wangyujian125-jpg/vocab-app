/* ============================================================
 *  类型定义  types.ts
 * ============================================================ */

/** 单词词性 */
export type Pos = 'n' | 'v' | 'adj' | 'adv';

/** 单词对象 */
export interface VocabWord {
  w: string;   // 单词
  p: string;   // 词性 n/v/adj/adv
  m: string;   // 中文释义
  ph: string;  // 音标
}

/** 生成的句子（单个单词对应一条） */
export interface GeneratedSentence {
  sentence: string;  // 含英文单词的句子（纯文本）
  word: string;
  meaning: string;
  pos: Pos;
  field: string;     // 语义场
  person: string;
}

/** 生成的段落 */
export interface GeneratedParagraph {
  html: string;
  plain: string;
  items: GeneratedSentence[];
  theme: string;
  title: string;
}

/** 每日学习计划 */
export interface DayPlan {
  day: number;
  words: VocabWord[];
  paragraph: GeneratedParagraph;
}

/** 学习计划 */
export interface LearningPlan {
  bankId: string;
  bankName: string;
  totalWords: number;
  days: DayPlan[];
  theme: string;
  created: number;
}

/** 生词本单词 */
export interface WrongWord {
  w: string;
  p: string;
  m: string;
  ph: string;
}

/** 学习统计 */
export interface StudyStats {
  learned: number;
  reviewed: number;
  streak: number;
  lastStudyDate: string | null;
}

/** 用户设置 */
export interface UserSettings {
  theme: string;
  autoSpeak: boolean;
  ttsRate: number;
}

/** 本地存储结构 */
export interface VocabStore {
  customWords: VocabWord[];
  wrongWords: WrongWord[];
  plan: LearningPlan | null;
  currentDay: number;
  reviewQueue: WrongWord[];
  lastReviewDate: string | null;
  settings: UserSettings;
  stats: StudyStats;
}

/** 叙事主题 */
export interface NarrativeTheme {
  name: string;
  persons: string[];
  scenes: string[];
  arc: string[];
}
