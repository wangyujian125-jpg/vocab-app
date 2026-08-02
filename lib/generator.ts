/* ============================================================
 *  语境化词汇生成引擎  generator.ts
 *  核心方法：语义锚定替换法（Semantic Anchor Replacement）
 *
 *  原理：
 *    1. 每个单词有词性(pos)和中文释义(meaning)
 *    2. 先写一句「中文释义出现在自然语法位置」的中文句子
 *    3. 再把中文释义原位替换为英文单词
 *    4. 因为英文单词与中文释义词性相同、含义相同，
 *       所以替换后在中英文语法上均成立，杜绝语义失真
 * ============================================================ */

import type { VocabWord, Pos, GeneratedSentence, GeneratedParagraph, DayPlan, NarrativeTheme } from './types';
import { getVerbTemplates, detectVerbField, validateVerbSentence, getUniversalFallback } from './verb-templates';

/* ---------- 叙事主题 ---------- */
const THEMES: Record<string, NarrativeTheme> = {
  kaoyan: {
    name: '考研逆袭',
    persons: ['林晚', '苏然', '陈屿', '叶蓁', '顾野'],
    scenes: ['自习室', '图书馆四楼', '出租屋', '教学楼天台'],
    arc: ['查分', '复盘', '重启', '冲刺', '上岸']
  },
  startup: {
    name: '创业突围',
    persons: ['阿泽', '老周', '唐宁', '方远', '许衡'],
    scenes: ['孵化器工位', '深夜的仓库', '投资人会议室', '街边摊位'],
    arc: ['入局', '碰壁', '复盘', '破局', '扩张']
  },
  sports: {
    name: '赛场逆袭',
    persons: ['江帆', '陆遥', '齐铭', '赵锐', '楚河'],
    scenes: ['训练馆', '省队宿舍', '决赛赛场', '康复中心'],
    arc: ['落选', '加练', '受伤', '重返', '夺金']
  },
  science: {
    name: '科研突破',
    persons: ['沈知', '何川', '宋屿', '程微', '韩立'],
    scenes: ['国家实验室', '深夜的数据中心', '学术会议', '田间试验站'],
    arc: ['立项', '失败', '验证', '突破', '发表']
  }
};

/* ---------- 语义场判定（仅用于名词/形容词/副词）----------
 * 注意：动词已迁移至 verb-templates.ts 的精细微场系统，
 * 此处仅保留名词/形容词/副词的语义场判定。
 * "迎合"已从"适应"场移除，由动词微场"迎合讨好"独立处理。
 */
const FIELD_RULES = [
  { field: '表达', keywords: ['断言', '宣布', '声明', '主张', '辩称', '阐述', '宣称', '表明', '表达', '陈述', '宣告', '强调', '申明', '说明', '解释', '论述', '论证', '宣示', '坦言', '直言', '呼喊', '呼吁', '抗议', '谴责', '反驳', '驳斥', '否认', '承认', '坦白', '交代'] },
  { field: '适应', keywords: ['适应', '调节', '调整', '匹配', '顺应', '配合', '协调', '兼容', '磨合', '调适', '变通', '灵活'] },
  { field: '学术', keywords: ['研究', '观察', '实验', '理论', '分析', '数据', '论证', '学科', '知识', '原理', '验证', '考试', '考察', '测试', '测量', '预测', '评估', '估计', '推理', '推导', '推测', '推断', '判断', '概念', '假设', '推论', '逻辑', '命题', '假说', '学术', '科学', '科研', '认知', '证明', '证实', '结论', '编纂', '编辑', '整理', '梳理', '衡量'] },
  { field: '自然', keywords: ['生态', '环境', '物种', '气候', '能源', '地理', '生物', '植物', '动物', '野生', '再生', '可再', '污染', '资源', '海洋', '陆地', '气象', '栖息', '冰川', '植被', '荒野', '干旱', '侵蚀', '排放', '灭绝', '碳排放', '碳中和', '碳循环'] },
  { field: '商业', keywords: ['市场', '资本', '投资', '消费', '竞争', '供给', '需求', '客户', '营销', '成本', '利润', '增长', '商业', '产业', '运营', '供应', '企业', '定价', '竞品', '战略', '管理', '扩张'] },
  { field: '社会', keywords: ['社会', '就业', '失业', '政策', '公共', '社区', '群体', '阶层', '文化', '传统', '制度', '法律', '权利', '歧视', '人口', '迁移', '移民'] },
  { field: '励志', keywords: ['坚持', '努力', '勇气', '信念', '决心', '毅力', '奋斗', '梦想', '目标', '希望', '力量', '超越', '突破', '成长', '执着', '笃信', '谦逊', '谦虚', '坚韧', '韧性', '顽强', '不屈'] },
  { field: '生活', keywords: ['食物', '健康', '饮食', '运动', '休息', '日常', '家庭', '朋友', '情感', '生活', '习惯', '碳水', '营养', '早餐', '作息', '情绪', '食欲'] }
];

