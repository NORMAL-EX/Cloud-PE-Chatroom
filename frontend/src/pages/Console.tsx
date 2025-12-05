import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun, Users, Settings } from 'lucide-react';
import { CheckCircle } from '@/components/icon/CheckCircle';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from '@/components/ui/menu';
import PendingUsers from '../components/console/PendingUsers';
import UserManagement from '../components/console/UserManagement';
import ConsoleSettings from '../components/console/Settings';
import './Console.css';

const Console: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.includes('pending')) return ['pending'];
    if (path.includes('users')) return ['users'];
    if (path.includes('settings')) return ['settings'];
    return ['pending'];
  };

  const getAvatar = () => {
    if (user?.avatar) {
      return <Avatar className="w-8 h-8"><img src={user.avatar} alt={user.username} /></Avatar>;
    }
    
    const name = user?.username || '?';
    const firstChar = name[0].toUpperCase();
    
    return (
      <Avatar className="w-8 h-8 bg-primary text-white">
        {firstChar}
      </Avatar>
    );
  };

  const selectedKey = getSelectedKeys()[0];

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
            <h4 className="text-lg font-semibold m-0">管理后台</h4>
          </div>
          <div className="header-right">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
            <Menu>
              <MenuTrigger render={<button className="cursor-pointer">{getAvatar()}</button>} />
              <MenuPopup>
                <MenuItem disabled className="cursor-default font-semibold">
                  {user?.username}
                </MenuItem>
                <MenuSeparator />
                <MenuItem onClick={() => navigate('/')}>
                  返回聊天
                </MenuItem>
                <MenuItem onClick={logout}>
                  退出登录
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        </div>
      </header>

      <div className="console-body">
        <aside className="console-sider">
          <nav className="flex flex-col gap-1 p-2">
            <Button
              variant={selectedKey === 'pending' ? 'secondary' : 'ghost'}
              className="justify-start"
              onClick={() => navigate('/console/pending')}
            >
              <CheckCircle size={18} className="mr-2" />
              待审核用户
            </Button>
            <Button
              variant={selectedKey === 'users' ? 'secondary' : 'ghost'}
              className="justify-start"
              onClick={() => navigate('/console/users')}
            >
              <Users className="mr-2 h-4 w-4" />
              用户管理
            </Button>
            <Button
              variant={selectedKey === 'settings' ? 'secondary' : 'ghost'}
              className="justify-start"
              onClick={() => navigate('/console/settings')}
            >
              <Settings className="mr-2 h-4 w-4" />
              系统设置
            </Button>
          </nav>
        </aside>

        <main className="console-content">
          <Routes>
            <Route path="/" element={<PendingUsers />} />
            <Route path="/pending" element={<PendingUsers />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/settings" element={<ConsoleSettings />} />
          </Routes>
        </main>
      </div>

      <footer className="console-footer">
        <span className="text-sm text-muted-foreground">© 2025 Cloud-PE Team.</span>
        <span className="text-sm text-muted-foreground">
          <a 
            href="https://beian.miit.gov.cn/#/Integrated/index" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline"
          >
            鲁ICP备2023028946号
          </a>
        </span>
      </footer>
    </div>
  );
};

export default Console;
