# Vigilume v0.3.1 — Product identity & safety migration

V0.3.1 là bản **branding, disclaimer và compatibility hardening**. Runtime Task Orchestrator/Mission Control/MCP 39 tools của v0.3.0 vẫn được giữ nguyên; thay đổi lớn nhất là sản phẩm hiện mang tên **Vigilume**, trong khi repository tiếp tục là `Nolane-x/gptweb`.

## Vì sao đổi tên?

Tên sản phẩm được tách khỏi tên repository và khỏi các nhãn gắn trực tiếp với GPT/OpenAI. Mục tiêu là có một product identity độc lập hơn, trong khi lịch sử GitHub/release và đường dẫn repo vẫn ổn định.

> Việc chọn tên Vigilume dựa trên kiểm tra va chạm công khai ở mức thực dụng, **không phải kết luận tra cứu nhãn hiệu pháp lý**. Người phát hành vẫn nên thực hiện trademark/legal clearance phù hợp trước khi thương mại hóa ở quy mô lớn.

## Product branding mới

Các bề mặt hiện hành đổi sang **Vigilume**:

- Chrome extension name / short name;
- Side Panel title + brand header;
- Vietnamese/English locale identity;
- package metadata;
- README / SECURITY / protocol docs;
- Native Bridge server identity/logs;
- Native Messaging manifest;
- release titles và ZIP filenames.

Repository vẫn là:

```text
https://github.com/Nolane-x/gptweb
```

## Native Bridge migration

Native Messaging host chính:

```text
com.vigilume.bridge
```

Extension v0.3.1 thử host mới trước. Để người đang dùng companion v0.3.0 không bị ngắt bridge ngay lập tức, extension có **fallback migration** tới:

```text
com.nolane.sentinel_bridge
```

Fallback này là legacy technical identifier, không phải product branding.

Installer v0.3.1:

- chỉ đăng ký `com.vigilume.bridge`;
- dùng launcher `vigilume-native-host` / `vigilume-native-host.bat`;
- dùng runtime `vigilume_bridge.mjs`;
- token mới nằm tại `~/.vigilume/bridge-token.json`;
- hỗ trợ `VIGILUME_PORT` và `VIGILUME_CHROME_FLAVOR`;
- uninstaller dọn cả registration hiện tại và legacy nếu tồn tại.

## Miễn trừ trách nhiệm mới

Thêm `DISCLAIMER.md` đầy đủ và bản tóm tắt ngay gần đầu README.

Nội dung chính:

- Vigilume là dự án độc lập, không phải sản phẩm của OpenAI và không được OpenAI tài trợ/chứng thực/phê duyệt;
- phần mềm được cung cấp **AS IS**;
- ChatGPT Web có thể thay đổi và không có bảo đảm tương thích tuyệt đối;
- người dùng chịu trách nhiệm về capability scopes, AI agent, automation, prompt/action và việc tuân thủ điều khoản/pháp luật;
- artifact classification không đồng nghĩa file an toàn;
- Vigilume không tự execute file tải về;
- không nên dùng Vigilume/AI làm nguồn duy nhất cho quyết định rủi ro cao;
- người dùng chịu trách nhiệm về quota/chi phí/tài khoản;
- giới hạn trách nhiệm áp dụng trong phạm vi pháp luật cho phép.

`DISCLAIMER.md` được đóng gói vào source ZIP và Native Bridge ZIP.

## Release artifact names

Từ v0.3.1:

```text
vigilume-v0.3.1-extension.zip
vigilume-v0.3.1-native-bridge.zip
vigilume-v0.3.1-source.zip
SHA256SUMS.txt
```

Artifact v0.3.0 cũ không bị đổi tên hoặc sửa checksum; lịch sử release vẫn bất biến.

## Compatibility identifiers được giữ lại có chủ đích

Một số ID nội bộ cũ như IndexedDB name hoặc legacy Native Messaging fallback có thể tiếp tục chứa chuỗi từ phiên bản trước để:

- không làm mất Context Vault/task graph;
- không làm đứt người dùng đang nâng cấp Native Bridge.

Chúng không được hiển thị như product identity và không phải security authority.

## Verification additions

V0.3.1 thêm regression/verification gate cho:

- canonical product name `Vigilume`;
- repo identity `Nolane-x/gptweb`;
- package name `vigilume-browser-runtime`;
- Side Panel/locales branding;
- Native Bridge `vigilume-bridge` identity;
- primary `com.vigilume.bridge` + explicit legacy fallback;
- installer/uninstaller migration semantics;
- Vigilume ZIP filenames;
- `DISCLAIMER.md` trong release packages;
- cấm runtime native file mang branding cũ tồn tại trong current package.

## Những capability giữ nguyên

- Deep Observe DOM + CDP;
- `DEEP_THINKING` liveness guard;
- `DOM_DRIFT` fail-closed diagnostics;
- Safe Prompt Queue + single-flight scheduled actions;
- Context Vault + conversation handoff;
- Artifact Intelligence + bulk download;
- Task Orchestrator + worker lease;
- resumable checkpoint graph;
- Recovery Planner;
- NUI Mission Control;
- 39 MCP tools;
- loopback-only Native Bridge + bearer token;
- deterministic ZIP + SHA-256 release pipeline.

## Nâng cấp

1. Cài extension `vigilume-v0.3.1-extension.zip`.
2. Nếu dùng Native Bridge, giải nén `vigilume-v0.3.1-native-bridge.zip` và chạy lại installer với Extension ID hiện tại.
3. Xác nhận Cổng AI kết nối qua host `com.vigilume.bridge`.
4. Có thể chạy uninstaller để dọn registration legacy còn sót.

---

**Vigilume là phần mềm độc lập, không liên kết hay được OpenAI chứng thực. Xem `DISCLAIMER.md` trước khi bật automation hoặc cấp quyền cho AI agent.**