function detectField(meaning: string): string {
  for (const rule of FIELD_RULES) {
    for (const kw of rule.keywords) {
      if (meaning.indexOf(kw) >= 0) return rule.field;
    }
  }
  return '通用';
}

/* ---------- 句式模板库（动词模板原则：{M} 后不绑定具体宾语）---------- */
const TPL_NOUN: Record<string, string[]> = {
  '表达': [
    '在众人面前，{P}勇敢地发出了自己的{M}',
    '那份措辞激烈的{M}，让在场所有人都沉默了',
    '她用最简练的语言完成了这次{M}，没有一句废话',
    '没有人想到，一句看似平淡的{M}竟引发如此大的波澜'
  ],
  '适应': [
    '面对市场的剧烈变化，{P}展现出了极强的{M}能力',
    '她深知，{M}不是妥协，而是一种更高级的智慧',
    '那份近乎本能的{M}，让她在任何环境中都能迅速找到节奏',
    '所有人都惊叹于她对新环境的{M}速度'
  ],
  '学术': [
    '{P}通过日复一日的{M}，终于摸索出命题的底层逻辑',
    '在密密麻麻的笔记里，那份关于{M}的整理成了她最珍视的财富',
    '导师反复强调，{M}才是这门学科的真正地基',
    '每一次对{M}的深入追问，都让她离真相更近一步',
    '他意识到，自己对{M}的理解还停留在表面，必须推倒重来',
    '凌晨三点，{loc}里只剩下她反复推敲{M}的背影',
    '把{M}彻底吃透后，那些曾经天书般的题目忽然变得清晰'
  ],
  '自然': [
    '她意识到，只有真正理解{M}的运作规律，才能找到问题的解法',
    '纪录片里关于{M}的画面，让她第一次对这个领域心生向往',
    '保护{M}不是口号，而是关乎每一代人未来的生存底线',
    '随着研究的推进，{M}背后的复杂机制逐渐浮出水面',
    '她在野外记录本上详细记录了{M}的现状，数据远比想象中严峻',
    '把{M}纳入考量后，整个模型的预测精度提升了整整一个量级'
  ],
  '商业': [
    '在复盘失败教训时，{P}把对{M}的误判列在了第一条',
    '投资人最看重的，恰恰是团队对{M}的精准把控',
    '她用三个月跑通了一条围绕{M}的完整闭环',
    '每一次对{M}的重新定义，都可能撬动一个新赛道',
    '数据不会说谎，{M}的走势印证了她当初的判断',
    '面对巨头的围剿，她选择从{M}这个被忽视的缝隙切入'
  ],
  '社会': [
    '新闻报道里关于{M}的讨论，让她陷入了长久的沉思',
    '她决心用自己的研究，为改善{M}贡献一份力量',
    '解决{M}问题没有捷径，需要的是系统性的长期投入',
    '在那座小城，{M}的改善肉眼可见地改变着人们的生活',
    '她把田野调查的焦点锁定在{M}上，一扎就是半年'
  ],
  '励志': [
    '支撑{P}走过至暗时刻的，正是内心那份对{M}的笃信',
    '她把{M}写进日记扉页，当作每天叫醒自己的理由',
    '旁人笑她痴，她却清楚{M}才是自己真正想守住的底线',
    '当所有人都劝她放弃时，{M}成了她最后的倔强',
    '她知道，通往{M}的路上注定孤独，但她甘之如饴',
    '每一次跌倒后重新站起，{P}对{M}的理解都更深一层'
  ],
  '生活': [
    '医生提醒她，合理的{M}是保持状态的根基',
    '她开始认真对待每天{M}这件小事，生活竟慢慢有了起色',
    '把{M}安排妥当后，她终于有余力去想更远的事',
    '看似平淡的{M}，却在她最焦虑的日子里成了稳住心神的力量'
  ],
  '通用': [
    '她在错题本上反复标注{M}，誓要彻底攻克这个知识点',
    '考试中关于{M}的那道题，她纠结了整整五分钟，最终咬牙选了答案',
    '老师用一整节课讲透了{M}，她忽然觉得豁然开朗',
    '她把{M}抄在便签上贴满整面墙，每天抬头就能看见',
    '没有人比她更清楚，{M}这个词背后藏着多少个不眠之夜',
    '翻开课本第37页，{M}的定义旁边是她密密麻麻的批注',
    '她终于分清了{M}与易混词之间的细微差别',
    '每当快要忘记时，她就逼自己重新默写一遍{M}'
  ]
};

