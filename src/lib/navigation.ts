type NavigateFn = (path: string) => void

let navigateRef: NavigateFn | null = null

export function setNavigateRef(fn: NavigateFn) {
  navigateRef = fn
}

export function navigateTo(path: string) {
  navigateRef?.(path)
}
