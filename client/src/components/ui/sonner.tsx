import { Toaster as Sonner, type ToasterProps } from "sonner"
import { Check, Info, AlertTriangle, X, Loader2 } from "lucide-react"

/**
 * Techy-themed Sonner Toaster.
 *
 * Visual contract — matches the box/StatBox aesthetic elsewhere in the app:
 *   • bg-panel background, 1px border-strong, 4px (radius) corners, no shadow
 *   • mono font (JetBrains Mono)
 *   • thin accent top bar via ::before, color-coded by toast type
 *     (success=emerald, error=rose, warning=amber, info=sky, loading=violet)
 *
 * The actual styling lives in client/src/index.css under the `.bv-toast*`
 * selectors — Sonner exposes a `classNames` prop on each part which we name
 * explicitly here so we don't depend on its internal class names.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      icons={{
        success: <Check className="size-4" />,
        info: <Info className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        error: <X className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "bv-toast",
          title: "bv-toast-title",
          description: "bv-toast-description",
          icon: "bv-toast-icon",
          actionButton: "bv-toast-action",
          cancelButton: "bv-toast-cancel",
          closeButton: "bv-toast-close",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
