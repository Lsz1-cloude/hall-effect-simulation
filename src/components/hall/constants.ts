// 霍尔效应模拟实验 —— 物理常量与几何参数（唯一数据源）
export const K_HALL = 0.18; // 霍尔系数 k
export const OFFSET_MAX = 0.8; // 电荷球最大 z 向偏移
export const SLIDER_MAX = 10; // 滑块量程
export const Z0 = 0.225; // 导体中心 / 电荷球初始 z（两磁铁间隙中点）

export const MAGNET_SIZE: [number, number, number] = [6, 4, 0.15]; // 长 宽 高
export const MAGNET_N_Z = 1.225; // 上方 N 极中心 z
export const MAGNET_S_Z = -0.775; // 下方 S 极中心 z
export const CONDUCTOR_SIZE: [number, number, number] = [4, 2, 1.333]; // 长 宽 厚（厚 = 宽 × 2/3）

export const DEFAULT_I = 5;
export const DEFAULT_B = 5;

/** 霍尔电压 V_H = k · I · B（最大 18 V） */
export const hallVoltage = (i: number, b: number) => K_HALL * i * b;

/** 电荷球 y 向偏移（方向为 +y）：Δy = 0.8 · (I/10) · (B/10)，最大 0.8，始终留在导体宽度（±1）内 */
export const chargeOffset = (i: number, b: number) =>
  OFFSET_MAX * (i / SLIDER_MAX) * (b / SLIDER_MAX);

/** 霍尔效应动态演化阶段：0 未开启 / 1 洛伦兹偏转 / 2 电荷积累 / 3 稳态平衡 */
export type HallPhase = 0 | 1 | 2 | 3;

/** 场景上报的实时物理量 */
export interface HallTelemetry {
  phase: HallPhase;
  /** 当前霍尔电压（随稳态比例增长，稳态 = 0.18·I·B） */
  vH: number;
  /** 霍尔电场强度 E_H = V_H / d（d = 2 m） */
  eh: number;
  /** 表面积累电荷量（μC，随积累比例增长） */
  q: number;
}

/** 磁场强度档位描述 */
export const fieldLevel = (b: number) =>
  b <= 0.05 ? '无磁场' : b < 3.34 ? '弱' : b < 6.67 ? '中' : '强';

/** 背景音乐 Storage URL（已上传至 Supabase 公共桶 bgm；null 时播放控件安全隐藏） */
export const BGM_URL: string | null =
  'https://backend.miaoda.online/projects/supabase367533051938390016/storage/v1/object/public/bgm/bgm-hall-effect.mp3';
