import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_B,
  DEFAULT_I,
  fieldLevel,
  hallVoltage,
  type HallPhase,
} from './constants';

const PHASE_STEPS = ['初始直线运动', '阶段一 · 洛伦兹力偏转', '阶段二 · 电荷分离积累', '阶段三 · 霍尔稳态平衡'];

interface ControlPanelProps {
  I: number;
  B: number;
  onIChange: (v: number) => void;
  onBChange: (v: number) => void;
  simEnabled: boolean;
  onSimToggle: (v: boolean) => void;
  fieldReversed: boolean;
  onFieldReverse: (v: boolean) => void;
  phase: HallPhase;
  vH: number;
  eh: number;
  q: number;
  className?: string;
}

/** 左侧控制面板：实验开关 + I/B 滑块 + 演化阶段指示 + 实时读数（工程蓝图风格） */
export default function ControlPanel({
  I,
  B,
  onIChange,
  onBChange,
  simEnabled,
  onSimToggle,
  fieldReversed,
  onFieldReverse,
  phase,
  vH,
  eh,
  q,
  className = '',
}: ControlPanelProps) {
  const vHFull = hallVoltage(I, B);

  return (
    <aside className={`flex min-w-0 flex-col gap-4 ${className}`}>
      <section className="bp-card animate-fade-in p-4">
        <h2 className="tech-label text-xs text-muted-foreground">EXPERIMENT / 实验控制</h2>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">开始霍尔效应模拟</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {simEnabled ? '演化中 · 参数已锁定' : '电子直线运动 · 可调节参数'}
              </p>
            </div>
            <Switch checked={simEnabled} onCheckedChange={onSimToggle} aria-label="开始霍尔效应模拟" />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-dashed border-border pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">磁场反转</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fieldReversed ? 'N极在下 · B 向上' : 'N极在上 · B 向下'}
              </p>
            </div>
            <Switch checked={fieldReversed} onCheckedChange={onFieldReverse} aria-label="磁场反转" />
          </div>
        </div>
      </section>

      <section className="bp-card p-4">
        <h2 className="tech-label text-xs text-muted-foreground">CONTROL / 参数控制</h2>
        <div className="mt-4 space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">磁场强度 BB</span>
              <span className="font-mono text-sm text-info">{B.toFixed(1)} T</span>
            </div>
            <Slider
              className="mt-3"
              value={[B]}
              min={0}
              max={10}
              step={0.1}
              disabled={simEnabled}
              aria-label="磁感应强度 BB"
              onValueChange={(v) => onBChange(v[0] ?? B)}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">工作电流 II</span>
              <span className="font-mono text-sm text-warning">{I.toFixed(1)} A</span>
            </div>
            <Slider
              className="mt-3"
              value={[I]}
              min={0}
              max={10}
              step={0.1}
              disabled={simEnabled}
              aria-label="工作电流 II"
              onValueChange={(v) => onIChange(v[0] ?? I)}
            />
          </div>
        </div>
      </section>

      <section className="bp-card p-4">
        <h2 className="tech-label text-xs text-muted-foreground">PROCESS / 演化阶段</h2>
        <ol className="mt-3 space-y-1.5">
          {PHASE_STEPS.map((label, i) => {
            const active = phase === i;
            const done = phase > i;
            return (
              <li
                key={label}
                className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs ${
                  active
                    ? 'bg-accent/15 font-medium text-accent'
                    : done
                      ? 'text-foreground/80'
                      : 'text-muted-foreground/60'
                }`}
              >
                <span className="font-mono">{`0${i}`}</span>
                <span className="truncate">{label}</span>
                {active && <span className="ml-auto inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="bp-card p-4">
        <h2 className="tech-label text-xs text-muted-foreground">DATA / 实时读数</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">电流 I</dt>
            <dd className="font-mono">{I.toFixed(1)} A</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">当前 BB</dt>
            <dd className="font-mono">{B.toFixed(1)} T</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">当前磁场</dt>
            <dd className="font-mono">
              {fieldReversed ? 'S极 → N极 · 垂直向上' : 'N极 → S极 · 垂直向下'} · {fieldLevel(B)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">
              霍尔电场 E<sub>H</sub>
            </dt>
            <dd className="font-mono">{eh.toFixed(2)} V/m</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">表面积累电荷 Q</dt>
            <dd className="font-mono">{q.toFixed(1)} μC</dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-dashed border-border pt-4">
          <p className="text-xs text-muted-foreground">
            霍尔电压 V<sub>H</sub>
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-accent md:text-3xl">
            {vH.toFixed(2)} V
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            稳态理论值 k·I·B = {vHFull.toFixed(2)} V
          </p>
        </div>
      </section>

      <section className="bp-card p-4">
        <h2 className="tech-label text-xs text-muted-foreground">FORMULA / 物理公式</h2>
        <ul className="mt-3 space-y-2 font-mono text-sm">
          <li>
            V<sub>H</sub> = k · I · B <span className="text-muted-foreground">(k = 0.18)</span>
          </li>
          <li>
            F = q (v × B) <span className="text-muted-foreground">(q = −e)</span>
          </li>
          <li>E_H = V_H / d (d = 2)</li>
          <li>稳态：qE_H = q(v × B)</li>
        </ul>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          disabled={simEnabled}
          onClick={() => {
            onIChange(DEFAULT_I);
            onBChange(DEFAULT_B);
          }}
        >
          <RotateCcw className="size-4" />
          重置参数
        </Button>
        <p className="text-xs text-muted-foreground">
          {simEnabled ? '模拟运行中' : '拖动滑块实时更新'}
        </p>
      </div>
    </aside>
  );
}
