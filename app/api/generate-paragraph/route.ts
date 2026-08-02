/* ============================================================
 *  AI 段落生成接口  route.ts
 *  基于 DeepSeek API，使用「语义锚定替换法」生成嵌词中文段落
 *
 *  工作流程：
 *    1. 接收单词列表、叙事主题、每日词量
 *    2. 构建 system / user prompt，调用 DeepSeek API
 *    3. 返回与本地生成器（generator.ts）一致的段落结构
 *
 *  语义锚定替换法（Semantic Anchor Replacement）：
 *    - 先构造一句中文，使单词的中文释义出现在自然语法位置
 *    - 再将该中文释义原位替换为英文单词
 *    - 因英文单词与中文释义词性相同、含义相同，
 *      替换后在中英文语法上均成立，杜绝语义失真
 * ============================================================ */

import { NextRequest, NextResponse } from 'next/server';

/* ---------- 主题映射：主题 ID -> 主题名称 ---------- */
const THEME_MAP: Record<string, string> = {
  kaoyan: '考研逆袭',
  startup: '创业突围',
  sports: '赛场逆袭',
  science: '科研突破',
};

/* ---------- DeepSeek API 地址 ---------- */
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/* ============================================================
 *  构建系统提示词
 *  向 DeepSeek 解释「语义锚定替换法」的具体规则
 * ============================================================ */
function buildSystemPrompt(): string {
  return [
    '你是一位精通中英文双语语境的词汇教学专家，擅长将英语单词自然地融入中文叙事段落中。',
    '',
    '你的核心任务是：根据给定的英语单词列表和叙事主题，生成一段中文叙事段落，将所有英语单词自然地嵌入其中。',
    '',
    '你必须严格遵循「语义锚定替换法」（Semantic Anchor Replacement）来保证语法正确性：',
    '',
    '【语义锚定替换法步骤】',
    '1. 先用中文构思一个完整的叙事句子，让该单词的中文释义出现在句子中自然的语法位置上。',
    '   例如：单词 persevere（动词，坚持），中文释义为"坚持"。',
    '   先造中文句：「她在无数个深夜里坚持推演着每一道难题。」',
    '2. 再将该中文释义原位替换为英文单词。',
    '   替换后：「她在无数个深夜里 persevere 推演着每一道难题。」',
    '   ——此处因为 persevere 与"坚持"同为动词、含义相同，替换后句子在语法上依然成立。',
    '',
    '【关键规则】',
    '- 每个英文单词必须在段落中且仅出现一次。',
    '- 英文单词必须替换在中文释义所处的语法位置，保证词性（n/v/adj/adv）一致。',
    '- 段落风格为励志逆袭（underdog comeback），叙事要有起承转合，语调昂扬。',
    '- 段落语言以中文为主，英文单词作为语义锚点嵌入其中。',
    '- 段落总字数控制在 200～400 字（含英文单词）。',
    '- 不要输出任何解释性文字、标题或列表，只输出段落正文本身。',
    '- 段落中不要使用换行符，保持为一个连续的文本块。',
    '- 中文标点使用全角符号（，。；！？），英文单词前后可自然衔接。',
    '',
    '【词性替换示例】',
    '- 名词(n)：resilience（韧性）→「她凭借骨子里的 resilience 扛过了最艰难的三个月。」',
    '- 动词(v)：scrutinize（仔细检查）→「他逐字逐句地 scrutinize 合同条款，不放过任何隐患。」',
    '- 形容词(adj)：meticulous（严谨的）→「这份 meticulous 的方案让评审组眼前一亮。」',
    '- 副词(adv)：relentlessly（不懈地）→「她 relentlessly 地推进着每天的训练计划。」',
    '',
    '请严格按照上述规则生成段落。',
  ].join('\n');
}

/* ============================================================
 *  构建用户提示词
 *  包含单词列表（词性 + 释义）和主题名称
 * ============================================================ */
