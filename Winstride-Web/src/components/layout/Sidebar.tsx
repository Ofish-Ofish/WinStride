import { NavLink } from 'react-router-dom';

interface SidebarProps {
  open: boolean;
}

const logTypes = [
  { name: 'Security', path: '/security' },
  { name: 'System', path: '/system' },
  { name: 'Application', path: '/application' },
];

export default function Sidebar({ open }: SidebarProps) {
  return (
    <aside
      className={`bg-gray-850 border-r border-gray-700 bg-gray-900 transition-all duration-200 overflow-hidden ${
        open ? 'w-52' : 'w-0'
      }`}
    >
      <nav className="p-4 flex flex-col gap-1">
        <span className="text-xs text-gray-500 uppercase tracking-wider mb-2">Log Types</span>
        {logTypes.map((log) => (
          <NavLink
            key={log.path}
            to={log.path}
            className={({ isActive }) =>
              `px-3 py-2 rounded text-sm ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            {log.name}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
