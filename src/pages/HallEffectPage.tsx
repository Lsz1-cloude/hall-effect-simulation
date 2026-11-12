import { useState } from 'react';
import PageMeta from '@/components/common/PageMeta';
import AudioToggle from '@/components/hall/AudioToggle';
import ControlPanel from '@/components/hall/ControlPanel';
import HallScene from '@/components/hall/HallScene';
import { DEFAULT_B, DEFAULT_I, type HallTelemetry } from '@/components/hall/constants';

/** 霍尔效应模拟实验 —— 主页面（左控制面板 / 右三维实验模型） */
export default function HallEffectPage() {
  const [currentI, setCurrentI] = useState(DEFAULT_I);
  const [magneticB, setMagneticB] = useState(DEFAULT_B);
  const [simEnabled, setSimEnabled] = useState(false);
  const [fieldReversed, setFieldReversed] = useState(false);
  const [tele, setTele] = useState<HallTelemetry>({ phase: 0, vH: 0, eh: 0, q: 0 });

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <PageMeta
        title="霍尔效应模拟实验"
        description="三维交互式霍尔效应物理仿真教学：调节电流与磁感应强度，观察电子洛伦兹力偏转、电荷积累与霍尔电场建立的动态全过程。"
      />
      <header className="shrink-0 border-b border-border bg-card/60">
        <div className="flex items-start justify-between gap-4 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <p className="tech-label text-xs text-muted-foreground">
              HALL EFFECT · 3D INTERACTIVE SIMULATION
            </p>
            <h1 className="mt-1 text-balance text-xl font-semibold md:text-2xl">
              霍尔效应模拟实验
            </h1>
          </div>
          <div className="shrink-0">
            <AudioToggle />
          </div>
        </div>
        <p className="max-w-prose px-4 pb-4 text-pretty text-sm leading-relaxed text-muted-foreground md:px-6">
          当导体中有电流通过，同时存在垂直磁场时，载流子受到洛伦兹力作用发生横向偏移，在导体两侧产生电势差。
          开启模拟后可观察电子偏转、电荷积累与霍尔电场建立直至稳态平衡的完整过程。
        </p>
      </header>
      <main className="flex flex-1 min-h-0 flex-col gap-4 p-4 md:flex-row md:items-stretch">
        <ControlPanel
          className="w-full md:w-[360px] md:shrink-0"
          I={currentI}
          B={magneticB}
          onIChange={setCurrentI}
          onBChange={setMagneticB}
          simEnabled={simEnabled}
          onSimToggle={setSimEnabled}
          fieldReversed={fieldReversed}
          onFieldReverse={setFieldReversed}
          phase={tele.phase}
          vH={tele.vH}
          eh={tele.eh}
          q={tele.q}
        />
        <div className="min-w-0 flex-1">
          <HallScene
            currentI={currentI}
            magneticB={magneticB}
            simEnabled={simEnabled}
            fieldReversed={fieldReversed}
            onTelemetry={setTele}
          />
        </div>
      </main>
    </div>
  );
}
