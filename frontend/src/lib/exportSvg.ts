/**
 * exportSvg — serialize an inline SVG element to PNG and trigger browser download.
 *
 * Steps:
 *   1. Serialize the SVG via XMLSerializer
 *   2. Create a Blob URL from the SVG string
 *   3. Draw onto a canvas via HTMLImageElement
 *   4. Export canvas to PNG Blob → create object URL → anchor click
 */

export async function exportSvgToPng(
  svgEl: SVGSVGElement,
  filename: string,
): Promise<void> {
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgEl)
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  const img = new Image()
  img.width = svgEl.width.baseVal.value || 600
  img.height = svgEl.height.baseVal.value || 300

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = svgUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(svgUrl)

  canvas.toBlob((blob) => {
    if (!blob) return
    const pngUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(pngUrl)
  }, 'image/png')
}
