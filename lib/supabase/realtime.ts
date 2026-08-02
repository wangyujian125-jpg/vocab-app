/* ============================================================
 *  Supabase Realtime 同步 Hook
 *  当用户已登录且 Supabase 已配置时，订阅表变更实现跨设备同步
 *  未登录时不做任何操作，回退到 localStorage
 * ============================================================ */

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasEnvVars } from '@/lib/utils';

type ChangeHandler = () => void;

interface RealtimeOptions {
  onCustomWordsChange?: ChangeHandler;
  onWrongWordsChange?: ChangeHandler;
  onPlanChange?: ChangeHandler;
  onProgressChange?: ChangeHandler;
  enabled?: boolean;
}

/**
 * 订阅 Supabase 表变更的 Hook
 * @param options 各表的变更回调及是否启用
 */
export function useSupabaseRealtime(options: RealtimeOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // 未配置 Supabase 或未启用时不订阅
    if (!hasEnvVars) return;
    if (optionsRef.current.enabled === false) return;

    const supabase = createClient();
    const channels: ReturnType<typeof supabase.channel>[] = [];

    // 检查用户是否已登录
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted || !data.session) return;

      // 订阅 custom_words 表
      if (optionsRef.current.onCustomWordsChange) {
        const ch = supabase
          .channel('custom-words-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'custom_words' },
            () => optionsRef.current.onCustomWordsChange?.()
          )
          .subscribe();
        channels.push(ch);
      }

      // 订阅 wrong_words 表
      if (optionsRef.current.onWrongWordsChange) {
        const ch = supabase
          .channel('wrong-words-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'wrong_words' },
            () => optionsRef.current.onWrongWordsChange?.()
          )
          .subscribe();
        channels.push(ch);
      }

      // 订阅 plans 表
      if (optionsRef.current.onPlanChange) {
        const ch = supabase
          .channel('plans-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'plans' },
            () => optionsRef.current.onPlanChange?.()
          )
          .subscribe();
        channels.push(ch);
      }

      // 订阅 progress 表
      if (optionsRef.current.onProgressChange) {
        const ch = supabase
          .channel('progress-changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'progress' },
            () => optionsRef.current.onProgressChange?.()
          )
          .subscribe();
        channels.push(ch);
      }
    });

    // 清理函数：取消所有订阅
    return () => {
      mounted = false;
      channels.forEach(ch => {
        try {
          supabase.removeChannel(ch);
        } catch {
          /* ignore */
        }
      });
    };
  }, [options.enabled]);
}

/**
 * 从 Supabase 加载全部用户数据（登录后调用）
 * 返回 null 表示加载失败或未登录
 */
export async function loadFromSupabase() {
  if (!hasEnvVars) return null;

  try {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return null;

    // 并行加载所有表数据
    const [customRes, wrongRes, planRes] = await Promise.all([
      supabase.from('custom_words').select('*').order('created_at', { ascending: true }),
      supabase.from('wrong_words').select('*').order('added_at', { ascending: false }),
      supabase.from('plans').select('*').order('created_at', { ascending: false }).limit(1),
    ]);

    const customWords = (customRes.data || []).map((r: Record<string, unknown>) => ({
      w: r.word as string,
      p: r.pos as string,
      m: r.meaning as string,
      ph: (r.phonetic as string) || '',
    }));

    const wrongWords = (wrongRes.data || []).map((r: Record<string, unknown>) => ({
      w: r.word as string,
      p: r.pos as string,
      m: r.meaning as string,
      ph: (r.phonetic as string) || '',
    }));

    let plan = null;
    if (planRes.data && planRes.data.length > 0) {
      const row = planRes.data[0];
      plan = {
        bankId: row.bank_id,
        bankName: row.bank_name,
        totalWords: row.total_words,
        days: Array.isArray(row.plan_data) ? row.plan_data : [],
        theme: row.theme,
        created: new Date(row.created_at).getTime(),
      };
    }

    return { customWords, wrongWords, plan, currentDay: planRes.data?.[0]?.current_day || 1 };
  } catch {
    return null;
  }
}
