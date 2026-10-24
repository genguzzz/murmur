// Widget extension that renders Murmur's Live Activity (Dynamic Island + Lock Screen)
// while recording or playing a memo. No entitlements: data arrives through
// ActivityKit only, so the IPA still re-signs with any profile.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "MurmurLiveWidget",
  displayName: "Murmur",
  bundleIdentifier: ".live",
  deploymentTarget: "16.4",
  frameworks: ["SwiftUI", "WidgetKit", "ActivityKit"],
  colors: {
    $accent: { color: "#D2915A", darkColor: "#E4A35A" },
  },
  images: {
    mascot: "../../assets/icon.png",
  },
};
