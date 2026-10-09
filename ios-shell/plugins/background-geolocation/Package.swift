// swift-tools-version: 5.9
import PackageDescription

// Vendored from @capacitor-community/background-geolocation 1.2.26 (MIT).
// Only change: the Capacitor dependency now follows Capacitor 8 (the
// published package pins Capacitor 7, which cannot resolve alongside it).
let package = Package(
    name: "CapacitorCommunityBackgroundGeolocation",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorCommunityBackgroundGeolocation",
            targets: ["BackgroundGeolocationPlugin"]
        )
    ],
    dependencies: [
        .package(
            url: "https://github.com/ionic-team/capacitor-swift-pm.git",
            from: "8.0.0"
        )
    ],
    targets: [
        .target(
            name: "BackgroundGeolocationPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Plugin/Swift"
        )
    ]
)
