import AppKit

// Native rasterisation of the app's existing vector orbit mark.
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let size = points * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let transform = NSAffineTransform()
        transform.scale(by: CGFloat(size) / 64)
        transform.concat()
        NSColor(calibratedRed: 8/255, green: 6/255, blue: 16/255, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 2, y: 2, width: 60, height: 60), xRadius: 14, yRadius: 14).fill()
        let colors = [NSColor(calibratedRed: 16/255, green: 231/255, blue: 1, alpha: 1),
                      NSColor(calibratedRed: 1, green: 34/255, blue: 184/255, alpha: 1),
                      NSColor(calibratedRed: 177/255, green: 138/255, blue: 1, alpha: 1)]
        for i in 0..<3 {
            NSGraphicsContext.saveGraphicsState()
            let turn = NSAffineTransform()
            turn.translateX(by: 32, yBy: 32)
            turn.rotate(byDegrees: CGFloat(i * 60))
            turn.translateX(by: -32, yBy: -32)
            turn.concat()
            colors[i].setStroke()
            let ellipse = NSBezierPath(ovalIn: NSRect(x: 9, y: 24, width: 46, height: 16))
            ellipse.lineWidth = 2.5
            ellipse.stroke()
            NSGraphicsContext.restoreGraphicsState()
        }
        NSGraphicsContext.restoreGraphicsState()
        let suffix = scale == 2 ? "@2x" : ""
        let file = output.appendingPathComponent("icon_\(points)x\(points)\(suffix).png")
        try bitmap.representation(using: .png, properties: [:])!.write(to: file)
    }
}
