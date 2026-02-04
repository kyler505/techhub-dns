import * as React from "react"

import { cn } from "../../lib/utils"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, id, label, disabled, ...props }, ref) => {
    const autoId = React.useId()
    const inputId = id ?? autoId

    const input = (
      <input
        id={inputId}
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className={cn(
          "peer relative h-4 w-4 shrink-0 appearance-none rounded-sm border border-input bg-background shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "checked:border-primary checked:bg-primary",
          "before:absolute before:left-1/2 before:top-1/2 before:h-2 before:w-1 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:border-b-2 before:border-r-2 before:border-primary-foreground before:opacity-0 before:content-['']",
          "checked:before:opacity-100",
          className
        )}
        {...props}
      />
    )

    if (label == null) return input

    return (
      <div className="flex items-center gap-2">
        {input}
        <label
          htmlFor={inputId}
          className={cn(
            "select-none text-sm text-foreground",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {label}
        </label>
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
