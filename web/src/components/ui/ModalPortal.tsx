import { createPortal } from 'react-dom'
import { ReactNode } from 'react'

/**
 * ModalPortal — renders children directly in <body>.
 *
 * Required because `.page-content` runs a CSS animation with
 * `fill-mode: both`, which can leave a transform-based containing
 * block active on the element, breaking `position: fixed` descendants
 * (they position relative to the containing block instead of the
 * viewport).  Portaling to <body> escapes the entire ancestor chain.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
