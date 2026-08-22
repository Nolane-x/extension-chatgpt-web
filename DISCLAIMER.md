# Miễn trừ trách nhiệm

Vigilume / repository `Nolane-x/gptweb` là một dự án phần mềm độc lập. Tài liệu này nhằm làm rõ phạm vi sử dụng và trách nhiệm; **không phải tư vấn pháp lý**.

## 1. Không liên kết với OpenAI

Vigilume **không phải sản phẩm của OpenAI, không được OpenAI tài trợ, chứng thực, phê duyệt hoặc liên kết chính thức**.

Tên `OpenAI`, `ChatGPT` và các nhãn hiệu, tên sản phẩm hoặc logo liên quan thuộc chủ sở hữu tương ứng. Việc đề cập đến ChatGPT chỉ nhằm mô tả khả năng tương tác kỹ thuật của phần mềm.

## 2. Phần mềm được cung cấp “nguyên trạng”

Phần mềm được cung cấp **“AS IS” / “nguyên trạng”**, không có bảo đảm rằng:

- phần mềm sẽ luôn hoạt động liên tục hoặc không có lỗi;
- mọi selector, DOM structure, network signal hay UI state của ChatGPT sẽ luôn tương thích;
- state inference, recovery recommendation, artifact classification hoặc automation sẽ luôn chính xác tuyệt đối;
- dữ liệu, file, đường dẫn download, checkpoint hoặc context sẽ không bao giờ bị mất, sai hoặc không đầy đủ;
- phần mềm phù hợp cho một mục đích cụ thể, môi trường cụ thể hoặc yêu cầu pháp lý cụ thể.

ChatGPT Web có thể thay đổi theo account, model, feature rollout và thời điểm. `DOM_DRIFT`, evidence fusion và fail-closed policy giúp giảm rủi ro nhưng **không thể loại bỏ hoàn toàn rủi ro tự động hóa sai**.

## 3. Người dùng chịu trách nhiệm về cách sử dụng

Người dùng chịu trách nhiệm tự đảm bảo việc sử dụng Vigilume phù hợp với:

- điều khoản dịch vụ và chính sách của OpenAI/ChatGPT;
- điều khoản của GitHub hoặc dịch vụ bên thứ ba mà người dùng kết nối;
- pháp luật, quy định, chính sách nội bộ và quyền truy cập áp dụng cho người dùng;
- quyền riêng tư, bản quyền, bí mật kinh doanh và dữ liệu của bên thứ ba.

Vigilume không được thiết kế để bypass đăng nhập, rate limit, usage limit, access control hoặc cơ chế bảo vệ của ChatGPT.

## 4. Quyền AI agent và tự động hóa

Khi bật Native Bridge, MCP, automation, recovery, handoff hoặc cấp capability scopes cho AI agent, người dùng đang cho phép phần mềm/agent thực hiện các hành động có thể bao gồm:

- đọc trạng thái hoặc context hiển thị trong ChatGPT;
- mở/focus tab;
- điền hoặc gửi prompt;
- dừng/retry/handoff conversation;
- tải artifact/file;
- tạo hoặc thay đổi task/lease/automation.

Người dùng phải tự lựa chọn scope theo nguyên tắc **least privilege**, kiểm tra agent mà mình kết nối và chịu trách nhiệm về các hành động được thực hiện bằng quyền đã cấp.

Lease, scope guard, audit trail và human takeover là các biện pháp giảm rủi ro; chúng không biến một agent không đáng tin cậy thành an toàn tuyệt đối.

## 5. File và artifact tải về

File do ChatGPT, tool, connector, GitHub hoặc dịch vụ bên thứ ba tạo ra có thể chứa nội dung sai, độc hại hoặc không an toàn.

Vigilume **không tự thực thi file tải về**. Người dùng có trách nhiệm:

- kiểm tra nguồn gốc và nội dung file;
- quét malware khi phù hợp;
- không chạy binary/script không đáng tin cậy;
- kiểm tra license/bản quyền và dữ liệu nhạy cảm trước khi sử dụng hoặc phân phối.

Artifact classification chỉ là tín hiệu kỹ thuật, **không phải chứng nhận file an toàn**.

## 6. Dữ liệu và quyền riêng tư

Vigilume có thể xử lý dữ liệu nhạy cảm trong browser profile, bao gồm chat content hiển thị, Context Vault, download path, task metadata và bearer token của Native Bridge.

Người dùng chịu trách nhiệm bảo vệ máy tính, browser profile, token, bản sao lưu và quyền truy cập hệ điều hành. Một local account/process đã bị compromise có thể vượt ra ngoài threat model của Vigilume.

Không đưa bearer token, browser profile, Context Vault hoặc screenshot chứa dữ liệu nhạy cảm vào issue/log công khai.

## 7. Không dùng làm cơ sở duy nhất cho quyết định rủi ro cao

Không nên dựa duy nhất vào Vigilume, ChatGPT hoặc một AI agent được kết nối để đưa ra hoặc tự động thực hiện các quyết định có hậu quả cao về y tế, pháp lý, tài chính, an toàn, tuyển dụng, quyền truy cập hoặc các lĩnh vực được quản lý khác.

Luôn có bước kiểm tra của con người và chuyên gia phù hợp khi bối cảnh yêu cầu.

## 8. Chi phí, quota và tài khoản

Vigilume không kiểm soát giá, quota, rate limit, usage limit, account restriction hoặc thay đổi sản phẩm của OpenAI hay dịch vụ bên thứ ba.

Người dùng chịu trách nhiệm theo dõi chi phí, quota, tài khoản và hậu quả của các request do automation/agent của mình tạo ra.

## 9. Giới hạn trách nhiệm

**Trong phạm vi tối đa mà pháp luật áp dụng cho phép**, tác giả, maintainer và contributor của dự án không chịu trách nhiệm đối với thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, hệ quả, mất lợi nhuận, mất dữ liệu, mất quyền truy cập tài khoản, gián đoạn công việc hoặc tổn thất phát sinh từ việc sử dụng hoặc không thể sử dụng phần mềm.

Không có nội dung nào trong tài liệu này nhằm loại trừ trách nhiệm mà pháp luật bắt buộc không cho phép loại trừ.

## 10. Tương thích và thay đổi tương lai

Không có cam kết rằng một phiên bản Vigilume sẽ tiếp tục tương thích với mọi phiên bản tương lai của ChatGPT Web, Chrome, MCP, Native Messaging, GitHub hoặc Node.js.

Người dùng nên đọc release notes, kiểm checksum, thử trên môi trường phù hợp và giữ khả năng rollback trước khi dùng automation quan trọng.

---

Bằng việc sử dụng phần mềm, người dùng xác nhận rằng mình hiểu đây là một công cụ tự động hóa/quan sát có quyền mạnh và tự chịu trách nhiệm lựa chọn cấu hình, agent, scope và workflow phù hợp với môi trường của mình.
