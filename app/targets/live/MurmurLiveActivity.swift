import ActivityKit
import SwiftUI
import WidgetKit

@main
struct MurmurLiveBundle: WidgetBundle {
  var body: some Widget {
    MurmurLiveActivity()
  }
}

// Murmur's palette on the always-dark island / lock screen banner.
private let amber = Color(red: 0.894, green: 0.639, blue: 0.353) // #E4A35A
private let coral = Color(red: 0.937, green: 0.408, blue: 0.369) // recording
private let ink = Color(red: 0.114, green: 0.098, blue: 0.086) // #1D1916

private typealias State = MurmurActivityAttributes.ContentState

private extension MurmurActivityAttributes.ContentState {
  var isRecording: Bool { mode.hasPrefix("recording") }
  var isPaused: Bool { mode.hasSuffix("Paused") }
  var start: Date { Date(timeIntervalSince1970: anchor) }
  var end: Date { Date(timeIntervalSince1970: anchor + max(duration, 1)) }
  var tint: Color { isRecording ? coral : amber }
  var symbol: String {
    if isPaused { return "pause.fill" }
    return isRecording ? "mic.fill" : "waveform"
  }
}

private func clock(_ seconds: Double) -> String {
  let t = Int(max(0, seconds.rounded(.down)))
  return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, t / 60 % 60, t % 60) : String(format: "%d:%02d", t / 60, t % 60)
}

// Recording counts up, playback counts down to the end; paused shows a fixed time.
// Text(timerInterval:) ticks inside the widget, so the app doesn't push every second.
private struct Clock: View {
  let state: State
  var body: some View {
    if state.isPaused {
      Text(clock(state.isRecording ? state.elapsed : state.duration - state.elapsed))
    } else if state.isRecording {
      Text(timerInterval: state.start...Date.distantFuture, countsDown: false)
    } else {
      Text(timerInterval: state.start...state.end, countsDown: true)
    }
  }
}

private struct Progress: View {
  let state: State
  var body: some View {
    Group {
      if state.isPaused {
        ProgressView(value: min(state.elapsed, state.duration), total: max(state.duration, 1))
      } else {
        ProgressView(timerInterval: state.start...state.end, countsDown: false) {
          EmptyView()
        } currentValueLabel: {
          EmptyView()
        }
      }
    }
    .progressViewStyle(.linear)
    .tint(state.tint)
  }
}

// A still waveform: Live Activities can't animate freely, so paused just dims it.
private struct Bars: View {
  let state: State
  private let heights: [CGFloat] = [6, 12, 18, 10, 22, 14, 8, 16, 24, 12, 7, 18, 11, 20, 9, 15, 6]
  var body: some View {
    HStack(alignment: .center, spacing: 3) {
      ForEach(heights.indices, id: \.self) { i in
        Capsule().fill(state.tint.opacity(state.isPaused ? 0.35 : (i % 3 == 0 ? 1 : 0.7))).frame(width: 3, height: heights[i])
      }
    }
    .frame(height: 24)
  }
}

private struct Badge: View {
  let state: State
  var size: CGFloat = 44
  var body: some View {
    ZStack {
      Circle().fill(state.tint.opacity(0.18))
      Image(systemName: state.symbol).font(.system(size: size * 0.42, weight: .semibold)).foregroundStyle(state.tint)
    }
    .frame(width: size, height: size)
  }
}

private struct Banner: View {
  let state: State
  var body: some View {
    HStack(spacing: 12) {
      Badge(state: state)
      VStack(alignment: .leading, spacing: 3) {
        Text(state.title).font(.headline).foregroundStyle(.white).lineLimit(1)
        if !state.subtitle.isEmpty {
          Text(state.subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
        }
        if !state.isRecording {
          Progress(state: state).padding(.top, 4)
        }
      }
      Spacer(minLength: 8)
      Clock(state: state)
        .font(.system(size: 28, weight: .semibold, design: .rounded))
        .monospacedDigit()
        .foregroundStyle(state.tint)
        .multilineTextAlignment(.trailing)
        .frame(maxWidth: 110, alignment: .trailing)
    }
    .padding(16)
  }
}

struct MurmurLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MurmurActivityAttributes.self) { context in
      Banner(state: context.state)
        .activityBackgroundTint(ink)
        .activitySystemActionForegroundColor(amber)
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image("mascot")
            .resizable()
            .scaledToFill()
            .frame(width: 40, height: 40)
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .padding(.leading, 6)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Clock(state: state)
            .font(.system(size: 24, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(state.tint)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 96, alignment: .trailing)
            .padding(.trailing, 6)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text(state.title).font(.headline).foregroundStyle(.white).lineLimit(1)
            if !state.subtitle.isEmpty {
              Text(state.subtitle).font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
            }
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          Group {
            if state.isRecording {
              Bars(state: state)
            } else {
              Progress(state: state)
            }
          }
          .padding(.horizontal, 8)
          .padding(.top, 4)
        }
      } compactLeading: {
        HStack(spacing: 4) {
          if state.isRecording && !state.isPaused {
            Circle().fill(coral).frame(width: 7, height: 7)
          }
          Image(systemName: state.symbol).foregroundStyle(state.tint)
        }
        .padding(.leading, 2)
      } compactTrailing: {
        Clock(state: state)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(state.tint)
          .multilineTextAlignment(.trailing)
          .frame(width: 46, alignment: .trailing)
      } minimal: {
        Image(systemName: state.symbol).foregroundStyle(state.tint)
      }
      .keylineTint(state.tint)
    }
  }
}
