// KEEP IN SYNC with app/targets/live/MurmurActivityAttributes.swift.
// ActivityKit matches the app and the widget extension by this type's name and
// Codable shape, so both copies must stay identical.
import ActivityKit
import Foundation

struct MurmurActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    // "recording" | "recordingPaused" | "playing" | "playbackPaused"
    var mode: String
    var title: String
    var subtitle: String
    // Epoch seconds at which the clock reads 0 (start minus time already elapsed),
    // so the widget can tick on its own without updates from the app.
    var anchor: Double
    // Seconds shown while paused.
    var elapsed: Double
    // Playback length in seconds (0 while recording).
    var duration: Double
  }

  // "record" | "play"
  var kind: String
}