function buildUserPrompt(
  words: { w: string; p: string; m: string; ph: string }[],
  themeName: string
): string {
  // 构建单词清单
  const wordList = words.map((w, i) => {
    return `${i + 1}. ${w.w}（${w.p}）—— ${w.m}`;
  }).join('\n');

  return [
    `叙事主题：${themeName}`,
    '',
    '请将以下单词嵌入一段该主题的励志逆袭叙事段落中：',
    '',
    wordList,
    '',
    '要求：',
    `- 段落围绕「${themeName}」主题展开，讲述一个主角从低谷到逆袭的故事。`,
    '- 每个单词必须且仅出现一次，使用「语义锚定替换法」嵌入。',
    '- 确保每个英文单词替换在中文释义的语法位置，词性一致、语义通顺。',
    '- 段落字数 200～400 字。',
    '- 只输出段落正文，不要标题、不要解释、不要换行。',
  ].join('\n');
}

/* ============================================================
 *  POST 处理器
 * ============================================================ */
export async function POST(request: NextRequest) {
  // -------- 1. 校验环境变量 --------
  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error: 'AI 服务未配置',
      },
      { status: 503 }
    );
  }

  // -------- 2. 解析请求体 --------
  let body: { words?: unknown; theme?: string; perDay?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: '请求体格式错误' },
      { status: 400 }
    );
  }

  const { words, theme, perDay } = body;

  // -------- 3. 校验单词列表 --------
  if (!words || !Array.isArray(words) || words.length === 0) {
    return NextResponse.json(
      { success: false, error: '未提供单词' },
      { status: 400 }
    );
  }

  // 确定实际使用的单词数量（perDay 限制，默认取全部）
  const perDayNum = typeof perDay === 'number' && perDay > 0 ? perDay : words.length;
  const wordsToUse: { w: string; p: string; m: string; ph: string }[] = words
    .slice(0, perDayNum)
    .map((w: unknown) => {
      const obj = w as Record<string, string>;
      return {
        w: obj?.w ?? '',
        p: obj?.p ?? 'n',
        m: obj?.m ?? '',
        ph: obj?.ph ?? '',
      };
    })
    .filter((w) => w.w); // 过滤掉空单词

  if (wordsToUse.length === 0) {
    return NextResponse.json(
      { success: false, error: '未提供单词' },
      { status: 400 }
    );
  }

  // -------- 4. 主题映射 --------
  const themeId = theme || 'kaoyan';
  const themeName = THEME_MAP[themeId] || THEME_MAP.kaoyan;

  // -------- 5. 构建提示词 --------
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(wordsToUse, themeName);

  // -------- 6. 调用 DeepSeek API --------
  let generatedText: string;
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error(
        `[generate-paragraph] DeepSeek API 返回错误状态码: ${response.status}`
      );
      // 返回 500 并建议使用本地生成器
      return NextResponse.json(
        {
          success: false,
          error: 'AI 生成失败',
          suggestion: '建议使用本地生成器（local generator）作为备选方案',
        },
        { status: 500 }
      );
    }

    const data = await response.json();
    generatedText = data?.choices?.[0]?.message?.content ?? '';

    if (!generatedText) {
      console.error('[generate-paragraph] DeepSeek 返回空内容');
      return NextResponse.json(
        {
          success: false,
          error: 'AI 生成失败',
          suggestion: '建议使用本地生成器（local generator）作为备选方案',
        },
        { status: 500 }
      );
    }

    // 清理可能存在的首尾空白与多余换行
    generatedText = generatedText.trim().replace(/\n+/g, ' ');
  } catch (error) {
    console.error('[generate-paragraph] 调用 DeepSeek API 异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'AI 生成失败',
        suggestion: '建议使用本地生成器（local generator）作为备选方案',
      },
      { status: 500 }
    );
  }

  // -------- 7. 组装返回结果（与本地生成器结构一致） --------
  return NextResponse.json({
    success: true,
    paragraph: {
      plain: generatedText,
      title: themeName + ' · AI生成',
      items: wordsToUse.map((w) => ({
        word: w.w,
        meaning: w.m,
        pos: w.p,
        sentence: '', // AI 生成的段落为整体文本，不拆分单句
        field: '',
        person: '',
      })),
      html: '', // AI 生成不需要 HTML 高亮结构
      theme: themeName,
    },
  });
}