const TPL_VERB: Record<string, string[]> = {
  '表达': [
    '面对所有人的质疑，{P}毫不犹豫地{M}了自己的立场',
    '她用充分的证据{M}了自己的结论，没有人能反驳',
    '在答辩现场，{P}坚定地{M}道：这个方向值得毕生追寻',
    '她没有选择沉默，而是在公开场合{M}了对现状的不满',
    '当被问及核心分歧时，{P}直截了当地{M}了自己的观点'
  ],
  '适应': [
    '与其对抗趋势，{P}选择主动{M}，在变化中寻找机会',
    '她花了整整一个月去{M}，终于找到了最舒服的节奏',
    '要真正{M}，就必须放下固有偏见，重新审视一切',
    '她开始学着{M}，而不是一味地硬碰硬',
    '所有人都以为她会崩溃，但她{M}得比谁都快'
  ],
  '学术': [
    '{P}决定从最基础的文献开始，系统性地{M}',
    '为了{M}，她连续两周泡在实验室里',
    '导师让她先彻底{M}清楚，再谈创新',
    '她不仅要{M}，更要找到数据背后的因果链条'
  ],
  '自然': [
    '团队花了整整一个雨季去{M}，反而得到了最扎实的结论',
    '她坚持用最笨的办法一步步{M}，不肯走捷径',
    '要真正{M}，必须走出实验室去野外',
    '那些被前人忽略的细节，恰恰是她努力{M}的焦点'
  ],
  '商业': [
    '{P}决定在关键领域{M}，把有限的资源押在最该用力的地方',
    '她开始系统地{M}，每一步都算得清清楚楚',
    '每一次{M}都需要极大的决心，但她毫不犹豫',
    '她决定亲自{M}，不让任何环节脱离掌控'
  ],
  '社会': [
    '{P}走访了十二个城市，只为亲眼去{M}',
    '她坚持用第一手访谈去{M}，不肯只依赖二手资料',
    '要真正{M}，光看数据远远不够',
    '她花了三年时间去{M}，写下了厚厚的田野笔记'
  ],
  '励志': [
    '{P}暗下决心，要用行动去{M}',
    '与其空想，不如先开始{M}，哪怕只是微小的一步',
    '她决定不再犹豫，立刻开始{M}',
    '每当想要退缩时，她就逼自己去{M}'
  ],
  '生活': [
    '她开始学着{M}，不再让焦虑主导生活',
    '每天清晨{M}，渐渐成了她雷打不动的仪式',
    '她认真地{M}着，心境竟慢慢舒展'
  ],
  '通用': [
    '她一遍又一遍地{M}，直到满意为止',
    '当她终于能熟练地{M}时，那些曾经的畏惧已烟消云散',
    '她决定亲自去{M}，不假手于人',
    '没有人比她更清楚，学会{M}意味着多少个不眠之夜',
    '她不断地{M}，从不轻言放弃',
    '只要还有一口气在，她就会继续{M}下去'
  ]
};

