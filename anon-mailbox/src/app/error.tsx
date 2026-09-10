"use client";

/**
 * 路由级错误边界：任何未捕获的渲染/数据异常都会落到这里，
 * 显示友好的错误提示而非白屏/黑屏，用户可点击重试恢复。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">😵</div>
        <h1 className="text-xl font-semibold tracking-tight mb-2">
          页面出了点问题
        </h1>
        <p className="text-sm text-[var(--color-ink-2)] leading-6 mb-6">
          {error.message || "发生了意外错误，请重试。"}
          {error.digest && (
            <span className="block mt-1 text-xs opacity-70">
              错误编号：{error.digest}
            </span>
          )}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={reset}>
            重试
          </button>
          <a href="/" className="btn btn-ghost">
            返回首页
          </a>
        </div>
      </div>
    </div>
  );
}
