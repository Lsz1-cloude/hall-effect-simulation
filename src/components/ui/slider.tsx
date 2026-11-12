import * as React from "react"

import { cn } from "@/lib/utils"

interface SliderProps {
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  "aria-label"?: string
  onValueChange?: (value: number[]) => void
}

/**
 * 滑块控件。
 * 使用原生 <input type="range"> 实现，保持与旧版 shadcn Slider 相同的 props 契约
 * （value: number[] / onValueChange: (number[]) => void）。
 *
 * 之所以弃用 @radix-ui/react-slider：其传递依赖 @radix-ui/react-collection 的产物中
 * 含 ES2022 的 static{} 初始化块与 #private 字段，旧版 WebKit（iPhone Safari < 16）
 * 在模块解析阶段即抛 SyntaxError，导致整个模块图加载失败、React 未挂载、整页空白。
 * 原生 range 输入在所有浏览器（含旧版 WebKit）均可用，且不引入任何新语法。
 */
const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      value,
      defaultValue,
      min = 0,
      max = 100,
      step = 1,
      disabled,
      className,
      onValueChange,
      ...props
    },
    ref
  ) => {
    const current = value?.[0] ?? defaultValue?.[0] ?? min
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={current}
        onChange={(e) => onValueChange?.([Number(e.target.value)])}
        className={cn(
          "h-5 w-full touch-none select-none appearance-none rounded-full bg-primary/20 accent-primary",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
