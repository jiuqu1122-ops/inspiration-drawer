import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ThreeSceneRenderBoundary extends Component<{
  children: ReactNode;
  resetKey: string;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Three scene renderer failed:', error, info);
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-stone-100 px-6 text-center text-[11px] font-bold text-stone-500 dark:bg-[#242424] dark:text-white/48">
          3D 场景渲染失败。
        </div>
      );
    }
    return this.props.children;
  }
}
