// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "DailyBrief",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "JarvisCore", targets: ["JarvisCore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0"),
    ],
    targets: [
        .target(
            name: "JarvisCore",
            path: "Sources/JarvisCore"
        ),
        .executableTarget(
            name: "DailyBrief",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                "JarvisCore",
            ],
            linkerSettings: [
                .linkedFramework("EventKit"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("CoreText"),
            ]
        ),
        .executableTarget(
            name: "DailyBriefMonitor",
            dependencies: [
                "JarvisCore",
            ],
            linkerSettings: [
                .linkedFramework("SwiftUI"),
                .linkedFramework("AppKit"),
            ]
        ),
    ]
)
