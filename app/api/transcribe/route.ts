/* ============================================================
 *  语音识别接口  route.ts
 *  基于硅基流动 SenseVoiceSmall 模型，将语音转为文字
 * ============================================================ */

import { NextRequest, NextResponse } from 'next/server';

const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/audio/transcriptions';

export async function POST(request: NextRequest) {
  if (!process.env.SILICONFLOW_API_KEY) {
    return NextResponse.json(
      { success: false, error: '语音识别服务未配置' },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const audioFile = formData.get('audio') as File | null;

  if (!audioFile) {
    return NextResponse.json(
      { success: false, error: '未提供音频文件' },
      { status: 400 }
    );
  }

  try {
    const uploadFormData = new FormData();
    uploadFormData.append('file', audioFile, audioFile.name || 'audio.webm');
    uploadFormData.append('model', 'FunAudioLLM/SenseVoiceSmall');

    const response = await fetch(SILICONFLOW_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
      },
      body: uploadFormData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[transcribe] 硅基流动 API 错误:', response.status, errText);
      return NextResponse.json(
        { success: false, error: '语音识别失败', detail: errText },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text = data?.text ?? '';

    if (!text) {
      return NextResponse.json(
        { success: false, error: '语音识别结果为空' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      text: text.trim(),
    });
  } catch (error) {
    console.error('[transcribe] 调用硅基流动 API 异常:', error);
    return NextResponse.json(
      { success: false, error: '语音识别失败' },
      { status: 500 }
    );
  }
}
