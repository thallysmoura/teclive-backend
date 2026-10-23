export function detectDevice(userAgent: string | undefined): 'mobile' | 'desktop' {
  if (!userAgent) return 'desktop';
  return /Mobi|Android|iPhone|iPad/i.test(userAgent) ? 'mobile' : 'desktop';
}