const TPL_ADJ: Record<string, string[]> = {
  '表达': [
    '她的发言{M}而有力，让在场的每一个人都为之动容',
    '那份{M}的措辞，精准地传达了她的立场',
    '面对刁难，{P}的回答{M}得体，不卑不亢',
    '她用{M}的语言，把复杂的观点讲得透彻明了'
  ],
  '学术': [
    '在论证最关键的环节，{P}展现出了{M}的学术判断力',
    '这份{M}的分析报告，让评审组眼前一亮',
    '她以{M}的逻辑链，堵住了所有质疑的缺口',
    '导师评价她的研究思路{M}而深邃，难得一见'
  ],
  '自然': [
    '她发现，只有{M}的能源方案才能真正兼顾发展与环保',
    '面对{M}的生态资源，任何短视的开发都是对未来的透支',
    '这份{M}的方案，让评审看到了人与自然共生的可能',
    '她用数据证明，{M}的发展模式并非奢望而是必由之路'
  ],
  '商业': [
    '投资人被这份{M}的商业模式打动，当场拍板追加投资',
    '在瞬息万变的市场里，{M}的战略定力成了她最大的护城河',
    '她给出了一个{M}的定价方案，既守住利润又撬动了增量',
    '团队最缺的，恰恰是这种{M}的长期视野'
  ],
  '社会': [
    '面对复杂的社会议题，{P}始终保持着{M}的立场',
    '她提出的{M}的治理方案，获得了基层的一致认可',
    '这份{M}的政策建议书，字字切中要害',
    '她以{M}的态度，推动了这场迟来的改革'
  ],
  '励志': [
    '即使身处低谷，{P}的眼神依然{M}而坚定',
    '这份{M}的信念，支撑她熬过了无数个想放弃的夜晚',
    '她用{M}的意志，把所有人的质疑一一击碎',
    '越是至暗时刻，她越展现出{M}的心性'
  ],
  '生活': [
    '调整作息后，她的状态肉眼可见地变得{M}',
    '一份{M}的早餐，成了她重启生活的第一个仪式',
    '她把日子过得{M}而有序，焦虑竟不知不觉消退'
  ],
  '通用': [
    '她给出的答案{M}而精准，连老师都点了点头',
    '这份{M}的笔记，成了全班争相传阅的宝贝',
    '她用{M}的方式诠释了什么叫作真正的努力',
    '在所有人当中，只有她的回答{M}到无可挑剔'
  ]
};

const TPL_ADV: Record<string, string[]> = {
  '表达': [
    '{P}{M}地陈述了自己的理由，每一个字都掷地有声',
    '她{M}地指出了方案中的漏洞，不留任何情面',
    '面对镜头，{P}{M}地回应了所有尖锐的提问',
    '她{M}地表达了对团队的支持，言语间满是真诚'
  ],
  '学术': [
    '{P}{M}地梳理着每一条假设，不放过任何一处漏洞',
    '她{M}地比对了三组数据，才敢下最终结论',
    '为了不遗漏细节，她{M}地核对了每一个变量',
    '导师要求她{M}地呈现论证过程，容不得半点含糊'
  ],
  '自然': [
    '她{M}地记录着每一株植物的生长数据',
    '为了捕捉转瞬即逝的现象，她{M}地守在观测点',
    '她{M}地测量着每一项指标，生怕出现偏差',
    '团队成员{M}地分工协作，确保采样不留死角'
  ],
  '商业': [
    '{P}{M}地拆解着竞品的每一步打法',
    '她{M}地评估着每一个风险点，才决定all in',
    '面对投资人的连番追问，她{M}地一一回应',
    '她{M}地安排着资金流，确保每一个环节不断链'
  ],
  '社会': [
    '{P}{M}地倾听着每一位受访者的讲述',
    '她{M}地记录着田野调查中的每一个细节',
    '为了还原真相，她{M}地走访了事发的每个角落',
    '她{M}地梳理着政策脉络，试图找到问题的根源'
  ],
  '励志': [
    '即使疲惫到极点，{P}依然{M}地推进着每天的进度',
    '她{M}地把每一道错题吃透，绝不留到第二天',
    '凌晨的自习室里，她{M}地背着最后一组核心词',
    '她{M}地执行着那份近乎苛刻的计划，一天也没有中断'
  ],
  '生活': [
    '{P}{M}地整理着房间，连角落的灰尘都不放过',
    '她{M}地规划着每周的菜单，把生活过出了仪式感',
    '她{M}地处理着手头的事务，一切都井井有条'
  ],
  '通用': [
    '她{M}地消化着每一页内容，不让任何一个知识点溜走',
    '她{M}地走完了最后一段路，回头看时已是不一样的风景',
    '哪怕只剩最后五分钟，她依然{M}地检查着每一道题',
    '她{M}地梳理着知识脉络，逐渐看清了全貌'
  ]
};

const TPL_MAP: Record<Pos, Record<string, string[]>> = {
  n: TPL_NOUN,
  v: TPL_VERB,
  adj: TPL_ADJ,
  adv: TPL_ADV
};

