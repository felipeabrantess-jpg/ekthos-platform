import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog */}
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col animate-fade-in-up`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
          <h2 className="font-display text-lg font-semibold text-ekthos-black">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors rounded-lg p-1 hover:bg-gray-100"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
