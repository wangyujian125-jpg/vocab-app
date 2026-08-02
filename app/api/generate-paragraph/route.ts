/* ============================================================
 *  AI 段落生成接口  route.ts
 *  基于 DeepSeek API，使用「语义锚定替换法」生成嵌词中文段落
 * ============================================================ */

import { NextRequest, NextResponse } from 'next/server';

const THEME_MAP: Record<string, string> = {
  kaoyan: '考研逆袭',
  startup: '创业突围',
  sports: '赛场逆袭',
  science: '科研突破',
};

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

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
    '2. 再将该中文释义原位替换为英文单词。',
    '',
    '【关键规则】',
    '- 每个英文单词必须在段落中且仅出现一次。',
    '- 英文单词必须替换在中文释义所处的语法位置，保证词性一致。',
    '- 段落风格为励志逆袭，叙事要有起承转合，语调昂扬。',
    '- 段落语言以中文为主，英文单词作为语义锚点嵌入其中。',
    '- 段落总字数控制在 200～400 字。',
    '- 只输出段落正文，不要标题、不要解释、不要换行。',
    '- 中文标点使用全角符号。',
    '',
    '请严格按照上述规则生成段落。',
  ].join('\n');
}

function buildUserPrompt(
  words: { w: string; p: string; m: string; ph: string }[],
  themeName: string
): string {
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
    `- 段落围绕「${themeName}」主题展开。`,
    '- 每个单词必须且仅出现一次。',
    '- 确保每个英文单词替换在中文释义的语法位置。',
    '- 段落字数 200～400 字。',
    '- 只输出段落正文。',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'AI 服务未配置' },
      { status: 503 }
    );
  }

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

  if (!words || !Array.isArray(words) || words.length === 0) {
    return NextResponse.json(
      { success: false, error: '未提供单词' },
      { status: 400 }
    );
  }

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
    .filter((w) => w.w);

  if (wordsToUse.length === 0) {
    return NextResponse.json(
      { success: false, error: '未提供单词' },
      { status: 400 }
    );
  }

  const themeId = theme || 'kaoyan';
  const themeName = THEME_MAP[themeId] || THEME_MAP.kaoyan;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(wordsToUse, themeName);

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
      return NextResponse.json(
        { success: false, error: 'AI 生成失败', suggestion: '建议使用本地生成器' },
        { status: 500 }
      );
    }

    const data = await response.json();
    generatedText = data?.choices?.[0]?.message?.content ?? '';

    if (!generatedText) {
      return NextResponse.json(
        { success: false, error: 'AI 生成失败', suggestion: '建议使用本地生成器' },
        { status: 500 }
      );
    }

    generatedText = generatedText.trim().replace(/\n+/g, ' ');
  } catch (error) {
    console.error('[generate-paragraph] 调用 DeepSeek API 异常:', error);
    return NextResponse.json(
      { success: false, error: 'AI 生成失败', suggestion: '建议使用本地生成器' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    paragraph: {
      plain: generatedText,
      title: themeName + ' · AI生成',
      items: wordsToUse.map((w) => ({
        word: w.w,
        meaning: w.m,
        pos: w.p,
        sentence: '',
        field: '',
        person: '',
      })),
      html: '',
      theme: themeName,
    },
  });
}
