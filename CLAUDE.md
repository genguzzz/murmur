# Murmur — working rules

Personal voice journal + to-do assistant. `app/` is Expo (SDK 58, RN 0.88, Expo Router); `server/` is Node 22 + Fastify run with type stripping; `.github/workflows/ios.yml` builds an unsigned IPA that the user signs on the phone. README.md covers setup; this file is the rules and the traps.

## Ship it

- Commit straight to `main`; no branches/PRs. Never commit secrets: API keys and tokens live only in the server's `/opt/voicememo/.env`.
- Before every commit: `cd app && npx tsc --noEmit && npx eslint src`, and `cd server && npx tsc --noEmit -p .` (typecheck locally; the server host only has prod deps).
- Server change → `server/deploy/deploy.sh`, then hit the new route with curl (token: `ssh greencloud grep ^APP_TOKEN= /opt/voicememo/.env`).
- JS-only app change → `scripts/ota.sh "说明"` (~1 min). Pushing `main` only builds; it doesn't publish.
- Native change (new/upgraded native package, config plugin, permission, SDK) → bump `RUNTIME_VERSION` in `app/app.config.ts` with a note, then `scripts/release.sh X.Y.Z "新增：…；修复：…"`. The tag build publishes the IPA to the software source; OTA can't reach older runtimes.
- Order when both change: deploy server first (old apps must keep working), then OTA/release.

## App conventions

