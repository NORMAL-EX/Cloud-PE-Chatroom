import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun, Users, Settings as SettingsIcon } from 'lucide-react';
import { CheckCircle } from '@/components/icon/CheckCircle';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/menu';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PendingUsers from '../components/console/PendingUsers';
import UserManagement from '../components/console/UserManagement';
import Settings from '../components/console/Settings';
import './Console.css';

const Console: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.includes('pending')) return 'pending';
    if (path.includes('users')) return 'users';
    if (path.includes('settings')) return 'settings';
    return 'pending';
  };

  const navItems = [
    {
      key: 'pending',
      label: '待审核用户',
      icon: CheckCircle,
      onClick: () => navigate('/console/pending')
    },
    {
      key: 'users',
      label: '用户管理',
      icon: Users,
      onClick: () => navigate('/console/users')
    },
    {
      key: 'settings',
      label: '系统设置',
      icon: SettingsIcon,
      onClick: () => navigate('/console/settings')
    }
  ];

  const getAvatar = () => {
    if (user?.avatar) {
      return (
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.avatar} alt={user.username} />
          <AvatarFallback>{user.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
      );
    }

    const name = user?.username || '?';
    const firstChar = name[0].toUpperCase();

    return (
      <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
        <AvatarFallback>{firstChar}</AvatarFallback>
      </Avatar>
    );
  };

  return (
    <div className="console-layout">
      <header className="console-header">
        <div className="header-content">
          <div className="header-left">
            <img
              src="https://p1.cloud-pe.cn/cloud-pe.png"
              alt="Cloud-PE"
              className="console-logo"
              onClick={() => navigate('/')}
              style={{ cursor: 'pointer' }}
            />
            <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>管理后台</h4>
          </div>
          <div className="header-right">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {getAvatar()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled style={{ opacity: 1, cursor: 'default' }}>
                  <span style={{ fontWeight: 600 }}>{user?.username}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/')}>
                  返回聊天
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="console-body">
        <aside className="console-sider" data-collapsed={collapsed}>
          <nav className="console-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isSelected = getSelectedKeys() === item.key;
              return (
                <button
                  key={item.key}
                  className={`nav-item ${isSelected ? 'selected' : ''}`}
                  onClick={item.onClick}
                  data-collapsed={collapsed}
                >
                  <Icon size={20} />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
          <div className="nav-footer">
            <button
              className="collapse-button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: collapsed ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s'
                }}
              >
                <path d="M10 12L6 8l4-4" />
              </svg>
            </button>
          </div>
        </aside>

        <main className="console-content">
          <Routes>
            <Route path="/" element={<PendingUsers />} />
            <Route path="/pending" element={<PendingUsers />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>

      <footer className="console-footer">
        <span style={{ color: 'var(--muted-foreground, #6b7280)', fontSize: '0.875rem' }}>
          © 2025 Cloud-PE Team.
        </span>
        <span style={{ color: 'var(--muted-foreground, #6b7280)', fontSize: '0.875rem' }}>
          <a
            href="https://beian.miit.gov.cn/#/Integrated/index"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            鲁ICP备2023028946号
          </a>
        </span>
      </footer>
    </div>
  );
};

export default Console;