const CONNECTORS = [
  '', '然而', '于是', '渐渐地', '直到有一天', '后来她意识到',
  '在无数个深夜之后', '终于', '与此同时', '她知道'
];

/* ---------- 工具函数 ---------- */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

export function normalizePos(pos: string): Pos {
  pos = (pos || '').toLowerCase().trim();
  if (!pos) return 'n';
  if (pos[0] === 'n') return 'n';
  if (pos[0] === 'v') return 'v';
  if (pos.indexOf('adj') >= 0) return 'adj';
  if (pos.indexOf('adv') >= 0) return 'adv';
  if (pos[0] === 'a') return 'adj';
  return 'n';
}

export function primaryMeaning(meaning: string): string {
  if (!meaning) return '';
  let m = meaning.split(/[;；,，]/)[0].trim();
  m = m.replace(/^[a-zA-Z.]+\s*/, '');
  return m;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- 语义校验已升级 ----------
 * 旧系统使用 BAD_COLLOCATIONS 黑名单（仅6条），无法覆盖所有不合理搭配。
 * 新系统使用 verb-templates.ts 中的 validateVerbSentence 白名单机制：
 *   每个微场定义了兼容上下文词，句子必须包含至少一个兼容词才通过。
 *   这从根源上杜绝了"迎合难点""断言细节"等所有类似问题。
 *
 * 旧的黑名单保留作为第二道安全网（defense in depth）。
 */
const BAD_COLLOCATIONS: { meaning: string; bad: string }[] = [
  { meaning: '迎合', bad: '难点' },
  { meaning: '迎合', bad: '困难' },
  { meaning: '迎合', bad: '细节' },
  { meaning: '迎合', bad: '参考书' },
  { meaning: '迎合', bad: '课本' },
  { meaning: '迎合', bad: '知识' },
  { meaning: '迎合', bad: '技术' },
  { meaning: '迎合', bad: '错题' },
  { meaning: '迎合', bad: '笔记' },
  { meaning: '迎合', bad: '数据' },
  { meaning: '迎合', bad: '实验' },
  { meaning: '迎合', bad: '理论' },
  { meaning: '迎合', bad: '考试' },
  { meaning: '迎合', bad: '复习' },
  { meaning: '断言', bad: '细节' },
  { meaning: '断言', bad: '参考书' },
  { meaning: '断言', bad: '错题' },
  { meaning: '断言', bad: '笔记' },
  { meaning: '断言', bad: '数据' },
  { meaning: '适应', bad: '难点' },
  { meaning: '适应', bad: '参考书' },
];

function validateSentenceBlacklist(cn: string, meaning: string): boolean {
  for (const bc of BAD_COLLOCATIONS) {
    if (meaning.includes(bc.meaning) && cn.includes(bc.bad)) {
      return false;
    }
  }
  return true;
}

/* ---------- 核心：为单个单词生成嵌词句子 ---------- */
export function genSentence(
  wordObj: { word?: string; w?: string; pos?: string; p?: string; meaning?: string; m?: string },
  theme: string,
  seed: number
): GeneratedSentence {
  const pos = normalizePos(wordObj.pos || wordObj.p || '');
  const meaningRaw = primaryMeaning(wordObj.meaning || wordObj.m || '');
  const t = THEMES[theme] || THEMES.kaoyan;
  const person = pick(t.persons, seed + 1);
  const loc = pick(t.scenes, seed + 3);

  // 形容词"的"尾缀处理
  let meaningFull = meaningRaw;
  if (pos === 'adj' && meaningFull.endsWith('的')) {
    meaningFull = meaningFull.slice(0, -1);
  }

  /* ---- 获取模板 ----
   * 动词：使用 verb-templates.ts 的精细微场系统（50个微场 + 中性兜底）
   * 名词/形容词/副词：使用原语义场系统（8个大场）
   */
  let tpls: string[];
  let field: string;

  if (pos === 'v') {
    // 动词走精细微场系统
    const vmf = detectVerbField(meaningRaw);
    field = vmf ? vmf.field : '中性兜底';
    tpls = getVerbTemplates(meaningRaw);
  } else {
    // 名词/形容词/副词走原语义场系统
    field = detectField(meaningRaw);
    tpls = (TPL_MAP[pos] && TPL_MAP[pos][field]) ||
           (TPL_MAP[pos] && TPL_MAP[pos]['通用']) ||
           TPL_NOUN[field] ||
           TPL_NOUN['通用'];
  }

  /* ---- 选择模板（白名单语义校验，遍历所有模板 + 通用兜底）----
   * 动词校验流程：
   *   1. 用 validateVerbSentence（白名单）校验：句子必须包含微场兼容词或通用学习词
   *   2. 用 validateSentenceBlacklist（黑名单）作为第二道安全网
   *   3. 如果校验失败，遍历所有模板重试
   *   4. 如果全部失败，使用 getUniversalFallback 生成保证正确的兜底句子
   */
  let tpl = pick(tpls, seed);
  let cn = tpl
    .replace(/\{P\}/g, person)
    .replace(/\{loc\}/g, loc)
    .replace(/\{M\}/g, meaningFull);

  if (pos === 'v') {
    let validated = validateVerbSentence(cn, meaningFull) && validateSentenceBlacklist(cn, meaningFull);

    if (!validated) {
      // 遍历所有模板寻找合格的（不再限制只重试3次）
      for (let retry = 1; retry < tpls.length && !validated; retry++) {
        tpl = pick(tpls, seed + retry * 17);
        cn = tpl
          .replace(/\{P\}/g, person)
          .replace(/\{loc\}/g, loc)
          .replace(/\{M\}/g, meaningFull);
        validated = validateVerbSentence(cn, meaningFull) && validateSentenceBlacklist(cn, meaningFull);
      }
    }

    // 如果所有模板都校验失败，使用通用兜底（保证语义正确）
    if (!validated) {
      cn = getUniversalFallback(meaningFull, person);
      field = '通用兜底';
    }
  }

  // 原位替换：中文释义 → 英文单词
  let sentence: string;
  const word = wordObj.word || wordObj.w || '';
  if (meaningFull && cn.indexOf(meaningFull) >= 0) {
    sentence = cn.replace(meaningFull, word);
  } else {
    sentence = cn + '——这正是「' + word + '」的真切含义';
  }

  return { sentence, word, meaning: meaningRaw, pos, field, person };
}

/* ---------- 段落生成 ---------- */
export function genParagraph(
  words: VocabWord[],
  theme: string,
  seed: number
): GeneratedParagraph {
  theme = theme || 'kaoyan';
  seed = seed || 0;
  const t = THEMES[theme] || THEMES.kaoyan;
  const arc = t.arc;
  const items: GeneratedSentence[] = [];
  const parts: { text: string; word: string; meaning: string; pos: Pos; field: string }[] = [];

  words.forEach((w, i) => {
    const s = genSentence(w, theme, seed + i * 7 + 3);
    const connector = i > 0 ? pick(CONNECTORS, seed + i * 11) + '，' : '';
    parts.push({
      text: connector + s.sentence,
      word: s.word,
      meaning: s.meaning,
      pos: s.pos,
      field: s.field
    });
    items.push(s);
  });

  const plain = parts.map(p => p.text).join('。') + '。';
  const html = parts.map(p => {
    let safe = escapeHtml(p.text);
    const idx = safe.indexOf(p.word);
    if (idx >= 0) {
      const before = safe.substring(0, idx);
      const after = safe.substring(idx + p.word.length);
      safe = before +
        '<span class="ctx-word" data-word="' + p.word +
        '" data-meaning="' + escapeHtml(p.meaning) +
        '" data-pos="' + p.pos + '">' + p.word + '</span>' + after;
    }
    return safe;
  }).join('。') + '。';

  const title = t.name + ' · ' + arc[Math.floor(seed % arc.length)];

  return { html, plain, items, theme: t.name, title };
}

/* ---------- 学习计划生成 ---------- */
export function genPlan(
  words: VocabWord[],
  days: number,
  perDay?: number,
  theme: string = 'kaoyan'
): DayPlan[] {
  days = Math.max(1, days || 10);
  if (!perDay) perDay = Math.ceil(words.length / days);
  const plan: DayPlan[] = [];

  for (let d = 0; d < days; d++) {
    const start = d * perDay;
    const end = Math.min(start + perDay, words.length);
    if (start >= words.length) break;
    const dayWords = words.slice(start, end);
    plan.push({
      day: d + 1,
      words: dayWords,
      paragraph: genParagraph(dayWords, theme, d * 13 + 7)
    });
  }

  return plan;
}

/* ---------- 导出主题列表 ---------- */
export function getThemes(): Record<string, NarrativeTheme> {
  return THEMES;
}

export function getThemeList(): { id: string; name: string }[] {
  return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name }));
}
