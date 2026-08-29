import { useEffect, useRef } from 'react'

/**
 * Adds `is-visible` to the element once it scrolls into view. Children with
 * `.landing-reveal` transition in; `--i` on each child staggers them.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return

    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-visible')
            observer.disconnect()
          }
        }
      },
      { threshold: 0.05 },
    )
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return ref
}
