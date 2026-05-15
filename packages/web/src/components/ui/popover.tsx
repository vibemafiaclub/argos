'use client'

import * as React from 'react'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { cn } from '@/lib/utils'

// Re-export primitive parts as-is
const PopoverRoot = BasePopover.Root
const PopoverTrigger = BasePopover.Trigger
const PopoverPortal = BasePopover.Portal
const PopoverPositioner = BasePopover.Positioner
const PopoverClose = BasePopover.Close
const PopoverTitle = BasePopover.Title
const PopoverDescription = BasePopover.Description
const PopoverArrow = BasePopover.Arrow

// Styled Popup wrapper — consistent with info-tooltip.tsx tone
const PopoverPopup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Popup>
>(({ className, ...props }, ref) => (
  <BasePopover.Popup
    ref={ref}
    className={cn(
      'rounded-md bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-md px-3 py-2 text-xs',
      'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
      className,
    )}
    {...props}
  />
))
PopoverPopup.displayName = 'PopoverPopup'

export {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverPositioner,
  PopoverPopup,
  PopoverClose,
  PopoverTitle,
  PopoverDescription,
  PopoverArrow,
}

// Namespace-style export for ergonomic usage: <Popover.Root>, <Popover.Trigger>, etc.
export const Popover = {
  Root: PopoverRoot,
  Trigger: PopoverTrigger,
  Portal: PopoverPortal,
  Positioner: PopoverPositioner,
  Popup: PopoverPopup,
  Close: PopoverClose,
  Title: PopoverTitle,
  Description: PopoverDescription,
  Arrow: PopoverArrow,
}
