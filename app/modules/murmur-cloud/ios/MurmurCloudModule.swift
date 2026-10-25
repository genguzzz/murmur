import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

// A folder the user picked in the Files app (typically in iCloud Drive). The app keeps
// a bookmark so access survives relaunches, then reads and writes files under it with
// file coordination, which also makes iCloud download items that aren't local yet.
// No iCloud entitlement is involved, so re-signing the IPA keeps working.

final class CloudException: GenericException<String> {
  override var reason: String { param }
}

private final class PickerDelegate: NSObject, UIDocumentPickerDelegate {
  let done: ([URL]?) -> Void
  init(_ done: @escaping ([URL]?) -> Void) { self.done = done }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls) }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done(nil) }
}

public class MurmurCloudModule: Module {
  private var root: URL?
  private var picker: PickerDelegate?

  private func url(_ rel: String) throws -> URL {
    guard let root else { throw CloudException("还没有连接同步文件夹") }
    return rel.isEmpty ? root : root.appendingPathComponent(rel)
  }

  private func use(_ url: URL) {
    if let old = root, old != url { old.stopAccessingSecurityScopedResource() }
    root = url
  }

  private static func bookmark(_ url: URL) throws -> String {
    try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil).base64EncodedString()
  }

  private static func isICloud(_ url: URL) -> Bool {
    (try? url.resourceValues(forKeys: [.isUbiquitousItemKey]).isUbiquitousItem) ?? false
  }

  // Older iOS keeps not-yet-downloaded iCloud files as ".name.icloud" placeholders.
  private static func placeholder(for url: URL) -> URL {
    url.deletingLastPathComponent().appendingPathComponent(".\(url.lastPathComponent).icloud")
  }

  private static func exists(_ url: URL) -> Bool {
    FileManager.default.fileExists(atPath: url.path) || FileManager.default.fileExists(atPath: placeholder(for: url).path)
  }

  // Ask iCloud for the file and wait (up to `timeout` s) until it's on disk.
  private static func download(_ url: URL, timeout: Double = 60) async {
    let fm = FileManager.default
    if fm.fileExists(atPath: url.path) && !fm.fileExists(atPath: placeholder(for: url).path) { return }
    try? fm.startDownloadingUbiquitousItem(at: url)
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if fm.fileExists(atPath: url.path) {
        let status = try? url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]).ubiquitousItemDownloadingStatus
        if status == nil || status == .current || status == .downloaded { return }
      }
      try? await Task.sleep(nanoseconds: 400_000_000)
    }
  }

  private static func coordinate(read url: URL, _ body: (URL) throws -> Void) throws {
    var coordErr: NSError?
    var bodyErr: Error?
    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordErr) { u in
      do { try body(u) } catch { bodyErr = error }
    }
    if let e = coordErr ?? bodyErr { throw CloudException(e.localizedDescription) }
  }

  private static func coordinate(write url: URL, options: NSFileCoordinator.WritingOptions, _ body: (URL) throws -> Void) throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    var coordErr: NSError?
    var bodyErr: Error?
    NSFileCoordinator().coordinate(writingItemAt: url, options: options, error: &coordErr) { u in
      do { try body(u) } catch { bodyErr = error }
    }
    if let e = coordErr ?? bodyErr { throw CloudException(e.localizedDescription) }
  }

  public func definition() -> ModuleDefinition {
    Name("MurmurCloud")

    // Shows the folder picker; resolves { bookmark, name, iCloud } or null if cancelled.
    AsyncFunction("pickFolder") { (promise: Promise) in
      let controller = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
      controller.allowsMultipleSelection = false
      let delegate = PickerDelegate { [weak self] urls in
        guard let self else { return }
        self.picker = nil
        guard let url = urls?.first else {
          promise.resolve(nil)
          return
        }
        let accessed = url.startAccessingSecurityScopedResource()
        do {
          let mark = try Self.bookmark(url)
          self.use(url)
          promise.resolve(["bookmark": mark, "name": url.lastPathComponent, "iCloud": Self.isICloud(url)])
        } catch {
          if accessed { url.stopAccessingSecurityScopedResource() }
          promise.reject(CloudException("无法记住这个文件夹：\(error.localizedDescription)"))
        }
      }
      self.picker = delegate
      controller.delegate = delegate
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        self.picker = nil
        promise.reject(CloudException("无法打开文件夹选择器"))
        return
      }
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    // Re-opens the remembered folder on launch. Returns a fresh bookmark when the old one went stale.
    AsyncFunction("open") { (bookmark: String) throws -> [String: Any] in
      guard let data = Data(base64Encoded: bookmark) else { throw CloudException("文件夹授权已损坏，请重新选择") }
      var stale = false
      let url: URL
      do {
        url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
      } catch {
        throw CloudException("找不到之前选择的文件夹，请重新选择")
      }
      guard url.startAccessingSecurityScopedResource() else { throw CloudException("没有访问这个文件夹的权限，请重新选择") }
      self.use(url)
      var result: [String: Any] = ["name": url.lastPathComponent, "iCloud": Self.isICloud(url)]
      if stale, let fresh = try? Self.bookmark(url) { result["bookmark"] = fresh }
      return result
    }

    AsyncFunction("close") { () in
      self.root?.stopAccessingSecurityScopedResource()
      self.root = nil
    }

    AsyncFunction("exists") { (rel: String) throws -> Bool in
      return Self.exists(try self.url(rel))
    }

    // Entries of a sub-folder: [{ name, size }] (size -1 while still only in iCloud).
    AsyncFunction("list") { (rel: String) throws -> [[String: Any]] in
      let dir = try self.url(rel)
      let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
      return names.compactMap { raw -> [String: Any]? in
        if raw.hasPrefix(".") && raw.hasSuffix(".icloud") {
          return ["name": String(raw.dropFirst().dropLast(7)), "size": -1]
        }
        if raw.hasPrefix(".") { return nil }
        let attrs = try? FileManager.default.attributesOfItem(atPath: dir.appendingPathComponent(raw).path)
        let size = (attrs?[.size] as? NSNumber)?.intValue ?? 0
        return ["name": raw, "size": size]
      }
    }

    AsyncFunction("readText") { (rel: String) async throws -> String? in
      let src = try self.url(rel)
      guard Self.exists(src) else { return nil }
      await Self.download(src)
      var text: String?
      try Self.coordinate(read: src) { u in text = try String(contentsOf: u, encoding: .utf8) }
      return text
    }

    AsyncFunction("writeText") { (rel: String, text: String) throws in
      let dest = try self.url(rel)
      try Self.coordinate(write: dest, options: .forReplacing) { u in
        try Data(text.utf8).write(to: u, options: .atomic)
      }
    }

    // Local file (file:// URI) → folder.
    AsyncFunction("copyIn") { (localUri: String, rel: String) throws in
      guard let src = URL(string: localUri), src.isFileURL else { throw CloudException("无效的本地文件") }
      let dest = try self.url(rel)
      try Self.coordinate(write: dest, options: .forReplacing) { u in
        if FileManager.default.fileExists(atPath: u.path) { try FileManager.default.removeItem(at: u) }
        try FileManager.default.copyItem(at: src, to: u)
      }
    }

    // Folder → local file (file:// URI), downloading from iCloud first if needed.
    AsyncFunction("copyOut") { (rel: String, localUri: String) async throws in
      let src = try self.url(rel)
      guard let dest = URL(string: localUri), dest.isFileURL else { throw CloudException("无效的本地路径") }
      guard Self.exists(src) else { throw CloudException("同步文件夹里没有这个文件") }
      await Self.download(src, timeout: 180)
      try Self.coordinate(read: src) { u in
        try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: dest.path) { try FileManager.default.removeItem(at: dest) }
        try FileManager.default.copyItem(at: u, to: dest)
      }
    }

    AsyncFunction("remove") { (rel: String) throws in
      let target = try self.url(rel)
      guard FileManager.default.fileExists(atPath: target.path) else { return }
      try Self.coordinate(write: target, options: .forDeleting) { u in try FileManager.default.removeItem(at: u) }
    }
  }
}
