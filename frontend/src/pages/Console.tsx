import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Nav, Typography, Button, Avatar } from '@douyinfe/semi-ui';
import {
  IconUserGroup, 
  IconSetting, 
  IconHome,
  IconMoon,
  IconSun,
  IconCheckCircleStroked
} from '@douyinfe/semi-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PendingUsers from '../components/console/PendingUsers';
import UserManagement from '../components/console/UserManagement';
import Settings from '../components/console/Settings';
import './Console.css';

const { Header, Sider, Content, Footer } = Layout;
const { Title, Text } = Typography;

const Console: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const getSelectedKeys = () => {
    const path = location.pathname;
    if (path.includes('pending')) return ['pending'];
    if (path.includes('users')) return ['users'];
    if (path.includes('settings')) return ['settings'];
    return ['pending'];
  };

  const navItems = [
    {
      itemKey: 'pending',
      text: '待审核用户',
      icon: <IconCheckCircleStroked />,
      onClick: () => navigate('/console/pending')
    },
    {
      itemKey: 'users',
      text: '用户管理',
      icon: <IconUserGroup />,
      onClick: () => navigate('/console/users')
    },
    {
      itemKey: 'settings',
      text: '系统设置',
      icon: <IconSetting />,
      onClick: () => navigate('/console/settings')
    }
  ];

  const getAvatar = () => {
    if (user?.avatar) {
      return <Avatar src={user.avatar} size="small" />;
    }
    
    const name = user?.username || '?';
    const firstChar = name[0].toUpperCase();
    
    return (
      <Avatar 
        size="small" 
        style={{ 
          backgroundColor: 'var(--semi-color-primary)',
          color: 'white'
        }}
      >
        {firstChar}
      </Avatar>
    );
  };

  return (
    <Layout className="console-layout">
      <Header className="console-header">
        <div className="header-content">
          <div className="header-left">
            <img 
              src="https://p1.cloud-pe.cn/cloud-pe.png" 
              alt="Cloud-PE" 
              className="console-logo"
              onClick={() => navigate('/')}
              style={{ cursor: 'pointer' }}
            />
            <Title heading={4} style={{ margin: 0 }}>管理后台</Title>
          </div>
          <div className="header-right">
            <Button
              theme="borderless"
              icon={theme === 'light' ? <IconMoon /> : <IconSun />}
              onClick={toggleTheme}
            />
            <Button
              theme="borderless"
              icon={<IconHome />}
              onClick={() => navigate('/')}
            >
              返回聊天
            </Button>
            <div className="user-info">
              {getAvatar()}
              <Text>{user?.username}</Text>
            </div>
            <Button theme="borderless" onClick={logout}>
              退出登录
            </Button>
          </div>
        </div>
      </Header>

      <Layout className="console-body">
        <Sider className="console-sider">
          <Nav
            selectedKeys={getSelectedKeys()}
            items={navItems}
            footer={{
              collapseButton: true,
            }}
            isCollapsed={collapsed}
            onCollapseChange={setCollapsed}
          />
        </Sider>

        <Content className="console-content">
          <Routes>
            <Route path="/" element={<PendingUsers />} />
            <Route path="/pending" element={<PendingUsers />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>

      <Footer className="console-footer">
        <Text type="tertiary">© 2025 Cloud-PE Team.</Text>
        <Text type="tertiary">
          <a 
            href="https://beian.miit.gov.cn/#/Integrated/index" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            鲁ICP备2023028946号
          </a>
        </Text>
      </Footer>
    </Layout>
  );
};

export default Console;