- Navigation: four tabs in `src/app/(tabs)/` (首页 · 待办 · 记录 · 对话) on the system tab bar (`NativeTabs`, Liquid Glass on iOS 26+, minimises on scroll). Capture actions (录一段 · 记待办 · 写一段) live in its bottom accessory (`components/CaptureAccessory`); `tabPress` can't be prevented, so never fake a button with a tab. Everything else opens from the left drawer (`components/Drawer.tsx`) or is a stack screen with `TopBar`. New top-level features go in the drawer unless they're daily-use.
- Tab screens start with `TabHeader` and pad the bottom by `TAB_BAR_SPACE`.
- Theme: `colors` is a mutable palette swapped by `applyScheme`; read `colors.x` during render (or use `styles` getters / `shadow()`), never capture it at module scope or in `StyleSheet.create`.
- UI copy is Simplified Chinese, short and warm; the mascot speaks in `SpeechBubble`s. Every tap gets haptics (`tap()`, `PillButton` does it); confirmations use `toast()` — pass an action for undo.
- State lives in one JSON file via `lib/store.ts` (`setState` → debounced atomic save). Add fields with defaults in `DEFAULT_STATE`; `loadState` merges, so old files keep working.
- Memo playback is `components/WaveformPlayer` (tap/drag the waveform to seek, speed pill, Live Activity + lock screen). Waveforms come from recorder metering saved on the entry; older memos learn theirs from `useAudioSampleListener` on first full play.
- Logging: `logger("area")`; log ids, counts, timings, errors — never journal text or transcripts. Users debug via Settings → 上传日志; read it on the server at `/opt/voicememo/data/logs/<id>.log`.
- Gestures inside scrollable or swipe-back screens use react-native-gesture-handler (`usePanGesture`/`useTapGesture` + `GestureDetector`, with the screen's `ScrollView` imported from gesture-handler), not `PanResponder`: JS responders are invisible to UIKit, so the page scrolls or swipes back during the drag. Don't patch it by toggling `gestureEnabled`.
- Time: everything date-related runs in the app time zone (`lib/zone.ts`; Settings → 时区, default follows the phone, can pin e.g. Asia/Shanghai). Use `nowWall()`/`wall(iso)`/`today()` for logic and display, `instantOf(wall)` when handing a time to iOS (notification triggers, Calendar). Never `new Date()` for "what day/hour is it". `dayKey(iso)` converts; `dayKey(date)` assumes a wall date.
- React compiler lint is on: no reading refs during render, no `Date.now()`/`new Date()` in render (keep `now` in state), no `setState` straight inside effects.

## Native capabilities (runtime 4)

- The binary already ships camera, photo picker/library, image compression, location + geofences, Calendar/Reminders, contacts, document picker, TTS + live speech recognition, background refresh, SQLite/KV, network, localization, keep-awake, in-app browser, quick actions, SF Symbols, glass effect, reanimated + gesture-handler. Features built on these ship by OTA.
- Feature code calls `src/lib/device` (never `expo-*` directly): wrappers ask permission through `ensureAccess`/`needAccess` (in-app explainer → system prompt → Settings when denied), return `null` on cancel, throw `DeviceError` (`denied`/`unavailable`/`failed`), and log + track every call.
- Check `has(capability)` before using a module added after runtime 4. Adding any native module or permission string still means: bump `RUNTIME_VERSION`, `release.sh`.
- Copy picked/taken files into app storage with `keepMedia` (sync copy) before relying on them.
- Headless code (geofence/background tasks) reads `kv` (SQLite), not the journal store; tasks are defined at module load in `lib/device/*`.
- Settings → 调试 → 能力自检 exercises every wrapper on the device.
- Live Activity (Dynamic Island) while recording/playing: SwiftUI layout in `app/targets/live` (widget extension via `@bacons/apple-targets`), bridge in `app/modules/murmur-live`, JS in `lib/device/live.ts`. State goes through ActivityKit only — no App Group, no entitlements, so 全能签 re-signing keeps working (that's why not `expo-widgets`, which stores layouts in an App Group). `MurmurActivityAttributes.swift` exists in both places and must stay identical. Never give a target (`targets/*`) the same name as a native module pod — Swift module names collide (`MurmurLive` vs `MurmurLiveWidget` broke 0.7.0). Layout changes need an IPA; text/state changes don't.

## Usage events (埋点)

- `track(name, props)` from `lib/track.ts`; batched to `/v1/events` every 30 s and on background; stored at `/opt/voicememo/data/events/YYYY-MM-DD.jsonl`. Summary: `curl -H "authorization: Bearer $ADMIN_TOKEN" https://voice.gugenzzz.top/admin/events?day=YYYY-MM-DD[&name=x]`.
- Props are counts, durations, enums and error codes only — never titles, text, transcripts, names or places. `timed(name, fn)` records ok/ms/code; `device.*` events come from the wrappers. Users can turn it off in Settings.

## The agent (to-dos, routing, chat)

- `/v1/agent` (`server/src/agent.ts`) is one tool loop behind two modes, streamed back as NDJSON (`step` / `route` / `text` / `done` / `error` lines):
  - `capture`: every new memo after transcription (`processEntry` → `captureEntry` in the store). The model picks a route: `journal` (an entry, with any to-do changes on the side), `todo` (only to-do changes; the memo doesn't stay in the journal), `chat` (a question: opens a conversation and streams the answer there) or `pending` (a test or fragment: parked in 待确认 `/pending` with a title and reason). It can also mark the memo as a continuation of an earlier entry (`continues` → `threadId`).
  - `chat`: one conversation turn. It can read and search the journal, search the web, change to-dos and save notes.
- The phone owns the data. The request carries to-dos and the journal; tool calls edit a server-side copy and come back as `ops`. The app applies them together at the end (`applyOps`), with one undo (`lib/runs.ts` `registerUndo`), offered in the toast and the chat ops card. Never apply an op before `done`.
- Live progress: `lib/runs.ts` holds each run's steps, shown on `/processing`, in the pill above the tab bar (`components/Activity.tsx`), on the entry card and in the chat bubble. The store raises `notify()` notices and the root layout turns them into toasts; the store itself never navigates.
- The agent knows the app from `server/src/guide.ts` (`APP_GUIDE`, in the chat system prompt), so it can answer "怎么用…" questions. Any change to a screen, button name or behaviour must update the matching line there; the guide is the agent's only source for how Murmur works.
- Threads: `Entry.threadId` points at the first entry. 接着记一条 (entry page) and follow-up answers create a new entry linked into the thread (never appended to the old one), and the entry page shows 这件事的来龙去脉.
- Entries already routed (`routed`, or legacy `intentChecked`/`skipIntent`) and re-runs only get `/v1/analyze`, so a retry never re-applies to-do changes. `/v1/intent` and `/confirm/[id]` remain only for old builds and legacy inbox items.
- When the agent can't tell a time, `create_todo` carries `ask` (question + options). The to-do row shows it as chips, plus 不设时间; any date/time edit clears it.
- Prompts live next to their schemas: `server/src/agent.ts`, `claude.ts` and `todos.ts` (`TIME_RULES`/`ASK_RULES` are shared). They are Chinese system prompts with field descriptions; interactive calls use low effort. Validate every id or index the model returns against what you sent.
- Reminders are local notifications rebuilt from scratch by `syncTodoReminders` after any change. iOS caps pending notifications at 64; we schedule ≤40. Notices with `remind` trigger `ensureReminderPermission()`.
- Insights (`/insights`) refresh by themselves when stale (`insightsSignature`), on opening and in the background after new entries.

## Traps already hit

- `fetch` is `expo/fetch`: its FormData rejects RN `{ uri }` parts. Append an expo-file-system `File`.
- expo-file-system `copy()`/`move()` are async; deleting the source right after lost recordings once. Use `moveSync`/`copySync` and check the size.
- Self-signed builds have no push entitlement: notifications are local only (`enableRemoteNotifications: false`).
- Face ID `lockout` comes back instantly until the device passcode is entered; `authenticateBiometric` retries with the passcode fallback.
- After a successful Face ID scan iOS keeps the app `inactive` for ~2 s; anything keyed on AppState (the privacy cover) must ignore that window (`isAuthenticating()`).
- iOS 26 turns on full-screen back-swipe for native stacks; we set `fullScreenGestureEnabled: false` on the root Stack so only the left edge goes back. The drawer's own swipe zone is 36 px (`EDGE` in Drawer.tsx); the user found 18 too stingy and 72 too eager.
- Don't present an RN `Modal` while another is still dismissing (iOS drops it); wait ~450 ms.
- Server-side Claude calls must go out through the residential proxy (`server/src/upstream.ts`, `LLM_PROXY`), with no direct fallback; Groq transcription goes direct. Check any new LLM call uses `upstreamFetch`.
- No model identifiers in commit messages or PR text.
