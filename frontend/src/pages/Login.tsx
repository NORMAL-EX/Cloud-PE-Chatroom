import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastManager } from '@/components/ui/toast';
import axios from 'axios';
import './Login.css';

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
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    avatar: '',
    verification_code: ''
  });
  
  const countdownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchPublicSettings = async () => {
      try {
        const response = await axios.get('/api/public-settings');
        if (response.data.success) {
          const settings: PublicSettings = response.data.data;
          setRegistrationOpen(settings.registration_open);
          setRequireApproval(settings.require_approval);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toastManager.add({ title: '请填写所有必填字段', type: 'error' });
      return;
    }
    
    setLoading(true);
    const success = await login(formData.email, formData.password);
    setLoading(false);
    if (success) {
      navigate('/');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registrationOpen) {
      toastManager.add({ title: '注册功能已关闭', type: 'error' });
      return;
    }
    
    if (!formData.username || !formData.email || !formData.password || !formData.verification_code) {
      toastManager.add({ title: '请填写所有必填字段', type: 'error' });
      return;
    }
    
    setLoading(true);
    const success = await register(formData);
    setLoading(false);
    if (success) {
      if (requireApproval && registrationOpen) {
        toastManager.add({ title: '注册成功，请等待管理员审核', type: 'info' });
        setIsRegister(false);
      } else if (user) {
        navigate('/');
      }
    }
  };

  const sendVerificationCode = async () => {
    const email = formData.email;
    
    if (!email) {
      toastManager.add({ title: '请先输入邮箱', type: 'error' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toastManager.add({ title: '请输入有效的邮箱地址', type: 'error' });
      return;
    }

    setSendingCode(true);
    try {
      const response = await axios.post('/api/send-verification-code', { email });
      if (response.data.success) {
        toastManager.add({ title: '验证码已发送', type: 'success' });
        setCountdown(60);
      } else {
        toastManager.add({ title: response.data.message, type: 'error' });
      }
    } catch (error: any) {
      if (error.response?.data?.message) {
        toastManager.add({ title: error.response.data.message, type: 'error' });
      } else {
        toastManager.add({ title: '发送失败', type: 'error' });
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="login-container">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="theme-toggle"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
        }}
      >
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </Button>
      
      <Card className="login-card">
        <CardHeader className="login-header">
          <img src="https://p1.cloud-pe.cn/cloud-pe.png" alt="Cloud-PE" className="login-logo" />
          <CardTitle className="text-2xl">Cloud-PE 项目交流群</CardTitle>
        </CardHeader>

        <CardContent>
          {isRegister && registrationOpen ? (
            <form onSubmit={handleRegister} className="login-form">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="username">用户名</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => handleInputChange('username', e.target.value)}
                    placeholder="请输入用户名"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="请输入邮箱"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="请输入密码"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="avatar">头像链接</Label>
                  <Input
                    id="avatar"
                    value={formData.avatar}
                    onChange={(e) => handleInputChange('avatar', e.target.value)}
                    placeholder="请输入头像链接（选填）"
                  />
                </div>
                <div>
                  <Label htmlFor="verification_code">邮箱验证码</Label>
                  <div className="flex gap-2">
                    <Input
                      id="verification_code"
                      value={formData.verification_code}
                      onChange={(e) => handleInputChange('verification_code', e.target.value)}
                      placeholder="请输入验证码"
                      required
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={sendVerificationCode}
                      disabled={countdown > 0 || sendingCode}
                      className="whitespace-nowrap"
                    >
                      {sendingCode ? '发送中...' : getCodeButtonText()}
                    </Button>
                  </div>
                </div>
                {requireApproval && (
                  <div className="text-sm text-muted-foreground">
                    注：注册后需要管理员审核才能登录
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? '注册中...' : '注册'}
                </Button>
                <div className="login-switch">
                  <span className="text-sm">已有账号？</span>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => {
                      setIsRegister(false);
                      setCountdown(0);
                    }}
                    className="p-0 h-auto"
                  >
                    立即登录
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="login-form">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="login-email">邮箱</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="请输入邮箱"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="login-password">密码</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="请输入密码"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? '登录中...' : '登录'}
                </Button>
                {registrationOpen && (
                  <div className="login-switch">
                    <span className="text-sm">没有账号？</span>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        setIsRegister(true);
                        setCountdown(0);
                      }}
                      className="p-0 h-auto"
                    >
                      立即注册
                    </Button>
                  </div>
                )}
                {!registrationOpen && (
                  <div className="login-switch mt-4">
                    <span className="text-sm text-muted-foreground">注册功能已关闭</span>
                  </div>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="login-footer">
        <div className="text-sm text-muted-foreground">© 2025 Cloud-PE Team.</div>
        <div className="text-sm text-muted-foreground">
          <a 
            href="https://beian.miit.gov.cn/#/Integrated/index" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline"
          >
            鲁ICP备2023028944号
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
