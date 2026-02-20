import type { ViewMode } from './Layout';

interface TopBarProps {
  onToggleSidebar: () => void;
  currentModule: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export default function TopBar({ onToggleSidebar, currentModule, viewMode, onViewModeChange }: TopBarProps) {
  return (
    <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
      <button
        onClick={onToggleSidebar}
        className="text-gray-300 hover:text-white p-1"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1 className="text-white font-semibold text-lg">WinStride</h1>
      <span className="text-gray-400 text-sm">/ {currentModule}</span>

      <div className="ml-auto flex bg-gray-800 rounded-lg p-0.5 border border-gray-700">
        <button
          onClick={() => onViewModeChange('dashboard')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'dashboard'
              ? 'bg-gray-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'list'
              ? 'bg-gray-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          List View
        </button>
        <button
          onClick={() => onViewModeChange('graph')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'graph'
              ? 'bg-gray-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          Graph View
        </button>
        <button
          onClick={() => onViewModeChange('timeline')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            viewMode === 'timeline'
              ? 'bg-gray-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          Timeline
        </button>
      </div>
    </header>
  );
}
