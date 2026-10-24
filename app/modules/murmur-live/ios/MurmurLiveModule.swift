import ActivityKit
import ExpoModulesCore

struct LiveStateRecord: Record {
  @Field var mode: String = "recording"
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var anchor: Double = 0
  @Field var elapsed: Double = 0
  @Field var duration: Double = 0

  var state: MurmurActivityAttributes.ContentState {
    .init(mode: mode, title: title, subtitle: subtitle, anchor: anchor, elapsed: elapsed, duration: duration)
  }
}

public class MurmurLiveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MurmurLive")

    // False when the user turned Live Activities off for the app (or the device has none).
    Function("isSupported") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    AsyncFunction("start") { (kind: String, record: LiveStateRecord) async throws -> String in
      // One activity per kind: a new recording replaces a stale one.
      for activity in Activity<MurmurActivityAttributes>.activities where activity.attributes.kind == kind {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      let activity = try Activity.request(
        attributes: MurmurActivityAttributes(kind: kind),
        content: ActivityContent(state: record.state, staleDate: nil),
        pushType: nil
      )
      return activity.id
    }

    AsyncFunction("update") { (id: String, record: LiveStateRecord) async in
      guard let activity = Activity<MurmurActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
      await activity.update(ActivityContent(state: record.state, staleDate: nil))
    }

    AsyncFunction("end") { (id: String, record: LiveStateRecord?, immediate: Bool) async in
      guard let activity = Activity<MurmurActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
      let content = record.map { ActivityContent(state: $0.state, staleDate: nil) }
      await activity.end(content, dismissalPolicy: immediate ? .immediate : .after(Date().addingTimeInterval(8)))
    }

    // Cleans up activities left behind by a crash or a killed app.
    AsyncFunction("endAll") { () async in
      for activity in Activity<MurmurActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
