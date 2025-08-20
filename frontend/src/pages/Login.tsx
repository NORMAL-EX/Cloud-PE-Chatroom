import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Button, Toast, Typography, Card } from '@douyinfe/semi-ui';
import { IconMoon, IconSun } from '@douyinfe/semi-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import axios from 'axios';
import './Login.css';

const { Title, Text } = Typography;

interface PublicSettings {
  registration_open: boolean;
  require_approval: boolean;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const formRef = useRef<any>();
  const countdownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    // 获取公开设置
    const fetchPublicSettings = async () => {
      try {
        const response = await axios.get('/api/public-settings');
        if (response.data.success) {
          const settings: PublicSettings = response.data.data;
          setRegistrationOpen(settings.registration_open);
          setRequireApproval(settings.require_approval);
          // 如果注册关闭了，确保用户在登录模式
          if (!settings.registration_open && isRegister) {
            setIsRegister(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch public settings');
      }
    };

    fetchPublicSettings();
  }, [isRegister]);

  useEffect(() => {
    // 倒计时逻辑
    if (countdown > 0) {
      countdownTimerRef.current = window.setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, [countdown]);

  const handleLogin = async (values: any) => {
    setLoading(true);
    const success = await login(values.email, values.password);
    setLoading(false);
    if (success) {
      navigate('/');
    }
  };

  const handleRegister = async (values: any) => {
    if (!registrationOpen) {
      Toast.error('注册功能已关闭');
      return;
    }
    
    setLoading(true);
    const success = await register(values);
    setLoading(false);
    if (success) {
      if (requireApproval && registrationOpen) {
        // 如果需要审核，显示提示
        Toast.info('注册成功，请等待管理员审核');
        setIsRegister(false);
      } else if (user) {
        navigate('/');
      }
    }
  };

  const sendVerificationCode = async () => {
    // 获取 form 的值
    const values = formRef.current?.formApi?.getValues();
    const email = values?.email;
    
    if (!email) {
      Toast.error('请先输入邮箱');
      return;
    }

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Toast.error('请输入有效的邮箱地址');
      return;
    }

    setSendingCode(true);
    try {
      const response = await axios.post('/api/send-verification-code', { email });
      if (response.data.success) {
        Toast.success('验证码已发送');
        // 开始60秒倒计时
        setCountdown(60);
      } else {
        Toast.error(response.data.message);
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        Toast.error(error.response.data.message);
      } else {
        Toast.error('发送失败');
      }
    } finally {
      setSendingCode(false);
    }
  };

  const getCodeButtonText = () => {
    if (countdown > 0) {
      return `${countdown}s`;
    }
    return '发送验证码';
  };

  return (
    <div className="login-container">
      <Button
        theme="borderless"
        icon={theme === 'light' ? <IconMoon /> : <IconSun />}
        onClick={toggleTheme}
        className="theme-toggle"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
        }}
      />
      
      <Card className="login-card">
        <div className="login-header">
          <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" className="login-logo" />
          <Title heading={2}>Cloud-PE 项目交流群</Title>
        </div>

        {isRegister && registrationOpen ? (
          <Form 
            ref={formRef}
            onSubmit={handleRegister} 
            className="login-form"
          >
            <Form.Input
              field="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
              placeholder="请输入用户名"
            />
            <Form.Input
              field="email"
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' }
              ]}
              placeholder="请输入邮箱"
            />
            <Form.Input
              field="password"
              label="密码"
              type="password"
              rules={[{ required: true, message: '请输入密码' }]}
              placeholder="请输入密码"
            />
            <Form.Input
              field="avatar"
              label="头像链接"
              placeholder="请输入头像链接（选填）"
            />
            <Form.Input
              field="verification_code"
              label="邮箱验证码"
              rules={[{ required: true, message: '请输入验证码' }]}
              placeholder="请输入验证码"
              suffix={
                <Button
                  theme="borderless"
                  loading={sendingCode}
                  disabled={countdown > 0}
                  onClick={sendVerificationCode}
                  style={{ minWidth: '100px' }}
                >
                  {getCodeButtonText()}
                </Button>
              }
            />
            {requireApproval && (
              <div style={{ marginBottom: 16 }}>
                <Text type="tertiary" size="small">
                  注：注册后需要管理员审核才能登录
                </Text>
              </div>
            )}
            <Button
              theme="solid"
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              注册
            </Button>
            <div className="login-switch">
              <Text>已有账号？</Text>
              <Button
                theme="borderless"
                type="primary"
                onClick={() => {
                  setIsRegister(false);
                  setCountdown(0); // 切换时重置倒计时
                }}
              >
                立即登录
              </Button>
            </div>
          </Form>
        ) : (
          <Form onSubmit={handleLogin} className="login-form">
            <Form.Input
              field="email"
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' }
              ]}
              placeholder="请输入邮箱"
            />
            <Form.Input
              field="password"
              label="密码"
              type="password"
              rules={[{ required: true, message: '请输入密码' }]}
              placeholder="请输入密码"
            />
            <Button
              theme="solid"
              type="primary"
              htmlType="submit"
              loading={loading}
              block
            >
              登录
            </Button>
            {registrationOpen && (
              <div className="login-switch">
                <Text>没有账号？</Text>
                <Button
                  theme="borderless"
                  type="primary"
                  onClick={() => {
                    setIsRegister(true);
                    setCountdown(0); // 切换时重置倒计时
                  }}
                >
                  立即注册
                </Button>
              </div>
            )}
            {!registrationOpen && (
              <div className="login-switch" style={{ marginTop: 16 }}>
                <Text type="tertiary">注册功能已关闭</Text>
              </div>
            )}
          </Form>
        )}
      </Card>

      <div className="login-footer">
        <Text type="tertiary">© 2025 Cloud-PE Team.</Text>
        <Text type="tertiary">
          <a 
            href="https://beian.miit.gov.cn/#/Integrated/index" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            鲁ICP备2023028944号
          </a>
        </Text>
      </div>
    </div>
  );
};

export default Login;