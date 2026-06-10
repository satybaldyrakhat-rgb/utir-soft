import { Component, ReactNode } from 'react';

// Last line of defence against a blank white screen: any render-time throw
// anywhere in the tree is caught here and turned into a friendly screen with
// a reload button, instead of an unmounted (white) page with nothing to do.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface in console for debugging; production crash details still log.
    console.error('Render crash caught by ErrorBoundary:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-lg font-medium text-gray-900">Что-то пошло не так</h1>
          <p className="text-sm text-gray-500">
            Произошла ошибка при отображении страницы. Попробуйте перезагрузить — ваши данные не потеряны.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 transition-colors"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
