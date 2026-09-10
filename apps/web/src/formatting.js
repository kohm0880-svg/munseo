/**
 * 현재는 contenteditable 명령을 사용하지만 UI는 이 함수만 호출합니다.
 * Tiptap/ProseMirror 등으로 교체할 때 이 어댑터만 바꾸면 됩니다.
 */
export function runInlineCommand(command) {
  if (!['bold', 'italic', 'underline'].includes(command)) return;
  document.execCommand(command, false, null);
}
