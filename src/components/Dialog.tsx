import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'

export const OperationError = createContext('')

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  busy = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const error = useContext(OperationError)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    dialog
      .querySelector<HTMLElement>(
        'input:not([type="checkbox"]):not([type="file"]), textarea',
      )
      ?.focus()
    return () => {
      dialog.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog wide' : 'dialog'}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X size={21} />
        </button>
      </header>
      <div className="dialog-body">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {children}
      </div>
    </dialog>
  )
}
