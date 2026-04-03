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
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.0.0"),
    ],
    targets: [
        .target(
            name: "JarvisCore",
            dependencies: [
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            path: "Sources/JarvisCore",
            linkerSettings: [
                .linkedFramework("CloudKit"),
            ]
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
